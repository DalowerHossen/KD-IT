-- path: supabase/migrations/004_audit_chain.up.sql
-- Step 02 migration 004: append-only, tamper-evident audit chain with a
-- dedicated security-definer append path, generic mutation trail trigger,
-- and strict recursion prevention.

create table app.audit_events (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  sequence bigint generated always as identity unique,
  actor_id uuid null,
  actor_type text not null default 'user' check (actor_type in ('user', 'service', 'worker', 'client_token', 'system')),
  action text not null check (action ~ '^[a-z][a-z0-9_.]{1,80}$'),
  resource_type text not null check (resource_type ~ '^[a-z][a-z0-9_.]{1,60}$'),
  resource_id uuid null,
  correlation_id uuid null,
  ip_address inet null,
  user_agent_hash char(64) null,
  request_summary text null check (request_summary is null or char_length(request_summary) <= 200),
  metadata jsonb not null default '{}'::jsonb,
  prev_hash char(64) not null,
  current_hash char(64) not null,
  constraint audit_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

comment on table app.audit_events is 'Append-only tamper-evident ledger. Rows are written only through app.audit_append (no table INSERT grant); UPDATE and DELETE are forbidden by trigger. The per-company prev_hash chain makes tampering detectable.';

create index audit_events_company_sequence_idx on app.audit_events (company_id, sequence desc);
create index audit_events_company_resource_idx on app.audit_events (company_id, resource_type, resource_id) where resource_id is not null;
create index audit_events_company_action_idx on app.audit_events (company_id, action, sequence desc);
create index audit_events_correlation_idx on app.audit_events (correlation_id) where correlation_id is not null;

-- Chain guard: sequence numbers must never be reassigned or edited.
create trigger audit_events_reject_mutation
  before update or delete on app.audit_events
  for each row execute function app.reject_mutation();

-- Chain walk helper: recomputes hashes over a company window and reports
-- divergence (used by verification runs and the Step 15 SIEM bridge).
create or replace function app.audit_chain_verify(
  p_company_id uuid,
  p_from_sequence bigint default -9223372036854775808,
  p_to_sequence bigint default 9223372036854775807
)
returns table (
  sequence bigint,
  expected_hash char(64),
  actual_hash char(64),
  valid boolean
)
language sql
stable
security invoker
set search_path = app, public
as $fn$
  with ordered as (
    select
      e.sequence,
      e.prev_hash,
      e.current_hash,
      app.sha256_hex(
        coalesce(lag(e.current_hash) over (order by e.sequence), repeat('0', 64))
        || '|' || e.company_id::text
        || '|' || coalesce(e.actor_id::text, '')
        || '|' || e.actor_type
        || '|' || e.action
        || '|' || e.resource_type
        || '|' || coalesce(e.resource_id::text, '')
        || '|' || coalesce(e.correlation_id::text, '')
        || '|' || coalesce(e.metadata::text, '{}')
      ) as recomputed
    from app.audit_events e
    where e.company_id = p_company_id
      and e.sequence between p_from_sequence and p_to_sequence
  )
  select
    o.sequence,
    o.recomputed as expected_hash,
    o.current_hash as actual_hash,
    (o.current_hash = o.recomputed) as valid
  from ordered o;
$fn$;

-- Dedicated append function. SECURITY DEFINER so table INSERT stays revoked
-- from every direct caller. The per-company chain is locked for update to
-- serialize concurrent appends deterministically.
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
set search_path = app, public
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
    request_summary,
    metadata,
    prev_hash,
    current_hash
  )
  values (
    p_company_id,
    p_actor_id,
    p_actor_type,
    p_action,
    p_resource_type,
    p_resource_id,
    p_correlation_id,
    p_ip_address,
    p_user_agent_hash,
    p_request_summary,
    v_metadata,
    v_prev_hash,
    v_hash
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function app.audit_append(uuid, text, text, uuid, uuid, text, uuid, inet, char, text, jsonb) is
  'Only sanctioned audit write path. SECURITY DEFINER with INSERT revoked from all direct callers; metadata must already be redacted by the emitting layer.';

-- Generic mutation trail: fires after INSERT/UPDATE on domain tables and
-- appends through the dedicated path. Soft metadata only: operation,
-- version, and changed column names, never row payloads (PII-safe).
-- audit_events itself never receives this trigger, so self-auditing cannot
-- recurse.
create or replace function app.audit_mutation_trigger()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_company_id uuid;
  v_resource_id uuid;
  v_columns text[];
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_resource_id := old.id;
  else
    v_company_id := new.company_id;
    v_resource_id := new.id;
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(key order by key)
      into v_columns
      from jsonb_each(to_jsonb(new)) as kv(key, value)
      where to_jsonb(old) -> key is distinct from kv.value;
  else
    v_columns := null;
  end if;

  perform app.audit_append(
    v_company_id,
    lower(tg_op) || '.' || tg_table_name,
    tg_table_name,
    v_resource_id,
    app.current_user_id(),
    case when app.current_user_id() is null then 'service' else 'user' end,
    app.current_correlation_id(),
    null,
    null,
    null,
    jsonb_build_object(
      'operation', tg_op,
      'version', case when tg_op = 'DELETE' then null else new.version end,
      'changed_columns', coalesce(to_jsonb(v_columns), 'null'::jsonb),
      'soft_delete', case
        when tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then to_jsonb(true)
        when tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then jsonb_build_object('restored', true)
        else to_jsonb(false)
      end
    )
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;

-- No INSERT/UPDATE/DELETE policies exist by design (append via function).
create policy audit_events_tenant_auditor_read
  on app.audit_events
  for select
  to authenticated
  using (
    company_id = app.current_company_id()
    and app.current_user_role() in ('super_admin', 'ceo')
    and deleted_at is null
  );
