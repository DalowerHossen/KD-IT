-- path: supabase/migrations/005_command_approvals.up.sql
-- Step 02 migration 005: discrete command approval foundation implementing
-- the L1/L2/L3 hierarchy, super-admin step-up and final-confirmation,
-- dual control for critical commands, one-time idempotent execution, and
-- standing read grants.

create table app.command_approvals (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.]{1,80}$'),
  payload jsonb not null,
  payload_hash char(64) not null,
  status text not null default 'proposed' check (
    status in (
      'proposed',
      'awaiting_l2',
      'awaiting_l3',
      'awaiting_confirmation',
      'approved',
      'executed',
      'rejected',
      'expired',
      'cancelled'
    )
  ),
  initiator_id uuid not null,
  initiator_role text not null check (initiator_role in ('super_admin', 'ceo', 'admin_staff', 'owner', 'staff')),
  tenant_attestation jsonb null,
  requires_step_up boolean not null default false,
  step_up_confirmed boolean not null default false,
  dual_control boolean not null default false,
  dual_confirmed_by uuid null,
  approved_l2_by uuid null,
  approved_l2_at timestamptz null,
  approved_l3_by uuid null,
  approved_l3_at timestamptz null,
  rejected_by uuid null,
  rejected_reason text null,
  delegated_to uuid null,
  expires_at timestamptz not null,
  executed_at timestamptz null,
  executed_by uuid null,
  execution_result jsonb null,
  idempotency_key text null,
  constraint command_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint command_l2_sequence check (
    (approved_l2_by is null and approved_l2_at is null)
    or (approved_l2_by is not null and approved_l2_at is not null)
  ),
  constraint command_l3_sequence check (
    (approved_l3_by is null and approved_l3_at is null)
    or (approved_l3_by is not null and approved_l3_at is not null)
  ),
  constraint command_executed_consistency check (
    (executed_at is null and execution_result is null)
    or (executed_at is not null)
  )
);

comment on table app.command_approvals is 'Discrete approval requests. Every state-changing platform command is proposed BEFORE side effects; execution happens once after final approval through app.command_execute.';

