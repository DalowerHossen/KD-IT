-- path: supabase/migrations/006_queue_outbox_idempotency.up.sql
-- Step 02 migration 006: idempotency registry with replay-safe completion,
-- transactional outbox, atomic rate-limit buckets, database-backed queue
-- contracts with FOR UPDATE SKIP LOCKED claiming, and leader locks.

create table app.idempotency_keys (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  scope text not null check (scope ~ '^[a-z][a-z0-9_.]{1,80}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  request_hash char(64) not null,
  status text not null default 'in_flight' check (status in ('in_flight', 'completed', 'failed')),
  response jsonb null,
  locked_until timestamptz not null,
  expires_at timestamptz not null,
  constraint idempotency_response_is_object check (response is null or jsonb_typeof(response) = 'object')
);

comment on table app.idempotency_keys is 'Caller idempotency registry. begin returns started/replay/conflict; completion records the response for deterministic repeated delivery.';

create unique index idempotency_company_scope_key
  on app.idempotency_keys (company_id, scope, idempotency_key)
  where deleted_at is null;

create index idempotency_expiry_idx
  on app.idempotency_keys (expires_at);

-- begin: insert-or-report. Returns jsonb {status: started|replay|conflict}.
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
set search_path = app, public
as $fn$
declare
  v_existing app.idempotency_keys%rowtype;
begin
  insert into app.idempotency_keys (
    company_id, scope, idempotency_key, request_hash, status, locked_until, expires_at
  )
  values (
    p_company_id, p_scope, p_key, p_request_hash, 'in_flight',
    clock_timestamp() + p_lock_ttl, clock_timestamp() + p_entry_ttl
  )
  on conflict (company_id, scope, idempotency_key) where deleted_at is null do nothing
  returning * into v_existing;

  if found and v_existing.id is not null then
    return jsonb_build_object('status', 'started', 'id', v_existing.id);
  end if;

  select * into v_existing
  from app.idempotency_keys k
  where k.company_id = p_company_id
    and k.scope = p_scope
    and k.idempotency_key = p_key
    and k.deleted_at is null;

  if not found then
    return jsonb_build_object('status', 'started');
  end if;

  if v_existing.status = 'completed' then
    if v_existing.request_hash = p_request_hash then
      return jsonb_build_object('status', 'replay', 'id', v_existing.id, 'response', v_existing.response);
    end if;
    return jsonb_build_object('status', 'conflict', 'reason', 'request_hash_mismatch');
  end if;

  if v_existing.status = 'failed' and v_existing.expires_at > clock_timestamp() then
    update app.idempotency_keys k
    set status = 'in_flight', request_hash = p_request_hash, locked_until = clock_timestamp() + p_lock_ttl
    where k.id = v_existing.id;
    return jsonb_build_object('status', 'started', 'id', v_existing.id);
  end if;

  if v_existing.locked_until > clock_timestamp() then
    return jsonb_build_object('status', 'conflict', 'reason', 'in_flight');
  end if;

  update app.idempotency_keys k
  set request_hash = p_request_hash, locked_until = clock_timestamp() + p_lock_ttl
  where k.id = v_existing.id;
  return jsonb_build_object('status', 'started', 'id', v_existing.id);
end;
$fn$;

create or replace function app.idempotency_complete(
  p_company_id uuid,
  p_scope text,
  p_key text,
  p_response jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  update app.idempotency_keys k
  set status = 'completed', response = p_response, locked_until = clock_timestamp()
  where k.company_id = p_company_id
    and k.scope = p_scope
    and k.idempotency_key = p_key
    and k.deleted_at is null
    and k.status = 'in_flight';
  if not found then
    raise exception 'no in-flight idempotency entry for completion' using errcode = 'P0002';
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
set search_path = app, public
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
  topic text not null check (topic ~ '^[a-z][a-z0-9_.]{1,80}$'),
  payload jsonb not null,
  dedupe_key text null,
  correlation_id uuid null,
  occurred_at timestamptz not null default clock_timestamp(),
  published_at timestamptz null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_error text null,
  constraint outbox_payload_is_object check (jsonb_typeof(payload) = 'object')
);

comment on table app.outbox_events is 'Transactional outbox: mutations that cannot inline an audit-adjacent side effect publish here inside the same transaction; workers deliver with retry and dedupe.';

create unique index outbox_dedupe_idx
  on app.outbox_events (company_id, topic, dedupe_key)
  where dedupe_key is not null and published_at is null and deleted_at is null;

create index outbox_pending_idx
  on app.outbox_events (next_attempt_at)
  where published_at is null;

-- Claim pending outbox events with row skipping so workers never double
-- execute; the lease is visible through next_attempt_at.
create or replace function app.outbox_claim(
  p_worker text,
  p_limit integer default 25
)
returns setof app.outbox_events
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  return query
  update app.outbox_events o
  set attempts = o.attempts + 1,
      last_error = null,
      next_attempt_at = clock_timestamp() + interval '5 minutes'
  where o.id in (
    select o2.id
    from app.outbox_events o2
    where o2.published_at is null
      and o2.next_attempt_at <= clock_timestamp()
      and o2.deleted_at is null
    order by o2.next_attempt_at, o2.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  returning o.*;
end;
$fn$;

create or replace function app.outbox_mark_published(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  update app.outbox_events o
  set published_at = clock_timestamp(), last_error = null
  where o.id = p_event_id and o.published_at is null;
  if not found then
    raise exception 'outbox event already published or missing' using errcode = 'P0002';
  end if;
end;
$fn$;

create or replace function app.outbox_reschedule(
  p_event_id uuid,
  p_error text,
  p_retry_after interval
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  update app.outbox_events o
  set last_error = left(coalesce(p_error, ''), 500),
      next_attempt_at = clock_timestamp() + greatest(p_retry_after, interval '5 seconds')
  where o.id = p_event_id and o.published_at is null;
end;
$fn$;

create table app.rate_limit_counters (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  bucket_key text not null check (char_length(bucket_key) between 1 and 200),
  window_start timestamptz not null,
  hit_count bigint not null default 0 check (hit_count >= 0)
);

comment on table app.rate_limit_counters is 'Atomic fixed-window counters. rate_limit_hit inserts or increments in one statement, so concurrent calls can never race past a limit.';

create unique index rate_limit_bucket_window_key
  on app.rate_limit_counters (company_id, bucket_key, window_start);

create index rate_limit_window_start_idx on app.rate_limit_counters (window_start);

-- Atomic check-and-increment: returns remaining budget; negative means the
-- call was denied and the counter was not advanced.
create or replace function app.rate_limit_hit(
  p_company_id uuid,
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_window timestamptz;
  v_count bigint;
begin
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'rate limit parameters must be positive' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into app.rate_limit_counters (company_id, bucket_key, window_start, hit_count)
  values (p_company_id, p_bucket_key, v_window, 1)
  on conflict (company_id, bucket_key, window_start)
  do update set hit_count = app.rate_limit_counters.hit_count + 1
  returning hit_count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'current', v_count,
    'limit', p_limit,
    'window_start', v_window,
    'retry_after_seconds', extract(epoch from (v_window + (p_window_seconds || ' seconds')::interval - clock_timestamp()))::int
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
  payload jsonb not null,
  status text not null default 'queued' check (
    status in ('queued', 'claimed', 'succeeded', 'failed_retryable', 'dead_letter', 'cancelled')
  ),
  priority integer not null default 100,
  run_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0,
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  locked_by text null,
  locked_at timestamptz null,
  lock_expires_at timestamptz null,
  last_error text null,
  dead_lettered_at timestamptz null,
  dedupe_key text null,
  result jsonb null,
  constraint queue_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint queue_result_is_object check (result is null or jsonb_typeof(result) = 'object')
);

comment on table app.queue_jobs is 'Database-backed queue. Workers claim with FOR UPDATE SKIP LOCKED leases; retries are idempotent; exhausted jobs land in dead-letter.';

-- Exactly one active copy of a dedupe-keyed job may exist.
create unique index queue_jobs_active_dedupe_key
  on app.queue_jobs (company_id, kind, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'claimed', 'failed_retryable');

create index queue_jobs_runnable_idx
  on app.queue_jobs (status, run_at, priority, created_at)
  where status in ('queued', 'failed_retryable');

create index queue_jobs_dead_letter_idx
  on app.queue_jobs (dead_lettered_at)
  where status = 'dead_letter';

create trigger queue_jobs_touch_updated_at
  before update on app.queue_jobs
  for each row execute function app.touch_updated_at();

create trigger queue_jobs_guard_optimistic_version
  before update on app.queue_jobs
  for each row execute function app.guard_optimistic_version();

-- Claim jobs under a lease. Expired leases become claimable again, which
-- recovers work after worker crashes without duplicate concurrent runs.
create or replace function app.queue_claim(
  p_worker text,
  p_kinds text[],
  p_limit integer default 5,
  p_lease_seconds integer default 300
)
returns setof app.queue_jobs
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  if p_worker is null or btrim(p_worker) = '' then
    raise exception 'worker identity is required' using errcode = '22023';
  end if;

  return query
  update app.queue_jobs j
  set status = 'claimed',
      locked_by = p_worker,
      locked_at = clock_timestamp(),
      lock_expires_at = clock_timestamp() + make_interval(secs => greatest(p_lease_seconds, 30)),
      attempts = j.attempts + 1
  where j.id in (
    select j2.id
    from app.queue_jobs j2
    where j2.deleted_at is null
      and j2.kind = any (coalesce(p_kinds, array[]::text[]))
      and j2.run_at <= clock_timestamp()
      and (
        j2.status in ('queued', 'failed_retryable')
        or (j2.status = 'claimed' and j2.lock_expires_at is not null and j2.lock_expires_at <= clock_timestamp())
      )
    order by j2.priority, j2.run_at, j2.created_at
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
set search_path = app, public
as $fn$
begin
  update app.queue_jobs j
  set status = 'succeeded', result = p_result, locked_by = null, locked_at = null, lock_expires_at = null, last_error = null
  where j.id = p_job_id
    and j.status = 'claimed'
    and j.locked_by = p_worker
    and j.deleted_at is null;
  if not found then
    raise exception 'job not held by this worker' using errcode = 'P0002';
  end if;
end;
$fn$;

-- Failure: retryable until attempts exceed max_attempts, then dead-letter.
create or replace function app.queue_fail(
  p_job_id uuid,
  p_worker text,
  p_error text,
  p_retry_after interval default interval '60 seconds'
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.queue_jobs%rowtype;
begin
  update app.queue_jobs j
  set status = case
        when j.attempts >= j.max_attempts then 'dead_letter'
        else 'failed_retryable'
      end,
      run_at = clock_timestamp() + greatest(p_retry_after, interval '1 second'),
      last_error = left(coalesce(p_error, ''), 500),
      dead_lettered_at = case
        when j.attempts >= j.max_attempts then clock_timestamp()
        else null
      end,
      locked_by = null,
      locked_at = null,
      lock_expires_at = null
  where j.id = p_job_id
    and j.status = 'claimed'
    and j.locked_by = p_worker
    and j.deleted_at is null
  returning j.* into v_row;

  if not found then
    raise exception 'job not held by this worker' using errcode = 'P0002';
  end if;

  return jsonb_build_object('status', v_row.status, 'attempts', v_row.attempts);
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
  acquired_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);

comment on table app.leader_locks is 'Durable leader election for scheduled jobs; exactly one holder per named lock through leader_try_acquire semantics.';

create unique index leader_locks_company_name_key
  on app.leader_locks (company_id, lock_name)
  where deleted_at is null;

-- Acquires or renews a named lock exactly once per holder; returns true
-- when the caller is the leader. Atomic check-and-set in one statement.
create or replace function app.leader_try_acquire(
  p_company_id uuid,
  p_lock_name text,
  p_holder text,
  p_ttl_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_existing app.leader_locks%rowtype;
begin
  if p_holder is null or btrim(p_holder) = '' then
    raise exception 'holder identity is required' using errcode = '22023';
  end if;

  select * into v_existing
  from app.leader_locks l
  where l.company_id = p_company_id
    and l.lock_name = p_lock_name
    and l.deleted_at is null
  for update;

  if not found then
    insert into app.leader_locks (company_id, lock_name, holder, expires_at)
    values (p_company_id, p_lock_name, p_holder, clock_timestamp() + make_interval(secs => greatest(p_ttl_seconds, 30)))
    on conflict (company_id, lock_name) where deleted_at is null do nothing
    returning holder into v_existing.holder;
    if v_existing.holder is not null then
      return true;
    end if;
    -- Concurrent insert won the race; adopt the winner's truth.
    return exists (
      select 1
      from app.leader_locks l
      where l.company_id = p_company_id
        and l.lock_name = p_lock_name
        and l.deleted_at is null
        and l.holder = p_holder
        and l.expires_at > clock_timestamp()
    );
  end if;

  if v_existing.holder = p_holder then
    update app.leader_locks l
    set acquired_at = clock_timestamp(), expires_at = clock_timestamp() + make_interval(secs => greatest(p_ttl_seconds, 30))
    where l.id = v_existing.id;
    return true;
  end if;

  if v_existing.expires_at <= clock_timestamp() then
    update app.leader_locks l
    set holder = p_holder, acquired_at = clock_timestamp(), expires_at = clock_timestamp() + make_interval(secs => greatest(p_ttl_seconds, 30))
    where l.id = v_existing.id;
    return true;
  end if;

  return false;
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
set search_path = app, public
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

-- Plumbing tables expose no direct client surface: RPCs and the privileged
-- server boundary perform every read and write. Default deny stands.
