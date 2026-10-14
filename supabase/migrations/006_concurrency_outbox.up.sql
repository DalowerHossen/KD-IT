-- path: supabase/migrations/006_concurrency_outbox.up.sql
-- Step 02 migration 006: concurrency primitives - idempotent write windows,
-- transactional outbox, atomic fixed-window rate limiting, SKIP-LOCKED
-- job queue, and named leader locks. RPCs are server-boundary only.

create table app.idempotency_keys (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  scope text not null check (scope ~ '^[a-z][a-z0-9_.:-]{1,80}$'),
  idempotency_key text not null check (idempotency_key ~ '^[a-zA-Z0-9_.:-]{8,128}$'),
  request_hash char(64) not null,
  status text not null default 'in_flight' check (status in ('in_flight', 'completed', 'failed')),
  response jsonb null check (response is null or jsonb_typeof(response) = 'object'),
  locked_until timestamptz not null,
  expires_at timestamptz not null
);

comment on table app.idempotency_keys is 'Exactly-once mutation windows per (company, scope, key); record keeps the response for deterministic replays.';

create unique index idempotency_company_scope_key
  on app.idempotency_keys (company_id, scope, idempotency_key)
  where deleted_at is null;

-- Start or join an idempotency window. Returns status and (on replay) the
-- recorded response so retries complete identically.
create or replace function app.idempotency_begin(
  p_company_id uuid,
  p_scope text,
  p_key text,
  p_request_hash char(64),
  p_lock_ttl interval default interval '10 minutes',
  p_entry_ttl interval default interval '24 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.idempotency_keys%rowtype;
begin
  insert into app.idempotency_keys (
    company_id, scope, idempotency_key, request_hash, locked_until, expires_at
  )
  values (
    p_company_id, p_scope, p_key, p_request_hash,
    clock_timestamp() + greatest(p_lock_ttl, interval '30 seconds'),
    clock_timestamp() + greatest(p_entry_ttl, interval '1 hour')
  )
  on conflict (company_id, scope, idempotency_key) where deleted_at is null do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object('status', 'started', 'id', v_row.id);
  end if;

  select * into v_row
  from app.idempotency_keys k
  where k.company_id = p_company_id
    and k.scope = p_scope
    and k.idempotency_key = p_key
    and k.deleted_at is null
  for update;

  if v_row.status = 'completed' then
    if v_row.request_hash = p_request_hash then
      return jsonb_build_object('status', 'replay', 'id', v_row.id, 'response', v_row.response);
    end if;
    return jsonb_build_object('status', 'conflict', 'reason', 'request_mismatch');
  end if;

  if v_row.status = 'failed' or v_row.locked_until <= clock_timestamp() then
    -- Stale lock or prior failure: rewrite this attempt as the owner.
    update app.idempotency_keys k
    set status = 'in_flight', request_hash = p_request_hash,
        locked_until = clock_timestamp() + greatest(p_lock_ttl, interval '30 seconds'),
        response = null
    where k.id = v_row.id;
    return jsonb_build_object('status', 'started', 'id', v_row.id);
  end if;

  return jsonb_build_object('status', 'conflict', 'reason', 'in_flight_until', 'locked_until', v_row.locked_until);
end;
$fn$;

create or replace function app.idempotency_complete(
  p_company_id uuid,
  p_scope text,
  p_key text,
  p_response jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  update app.idempotency_keys k
  set status = 'completed', response = coalesce(p_response, '{}'::jsonb)
  where k.company_id = p_company_id
    and k.scope = p_scope
    and k.idempotency_key = p_key
    and k.deleted_at is null
    and k.status = 'in_flight';
  if not found then
    raise exception 'no in-flight idempotent window to complete' using errcode = 'P0002';
  end if;
end;
$fn$;

create or replace function app.idempotency_fail(
  p_company_id uuid,
  p_scope text,
  p_key text
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  update app.idempotency_keys k
  set status = 'failed', locked_until = clock_timestamp()
  where k.company_id = p_company_id
    and k.scope = p_scope
    and k.idempotency_key = p_key
    and k.deleted_at is null
    and k.status = 'in_flight';
end;
$fn$;

create table app.outbox_events (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  topic text not null check (topic ~ '^[a-z][a-z0-9_.:-]{1,80}$'),
  payload jsonb null check (payload is null or jsonb_typeof(payload) = 'object'),
  correlation_id uuid null,
  dedupe_key text null,
  occurred_at timestamptz not null default clock_timestamp(),
  publish_after timestamptz not null default clock_timestamp(),
  published_at timestamptz null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text null
);

comment on table app.outbox_events is 'Transactional outbox: insert in the same tx as domain writes; workers publish deterministically (startup recovery guaranteed).';

create unique index outbox_dedupe_key_idx
  on app.outbox_events (company_id, topic, dedupe_key)
  where dedupe_key is not null and published_at is null and deleted_at is null;

create index outbox_pending_idx
  on app.outbox_events (publish_after)
  where published_at is null;

-- Claim pending events with FOR UPDATE SKIP LOCKED so parallel publishers
-- never double-deliver.
create or replace function app.outbox_claim(
  p_worker text,
  p_limit integer default 50,
  p_lease interval default interval '5 minutes'
)
returns setof app.outbox_events
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  if p_worker is null or btrim(p_worker) = '' then
    raise exception 'worker identity required' using errcode = '22023';
  end if;
  return query
  update app.outbox_events o
  set attempts = o.attempts + 1,
      last_error = null,
      publish_after = clock_timestamp() + greatest(p_lease, interval '30 seconds')
  where o.id in (
    select c.id
    from app.outbox_events c
    where c.published_at is null
      and c.publish_after <= clock_timestamp()
      and c.deleted_at is null
    order by c.publish_after, c.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  returning o.*;
end;
$fn$;

create or replace function app.outbox_mark_published(
  p_event_id uuid,
  p_worker text
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  update app.outbox_events o
  set published_at = clock_timestamp()
  where o.id = p_event_id and o.deleted_at is null;
end;
$fn$;

create or replace function app.outbox_reschedule(
  p_event_id uuid,
  p_worker text,
  p_error text,
  p_delay interval default interval '60 seconds'
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  update app.outbox_events o
  set last_error = left(coalesce(p_error, ''), 500),
      publish_after = clock_timestamp() + greatest(p_delay, interval '5 seconds')
  where o.id = p_event_id and o.deleted_at is null;
end;
$fn$;

create table app.rate_limit_counters (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  bucket_key text not null check (bucket_key ~ '^[a-z][a-z0-9_.:-]{1,120}$'),
  window_seconds integer not null check (window_seconds > 0),
  window_start timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0)
);

comment on table app.rate_limit_counters is 'Atomic fixed-window counters; hits check-and-increment in one statement (LR-003, P09-F3420).';

create unique index rate_limit_bucket_window_live
  on app.rate_limit_counters (company_id, bucket_key, window_seconds, window_start)
  where deleted_at is null;

-- Atomic hit: one increment-or-reject statement so concurrent requests
-- cannot race through a short window.
create or replace function app.rate_limit_hit(
  p_company_id uuid,
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_window_start timestamptz;
  v_count integer;
  v_reset timestamptz;
begin
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'rate limit parameters must be positive' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_reset := v_window_start + make_interval(secs => p_window_seconds);

  insert into app.rate_limit_counters (
    company_id, bucket_key, window_seconds, window_start, hit_count
  )
  values (p_company_id, p_bucket_key, p_window_seconds, v_window_start, 1)
  on conflict (company_id, bucket_key, window_seconds, window_start) where deleted_at is null
  do update set hit_count = app.rate_limit_counters.hit_count + 1
  returning hit_count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'current', v_count,
    'limit', p_limit,
    'reset_at', v_reset,
    'retry_after_seconds', greatest(0, extract(epoch from (v_reset - clock_timestamp()))::int)
  );
end;
$fn$;

create table app.queue_jobs (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.]{1,80}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (
    status in ('queued', 'claimed', 'succeeded', 'failed_retryable', 'dead_letter', 'cancelled')
  ),
  priority integer not null default 100 check (priority between 0 and 10000),
  run_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  locked_by text null,
  locked_at timestamptz null,
  lock_expires_at timestamptz null,
  last_error text null,
  dead_lettered_at timestamptz null,
  result jsonb null check (result is null or jsonb_typeof(result) = 'object'),
  dedupe_key text null
);

comment on table app.queue_jobs is 'DB-backed job queue: workers claim with FOR UPDATE SKIP LOCKED; retry counters and dead-letter audit are derived constraints.';

create unique index queue_jobs_active_dedupe_key
  on app.queue_jobs (company_id, kind, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'claimed', 'failed_retryable');

create index queue_jobs_claimable_idx
  on app.queue_jobs (run_at, priority, created_at)
  where status = 'queued';

create index queue_jobs_dead_letter_idx
  on app.queue_jobs (company_id, dead_lettered_at)
  where status = 'dead_letter';

-- Claim the next runnable jobs for a worker. Leases auto-recover: a job
-- whose lock has expired becomes claimable again by other workers.
create or replace function app.queue_claim(
  p_worker text,
  p_kinds text[],
  p_limit integer default 5,
  p_lease_seconds integer default 300
)
returns setof app.queue_jobs
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  if p_worker is null or btrim(p_worker) = '' then
    raise exception 'worker identity required' using errcode = '22023';
  end if;
  return query
  update app.queue_jobs j
  set status = 'claimed',
      attempts = j.attempts + 1,
      locked_by = p_worker,
      locked_at = clock_timestamp(),
      lock_expires_at = clock_timestamp() + make_interval(secs => greatest(p_lease_seconds, 30)),
      last_error = null
  where j.id in (
    select c.id
    from app.queue_jobs c
    where c.deleted_at is null
      and c.run_at <= clock_timestamp()
      and (p_kinds is null or array_length(p_kinds, 1) is null or c.kind = any(p_kinds))
      and (
        c.status = 'queued'
        or (c.status in ('claimed', 'failed_retryable')
            and coalesce(c.lock_expires_at, '-infinity'::timestamptz) <= clock_timestamp())
      )
    order by c.priority, c.run_at, c.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  returning j.*;
end;
$fn$;

create or replace function app.queue_succeed(
  p_job_id uuid,
  p_worker text,
  p_result jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  update app.queue_jobs j
  set status = 'succeeded', result = coalesce(p_result, '{}'::jsonb),
      locked_by = null, locked_at = null, lock_expires_at = null
  where j.id = p_job_id
    and j.status = 'claimed'
    and j.locked_by = p_worker
    and j.deleted_at is null;
  if not found then
    raise exception 'job % is not held by worker % even after lock check', p_job_id, p_worker
      using errcode = 'P0002';
  end if;
end;
$fn$;

-- Fail with bounded retry; after max_attempts moves to dead_letter.
create or replace function app.queue_fail(
  p_job_id uuid,
  p_worker text,
  p_error text,
  p_retry_after interval default interval '60 seconds'
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.queue_jobs%rowtype;
  v_status text;
begin
  select * into v_row
  from app.queue_jobs j
  where j.id = p_job_id and j.deleted_at is null
  for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'claimed' or v_row.locked_by <> p_worker then
    raise exception 'job % is not held by worker %', p_job_id, p_worker using errcode = 'P0002';
  end if;

  if v_row.attempts >= v_row.max_attempts then
    v_status := 'dead_letter';
    update app.queue_jobs j
    set status = 'dead_letter',
        dead_lettered_at = clock_timestamp(),
        last_error = left(coalesce(p_error, ''), 500),
        locked_by = null, locked_at = null, lock_expires_at = null
    where j.id = p_job_id;
  else
    v_status := 'failed_retryable';
    update app.queue_jobs j
    set status = 'failed_retryable',
        run_at = clock_timestamp() + greatest(p_retry_after, interval '5 seconds'),
        last_error = left(coalesce(p_error, ''), 500),
        locked_by = null, locked_at = null, lock_expires_at = null
    where j.id = p_job_id;
  end if;
  return jsonb_build_object('status', v_status, 'attempts', v_row.attempts, 'max_attempts', v_row.max_attempts);
end;
$fn$;

create table app.leader_locks (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  lock_name text not null check (lock_name ~ '^[a-z][a-z0-9_.:-]{1,120}$'),
  holder text not null,
  expires_at timestamptz not null
);

comment on table app.leader_locks is 'Named leadership locks for scheduled jobs so only one worker runs each recurring/requeue job at a time (P09-F3471).';

create unique index leader_locks_company_lock_live
  on app.leader_locks (company_id, lock_name)
  where deleted_at is null;

-- Try to become leader of a named lock: claim if free, expired, or held by
-- the same holder (renewal). Returns leadership verdict.
create or replace function app.leader_try_acquire(
  p_company_id uuid,
  p_lock_name text,
  p_holder text,
  p_ttl_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_ok boolean := false;
begin
  if p_holder is null or btrim(p_holder) = '' then
    raise exception 'holder identity required' using errcode = '22023';
  end if;

  insert into app.leader_locks (company_id, lock_name, holder, expires_at)
  values (
    p_company_id, p_lock_name, p_holder,
    clock_timestamp() + make_interval(secs => greatest(p_ttl_seconds, 30))
  )
  on conflict (company_id, lock_name) where deleted_at is null
  do update set
    holder = case
      when app.leader_locks.expires_at <= clock_timestamp() then p_holder
      when app.leader_locks.holder = p_holder then p_holder
      else app.leader_locks.holder
    end,
    expires_at = case
      when app.leader_locks.expires_at <= clock_timestamp()
        then clock_timestamp() + make_interval(secs => greatest(p_ttl_seconds, 30))
      when app.leader_locks.holder = p_holder
        then clock_timestamp() + make_interval(secs => greatest(p_ttl_seconds, 30))
      else app.leader_locks.expires_at
    end
  returning (holder = p_holder and expires_at > clock_timestamp()) into v_ok;

  return coalesce(v_ok, false);
end;
$fn$;

create or replace function app.leader_release(
  p_company_id uuid,
  p_lock_name text,
  p_holder text
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  update app.leader_locks l
  set deleted_at = clock_timestamp()
  where l.company_id = p_company_id
    and l.lock_name = p_lock_name
    and l.holder = p_holder
    and l.deleted_at is null;
end;
$fn$;

-- Atomic tenant storage quota claiming (P09-F3292).
create or replace function app.storage_quota_claim(
  p_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_updated integer;
begin
  if p_bytes < 0 then
    raise exception 'claim must be non-negative' using errcode = '22023';
  end if;
  update app.companies c
  set storage_used_bytes = c.storage_used_bytes + p_bytes
  where c.id = app.current_company_id()
    and c.deleted_at is null
    and c.storage_used_bytes + p_bytes <= c.storage_quota_bytes;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

create or replace function app.storage_quota_release(
  p_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  update app.companies c
  set storage_used_bytes = greatest(0, c.storage_used_bytes - p_bytes)
  where c.id = app.current_company_id() and c.deleted_at is null;
end;
$fn$;


create trigger idempotency_keys_touch_updated_at
  before update on app.idempotency_keys
  for each row execute function app.touch_updated_at();
create trigger idempotency_keys_guard_optimistic_version
  before update on app.idempotency_keys
  for each row execute function app.guard_optimistic_version();

create trigger outbox_events_touch_updated_at
  before update on app.outbox_events
  for each row execute function app.touch_updated_at();
create trigger outbox_events_guard_optimistic_version
  before update on app.outbox_events
  for each row execute function app.guard_optimistic_version();

create trigger rate_limit_counters_touch_updated_at
  before update on app.rate_limit_counters
  for each row execute function app.touch_updated_at();
create trigger rate_limit_counters_guard_optimistic_version
  before update on app.rate_limit_counters
  for each row execute function app.guard_optimistic_version();

create trigger queue_jobs_touch_updated_at
  before update on app.queue_jobs
  for each row execute function app.touch_updated_at();
create trigger queue_jobs_guard_optimistic_version
  before update on app.queue_jobs
  for each row execute function app.guard_optimistic_version();

create trigger leader_locks_touch_updated_at
  before update on app.leader_locks
  for each row execute function app.touch_updated_at();
create trigger leader_locks_guard_optimistic_version
  before update on app.leader_locks
  for each row execute function app.guard_optimistic_version();

alter table app.idempotency_keys enable row level security;
alter table app.idempotency_keys force row level security;
alter table app.outbox_events enable row level security;
alter table app.outbox_events force row level security;
alter table app.rate_limit_counters enable row level security;
alter table app.rate_limit_counters force row level security;
alter table app.queue_jobs enable row level security;
alter table app.queue_jobs force row level security;
alter table app.leader_locks enable row level security;
alter table app.leader_locks force row level security;

-- Members may list their tenant's idempotency/oobox/queue records for
-- diagnostics; writes stay inside RPCs (service role).
create policy idempotency_company_read
  on app.idempotency_keys for select to authenticated
  using (deleted_at is null and company_id = app.current_company_id());

create policy outbox_company_read
  on app.outbox_events for select to authenticated
  using (deleted_at is null and company_id = app.current_company_id());

create policy queue_jobs_company_read
  on app.queue_jobs for select to authenticated
  using (deleted_at is null and company_id = app.current_company_id());

-- Rate-limit counters and leader locks stay invisible to the browser
-- surface (no client-readable rows), matching their security role.
