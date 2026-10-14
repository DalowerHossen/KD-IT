-- path: supabase/migrations/004_audit_chain.up.sql
-- Step 02 migration 004: immutable tamper-evident audit ledger. Events
-- enter only through the SECURITY DEFINER app.audit_append RPC, which
-- computes the per-company SHA-256 hash chain and sequence position inside
-- the calling transaction; UPDATE and DELETE are prohibited by trigger.

create table app.audit_events (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  sequence bigint generated always as identity,
  actor_type text not null check (actor_type in ('user', 'service', 'worker', 'client_token', 'system')),
  actor_id uuid null,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{1,80}$'),
  resource_type text not null check (resource_type ~ '^[a-z][a-z0-9_.]{1,60}$'),
  resource_id uuid null,
  correlation_id uuid null,
  ip_address inet null,
  user_agent_hash char(64) null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  prev_hash char(64) not null,
  current_hash char(64) not null
);

comment on table app.audit_events is 'Append-only audit ledger with a per-company SHA-256 hash chain; the only write path is app.audit_append.';

-- High-water sequence per company, authoritative for chain linkage.
create unique index audit_events_company_sequence_idx
  on app.audit_events (company_id, sequence);

create index audit_events_company_action_idx
  on app.audit_events (company_id, action, created_at)
  where deleted_at is null;

create index audit_events_correlation_idx
  on app.audit_events (correlation_id)
  where correlation_id is not null;

create index audit_events_resource_idx
  on app.audit_events (resource_type, resource_id, created_at)
  where resource_id is not null;

create trigger audit_events_reject_mutation
  before update or delete on app.audit_events
  for each row execute function app.reject_mutation();