create unique index command_approvals_idempotency_key
  on app.command_approvals (company_id, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create index command_approvals_company_status_idx
  on app.command_approvals (company_id, status, created_at desc)
  where deleted_at is null;

create index command_approvals_initiator_idx
  on app.command_approvals (initiator_id, created_at desc)
  where deleted_at is null;

create index command_approvals_expiry_idx
  on app.command_approvals (expires_at)
  where status in ('proposed', 'awaiting_l2', 'awaiting_l3', 'awaiting_confirmation', 'approved');

create trigger command_approvals_touch_updated_at
  before update on app.command_approvals
  for each row execute function app.touch_updated_at();

create trigger command_approvals_guard_optimistic_version
  before update on app.command_approvals
  for each row execute function app.guard_optimistic_version();

create trigger command_approvals_audit
  after insert or update on app.command_approvals
  for each row execute function app.audit_mutation_trigger();

create table app.command_approval_events (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  command_id uuid not null references app.command_approvals (id) on delete restrict,
  sequence bigint generated always as identity unique,
  event text not null check (
    event in (
      'proposed',
      'initiated',
      'attested',
      'l2_approved',
      'l3_approved',
      'step_up_recorded',
      'final_confirmed',
      'executed',
      'rejected',
      'expired',
      'delegated',
      'escalated',
      'cancelled'
    )
  ),
  actor_id uuid null,
  note text null check (note is null or char_length(note) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  constraint command_event_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

comment on table app.command_approval_events is 'Append-only event history for every command: proposals, attestations, approvals, execution, rejection, expiration, delegation, escalation.';

create index command_events_command_idx
  on app.command_approval_events (command_id, sequence);

create trigger command_events_reject_mutation
  before update or delete on app.command_approval_events
  for each row execute function app.reject_mutation();

create table app.standing_grants (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  subject_id uuid not null,
  resource_scope text not null check (resource_scope ~ '^[a-z][a-z0-9_.:*-]{1,120}$'),
  approved_command_id uuid not null references app.command_approvals (id) on delete restrict,
  granted_by uuid not null,
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null,
  revoked_at timestamptz null,
  revoked_by uuid null,
  revoked_reason text null,
  constraint standing_grant_window check (valid_until > valid_from)
);

comment on table app.standing_grants is 'Role- and resource-scoped standing read grants approved through the L2 and L3 hierarchy; sensitive reads use discrete time-bound grants and are always audited.';

create unique index standing_grants_subject_scope_key
  on app.standing_grants (company_id, subject_id, resource_scope)
  where revoked_at is null and deleted_at is null;

create trigger standing_grants_touch_updated_at
  before update on app.standing_grants
  for each row execute function app.touch_updated_at();

create trigger standing_grants_guard_optimistic_version
  before update on app.standing_grants
  for each row execute function app.guard_optimistic_version();

create trigger standing_grants_audit
  after insert or update on app.standing_grants
  for each row execute function app.audit_mutation_trigger();

-- Validation: an ordinary read requires an unexpired, unrevoked grant whose
-- scope either matches exactly or covers the queried namespace by wildcard.
create or replace function app.has_standing_grant(
  p_subject_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $fn$
  select exists (
    select 1
    from app.standing_grants g
    where g.subject_id = p_subject_id
      and g.company_id = app.current_company_id()
      and g.deleted_at is null
      and g.revoked_at is null
      and g.valid_from <= clock_timestamp()
      and g.valid_until > clock_timestamp()
      and (
        g.resource_scope = p_scope
        or (position(':*' in g.resource_scope) > 0
            and left(g.resource_scope, position(':*' in g.resource_scope) - 1) || ':' =
                left(p_scope, position(':*' in g.resource_scope) - 1) )
      )
  );
$fn$;

-- Internal event recorder used by every command RPC. SECURITY DEFINER with
-- restricted grants; callers never receive direct INSERT on the events
-- table.
create or replace function app.command_record_event(
  p_command_id uuid,
  p_company_id uuid,
  p_event text,
  p_actor_id uuid,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  insert into app.command_approval_events (company_id, command_id, event, actor_id, note, metadata)
  values (p_company_id, p_command_id, p_event, p_actor_id, p_note, coalesce(p_metadata, '{}'::jsonb));
end;
$fn$;

-- L1 proposal: immutable request created before any side effect. The
-- resulting status encodes the required chain for the initiator role.
create or replace function app.command_propose(
  p_company_id uuid,
  p_kind text,
  p_payload jsonb,
  p_ttl interval default interval '24 hours',
  p_idempotency_key text default null,
  p_dual_control boolean default false,
  p_tenant_attestation jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_role text;
  v_actor uuid;
  v_status text;
  v_id uuid;
begin
  v_actor := app.current_user_id();
  v_role := app.current_user_role();
  if v_actor is null then
    raise exception 'command proposals require an authenticated initiator' using errcode = '42501';
  end if;
  if v_role not in ('super_admin', 'ceo', 'admin_staff', 'owner', 'staff') then
    raise exception 'role % cannot propose commands', v_role using errcode = '42501';
  end if;
  if p_ttl is null or p_ttl <= interval '0 seconds' then
    raise exception 'command ttl must be positive' using errcode = '22023';
  end if;

  v_status := case v_role
    when 'staff' then 'awaiting_l2'
    when 'owner' then 'awaiting_l2'
    when 'admin_staff' then 'awaiting_l2'
    when 'ceo' then 'awaiting_l3'
    when 'super_admin' then 'awaiting_confirmation'
  end;

  insert into app.command_approvals (
    company_id,
    kind,
    payload,
    payload_hash,
    status,
    initiator_id,
    initiator_role,
    tenant_attestation,
    requires_step_up,
    dual_control,
    expires_at,
    idempotency_key
  )
  values (
    p_company_id,
    p_kind,
    p_payload,
    app.sha256_hex(p_payload::text),
    v_status,
    v_actor,
    v_role,
    p_tenant_attestation,
    (v_role = 'super_admin'),
    p_dual_control,
    clock_timestamp() + p_ttl,
    p_idempotency_key
  )
  returning id into v_id;

  perform app.command_record_event(v_id, p_company_id, 'proposed', v_actor);
  perform app.command_record_event(v_id, p_company_id, 'initiated', v_actor);
  if p_tenant_attestation is not null then
    perform app.command_record_event(v_id, p_company_id, 'attested', v_actor, null, p_tenant_attestation);
  end if;

  return v_id;
end;
$fn$;

-- L2 approval: ceo-only, never self-approval.
create or replace function app.command_approve_l2(
  p_command_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
begin
  if app.current_user_role() <> 'ceo' then
    raise exception 'l2 approval requires the ceo role' using errcode = '42501';
  end if;

  update app.command_approvals c
  set status = 'awaiting_l3',
      approved_l2_by = v_actor,
      approved_l2_at = clock_timestamp()
  where c.id = p_command_id
    and c.company_id = app.current_company_id()
    and c.status = 'awaiting_l2'
    and c.deleted_at is null
    and c.expires_at > clock_timestamp()
    and c.initiator_id <> v_actor
  returning c.* into v_row;

  if not found then
    raise exception 'command not awaiting l2 approval' using errcode = 'P0002';
  end if;

  perform app.command_record_event(p_command_id, v_row.company_id, 'l2_approved', v_actor, p_note);
end;
$fn$;

-- L3 approval: super-admin-only, honors dual control and l2 sequencing.
create or replace function app.command_approve_l3(
  p_command_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
  v_dual_ok boolean;
begin
  if app.current_user_role() <> 'super_admin' then
    raise exception 'l3 approval requires the super_admin role' using errcode = '42501';
  end if;

  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id
    and c.company_id = app.current_company_id()
    and c.deleted_at is null
  for update;

  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'awaiting_l3' then
    raise exception 'command not awaiting l3 approval' using errcode = 'P0002';
  end if;
  if v_row.initiator_role <> 'ceo' and v_row.approved_l2_by is null then
    raise exception 'l2 approval must precede l3 for this initiator' using errcode = 'P0002';
  end if;
  if v_row.initiator_id = v_actor then
    raise exception 'an initiator cannot perform its own final approval' using errcode = '42501';
  end if;

  v_dual_ok := true;
  if v_row.dual_control then
    v_dual_ok := v_row.dual_confirmed_by is not null
      and v_row.dual_confirmed_by <> v_actor
      and v_row.dual_confirmed_by <> v_row.initiator_id;
  end if;
  if not v_dual_ok then
    raise exception 'dual control requires confirmation by a second eligible super_admin' using errcode = '42501';
  end if;

  update app.command_approvals c
  set status = 'approved',
      approved_l3_by = v_actor,
      approved_l3_at = clock_timestamp()
  where c.id = p_command_id;

  perform app.command_record_event(p_command_id, v_row.company_id, 'l3_approved', v_actor, p_note);
end;
$fn$;

-- Super-admin step-up and final confirmation for super_admin-originated
-- commands; a second person confirms when dual control is required.
create or replace function app.command_step_up(p_command_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
begin
  if app.current_user_role() <> 'super_admin' then
    raise exception 'step-up requires the super_admin role' using errcode = '42501';
  end if;

  update app.command_approvals c
  set step_up_confirmed = true
  where c.id = p_command_id
    and c.company_id = app.current_company_id()
    and c.status = 'awaiting_confirmation'
    and c.initiator_id = v_actor
    and c.deleted_at is null
    and c.expires_at > clock_timestamp()
  returning c.* into v_row;

  if not found then
    raise exception 'step-up not applicable for this command' using errcode = 'P0002';
  end if;

  perform app.command_record_event(p_command_id, v_row.company_id, 'step_up_recorded', v_actor);
end;
$fn$;

create or replace function app.command_final_confirm(p_command_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
  v_is_self boolean;
begin
  if app.current_user_role() <> 'super_admin' then
    raise exception 'final confirmation requires the super_admin role' using errcode = '42501';
  end if;

  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id
    and c.company_id = app.current_company_id()
    and c.deleted_at is null
  for update;

  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'awaiting_confirmation' then
    raise exception 'command not awaiting final confirmation' using errcode = 'P0002';
  end if;

  v_is_self := v_actor = v_row.initiator_id;

  if v_is_self and not v_row.dual_control then
    if not v_row.step_up_confirmed then
      raise exception 'step-up reauthentication must precede final confirmation' using errcode = '42501';
    end if;
    update app.command_approvals c set status = 'approved' where c.id = p_command_id;
    perform app.command_record_event(p_command_id, v_row.company_id, 'final_confirmed', v_actor);
    return;
  end if;

  -- Dual control path: a second eligible super_admin confirms.
  if v_is_self then
    raise exception 'dual-control commands require confirmation by another super_admin' using errcode = '42501';
  end if;
  if not v_row.step_up_confirmed then
    raise exception 'step-up reauthentication must precede final confirmation' using errcode = '42501';
  end if;

  update app.command_approvals c
  set status = 'approved',
      dual_confirmed_by = v_actor,
      approved_l3_by = v_actor,
      approved_l3_at = clock_timestamp()
  where c.id = p_command_id;

  perform app.command_record_event(p_command_id, v_row.company_id, 'final_confirmed', v_actor);
  perform app.command_record_event(p_command_id, v_row.company_id, 'l3_approved', v_actor);
end;
$fn$;

-- Rejection is an immutable event; only an approver at the pending level
-- (or any super_admin) may reject, and never their own request.
create or replace function app.command_reject(
  p_command_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
  v_role text := app.current_user_role();
  v_allowed boolean;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a rejection reason is required' using errcode = '22023';
  end if;

  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id
    and c.company_id = app.current_company_id()
    and c.deleted_at is null
  for update;

  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  if v_row.status not in ('awaiting_l2', 'awaiting_l3', 'awaiting_confirmation', 'approved') then
    raise exception 'command is not in a rejectable state' using errcode = 'P0002';
  end if;

  v_allowed := (v_role = 'super_admin')
    or (v_role = 'ceo' and v_row.status = 'awaiting_l2');
  if not v_allowed then
    raise exception 'current role cannot reject at this stage' using errcode = '42501';
  end if;
  if v_row.initiator_id = v_actor then
    raise exception 'an initiator cannot reject its own command at this stage' using errcode = '42501';
  end if;

  update app.command_approvals c
  set status = 'rejected', rejected_by = v_actor, rejected_reason = left(btrim(p_reason), 200)
  where c.id = p_command_id;

  perform app.command_record_event(
    p_command_id,
    v_row.company_id,
    'rejected',
    v_actor,
    left(btrim(p_reason), 200)
  );
end;
$fn$;

-- Delegation and escalation are recorded as immutable events; delegation
-- re-targets the pending approval without changing the chain.
create or replace function app.command_delegate(
  p_command_id uuid,
  p_delegate_to uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
  v_role text := app.current_user_role();
begin
  if v_role not in ('ceo', 'super_admin') then
    raise exception 'delegation requires the ceo or super_admin role' using errcode = '42501';
  end if;
  if p_delegate_to = v_actor then
    raise exception 'cannot delegate to self' using errcode = '22023';
  end if;

  update app.command_approvals c
  set delegated_to = p_delegate_to
  where c.id = p_command_id
    and c.company_id = app.current_company_id()
    and c.status in ('awaiting_l2', 'awaiting_l3')
    and c.deleted_at is null
    and c.expires_at > clock_timestamp()
  returning c.* into v_row;

  if not found then
    raise exception 'command is not in a delegable state' using errcode = 'P0002';
  end if;

  perform app.command_record_event(
    p_command_id,
    v_row.company_id,
    'delegated',
    v_actor,
    p_note,
    jsonb_build_object('delegated_to', p_delegate_to)
  );
end;
$fn$;

create or replace function app.command_escalate(
  p_command_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
begin
  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id
    and c.company_id = app.current_company_id()
    and c.deleted_at is null
    and c.status in ('awaiting_l2', 'awaiting_l3', 'approved')
  for update;
  if not found then
    raise exception 'command is not in an escalatable state' using errcode = 'P0002';
  end if;
  perform app.command_record_event(p_command_id, v_row.company_id, 'escalated', v_actor, p_note);
end;
$fn$;

-- One-time execution: invoked by the privileged worker boundary after all
-- approvals. Repeated delivery returns the recorded result unchanged.
create or replace function app.command_execute(
  p_command_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
begin
  if jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' then
    raise exception 'execution result must be a json object' using errcode = '22023';
  end if;

  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id
    and c.deleted_at is null
  for update;

  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;

  if v_row.status = 'executed' then
    return jsonb_build_object(
      'status', 'replay',
      'command_id', v_row.id,
      'executed_at', v_row.executed_at,
      'result', v_row.execution_result
    );
  end if;

  if v_row.status <> 'approved' then
    raise exception 'command is not approved for execution (status: %)', v_row.status using errcode = 'P0002';
  end if;
  if v_row.expires_at <= clock_timestamp() then
    raise exception 'command approval has expired' using errcode = 'P0002';
  end if;

  update app.command_approvals c
  set status = 'executed',
      executed_at = clock_timestamp(),
      executed_by = v_actor,
      execution_result = p_result
  where c.id = p_command_id;

  perform app.command_record_event(
    p_command_id,
    v_row.company_id,
    'executed',
    v_actor,
    null,
    p_result
  );

  return jsonb_build_object(
    'status', 'executed',
    'command_id', v_row.id,
    'executed_at', clock_timestamp(),
    'result', p_result
  );
end;
$fn$;

-- Expiration sweep for queues/workers: records immutable expiration events.
create or replace function app.command_expire_pending(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select c.id, c.company_id
    from app.command_approvals c
    where c.deleted_at is null
      and c.expires_at <= clock_timestamp()
      and c.status in ('proposed', 'awaiting_l2', 'awaiting_l3', 'awaiting_confirmation', 'approved')
    order by c.expires_at
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    update app.command_approvals c set status = 'expired' where c.id = v_row.id;
    perform app.command_record_event(v_row.id, v_row.company_id, 'expired', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

alter table app.command_approvals enable row level security;
alter table app.command_approvals force row level security;
alter table app.command_approval_events enable row level security;
alter table app.command_approval_events force row level security;
alter table app.standing_grants enable row level security;
alter table app.standing_grants force row level security;

-- Review queues: approvers see their tenant's commands; initiators see their
-- own. Mutations happen only through the RPCs (grants restrict direct DML).
create policy command_approvals_queue_read
  on app.command_approvals
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and (
      initiator_id = app.current_user_id()
      or app.current_user_role() in ('super_admin', 'ceo')
    )
  );

create policy command_approval_events_queue_read
  on app.command_approval_events
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and (
      app.current_user_role() in ('super_admin', 'ceo')
      or exists (
        select 1 from app.command_approvals c
        where c.id = app.command_approval_events.command_id
          and c.initiator_id = app.current_user_id()
      )
    )
  );

create policy standing_grants_subject_read
  on app.standing_grants
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and (
      subject_id = app.current_user_id()
      or app.current_user_role() in ('super_admin', 'ceo')
    )
  );