-- ---------------------------------------------------------------------------
-- The only write path into the ledger.
-- ---------------------------------------------------------------------------
create or replace function app.audit_append(
  p_company_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid default null,
  p_actor_id uuid default null,
  p_actor_type text default 'user',
  p_correlation_id uuid default null,
  p_ip_address inet default null,
  p_user_agent_hash char(64) default null,
  p_request_summary text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_prev_hash char(64);
  v_hash char(64);
  v_id uuid;
  v_metadata jsonb;
begin
  if p_action is null or p_action !~ '^[a-z][a-z0-9_.]{1,80}$' then
    raise exception 'invalid audit action identifier' using errcode = '22023';
  end if;
  if p_resource_type is null or p_resource_type !~ '^[a-z][a-z0-9_.]{1,60}$' then
    raise exception 'invalid audit resource type' using errcode = '22023';
  end if;
  v_metadata := coalesce(p_metadata, '{}'::jsonb);
  if jsonb_typeof(v_metadata) is distinct from 'object' then
    raise exception 'audit metadata must be an object' using errcode = '22023';
  end if;

  -- Serialize chain extension per company: the latest row lock also gates
  -- concurrent writers until the transaction commits.
  select e.current_hash
    into v_prev_hash
    from app.audit_events e
    where e.company_id = p_company_id
    order by e.sequence desc
    limit 1
    for update;

  v_prev_hash := coalesce(v_prev_hash, repeat('0', 64));
  v_hash := app.sha256_hex(
    v_prev_hash
    || '|' || p_company_id::text
    || '|' || coalesce(p_actor_id::text, '')
    || '|' || p_actor_type
    || '|' || p_action
    || '|' || p_resource_type
    || '|' || coalesce(p_resource_id::text, '')
    || '|' || coalesce(p_correlation_id::text, '')
    || '|' || v_metadata::text
  );

  insert into app.audit_events (
    company_id,
    actor_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    correlation_id,
    ip_address,
    user_agent_hash,
    metadata,
    prev_hash,
    current_hash
  )
  values (
    p_company_id,
    coalesce(p_actor_id, app.current_user_id()),
    coalesce(nullif(p_actor_type, ''), 'user'),
    p_action,
    p_resource_type,
    p_resource_id,
    coalesce(p_correlation_id, app.current_correlation_id()),
    p_ip_address,
    p_user_agent_hash,
    case
      when p_request_summary is null then v_metadata
      else v_metadata || jsonb_build_object('request_summary', left(p_request_summary, 200))
    end,
    v_prev_hash,
    v_hash
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Chain verification: recompute hashes across a window and flag mismatches.
-- ---------------------------------------------------------------------------
create or replace function app.audit_chain_verify(
  p_company_id uuid,
  p_from_sequence bigint default null,
  p_to_sequence bigint default null
)
returns table (
  sequence bigint,
  id uuid,
  valid boolean,
  expected_hash char(64)
)
language plpgsql
stable
security definer
set search_path = app, public, extensions
as $fn$
begin
  return query
  with ordered as (
    select
      e.sequence,
      e.id,
      e.company_id,
      e.actor_id,
      e.actor_type,
      e.action,
      e.resource_type,
      e.resource_id,
      e.correlation_id,
      e.metadata,
      e.prev_hash,
      e.current_hash,
      lag(e.current_hash) over (order by e.sequence) as chained_prev
    from app.audit_events e
    where e.company_id = p_company_id
      and e.sequence >= coalesce(p_from_sequence, 0)
      and (p_to_sequence is null or e.sequence <= p_to_sequence)
    order by e.sequence
  ),
  recalculated as (
    select
      o.sequence,
      o.id,
      o.current_hash,
      app.sha256_hex(
        coalesce(o.prev_hash, repeat('0', 64))
        || '|' || o.company_id::text
        || '|' || coalesce(o.actor_id::text, '')
        || '|' || o.actor_type
        || '|' || o.action
        || '|' || o.resource_type
        || '|' || coalesce(o.resource_id::text, '')
        || '|' || coalesce(o.correlation_id::text, '')
        || '|' || o.metadata::text
      ) as recomputed
    from ordered o
  )
  select
    r.sequence,
    r.id,
    (r.recomputed = r.current_hash) as valid,
    r.recomputed as expected_hash
  from recalculated r
  order by r.sequence;
end;
$fn$;

comment on function app.audit_chain_verify is 'Recomputes each event hash; exported audit evidence reports quote this verification window.';

-- ---------------------------------------------------------------------------
-- Generic AFTER-row audit trail trigger for domain tables. Emits channel
-- contents (operation, version, removed columns) without row payloads (the
-- payload itself stays off the ledger to protect secrets); the change is
-- recorded in the same transaction and therefore rolls back atomically.
-- Never attach this trigger to append-only tables or to audit_events.
-- ---------------------------------------------------------------------------
create or replace function app.audit_mutation_trigger()
returns trigger
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_old jsonb;
  v_new jsonb;
  v_op text;
  v_changed text[];
  v_strip text[] := array[
    'credentials_ciphertext', 'credentials_nonce', 'credentials_tag',
    'credentials_key_version', 'encryption_nonce', 'encryption_tag',
    'plaintext_hmac', 'ciphertext_sha256'
  ];
  k text;
begin
  if TG_OP = 'INSERT' then
    v_op := 'created';
    v_changed := array[]::text[];
  elsif TG_OP = 'UPDATE' and OLD.deleted_at is null and NEW.deleted_at is not null then
    v_op := 'soft_deleted';
    v_changed := array[]::text[];
  else
    v_op := 'updated';
    v_old := to_jsonb(OLD) - v_strip - 'updated_at' - 'created_at';
    v_new := to_jsonb(NEW) - v_strip - 'updated_at' - 'created_at';
    v_changed := array[]::text[];
    for k in select jsonb_object_keys(v_new) loop
      if (v_old -> k) is distinct from (v_new -> k) then
        v_changed := v_changed || k;
      end if;
    end loop;
  end if;

  perform app.audit_append(
    coalesce(case when TG_OP = 'INSERT' then (to_jsonb(NEW) ->> 'company_id')::uuid else (to_jsonb(NEW) ->> 'company_id')::uuid end, app.current_company_id()),
    TG_TABLE_NAME || '.' || v_op,
    TG_TABLE_NAME,
    (to_jsonb(NEW) ->> 'id')::uuid,
    null,
    'user',
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'operation', v_op,
      'version', (to_jsonb(NEW) ->> 'version')::integer,
      'changed_columns', to_jsonb(v_changed)
    )
  );

  return NEW;
end;
$fn$;

comment on function app.audit_mutation_trigger() is 'Attaches an append-only audit event to every INSERT/UPDATE on audited tables in the same transaction.';

alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;

-- Only senior elevation roles may read the ledger; all clients read through
-- the boundary-restricted column list supplied by repositories.
create policy audit_events_ledger_read
  on app.audit_events
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      app.current_user_role() in ('super_admin', 'ceo')
      and (company_id = app.current_company_id() or app.current_user_role() = 'super_admin')
    )
  );
