-- path: supabase/migrations/005_command_approvals.up.sql
-- Step 02 migration 005: command approval foundation with two-stage
-- (optionally dual-control) authorization, stage events, one-time
-- execution, standing read grants, and a full RPC state machine. Every
-- transition writes an event and (via triggers) an audit trail entry.

create table app.command_approvals (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.]{1,80}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash char(64) not null,
  status text not null default 'proposed' check (
    status in (
      'proposed', 'awaiting_l2', 'awaiting_l3', 'awaiting_confirmation',
      'approved', 'executed', 'rejected', 'expired', 'cancelled'
    )
  ),
  initiator_id uuid not null,
  attestation text null,
  step_up_confirmed boolean not null default false,
  dual_control_required boolean not null default false,
  dual_confirmed_by uuid null,
  l2_approved_by uuid null,
  l2_approved_at timestamptz null,
  l3_approved_by uuid null,
  l3_approved_at timestamptz null,
  delegated_to uuid null,
  expires_at timestamptz not null,
  executed_at timestamptz null,
  executed_by uuid null,
  execution_result jsonb null,
  rejection_reason text null,
  idempotency_key text null,
  constraint command_exactly_one_execution check (
    (executed_at is null) = (status <> 'executed')
  ),
  constraint command_execution_result_is_object check (
    execution_result is null or jsonb_typeof(execution_result) = 'object'
  )
);

comment on table app.command_approvals is 'Approval workflow for every privileged mutation. The final approval chain ends in a single execution whose result is replayed on re-execution.';

-- Idempotent command execution: one command per company per idempotency key.
create unique index command_approvals_idempotency_key
  on app.command_approvals (company_id, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create index command_approvals_company_status_idx
  on app.command_approvals (company_id, status, expires_at)
  where deleted_at is null;

create index command_approvals_kind_idx
  on app.command_approvals (company_id, kind, created_at desc);

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
  event text not null check (
    event in (
      'proposed', 'initiated', 'attested', 'l2_approved', 'l3_approved',
      'step_up_confirmed', 'final_confirmed', 'approved',
      'executed', 'rejected', 'expired', 'cancelled', 'delegated', 'escalated'
    )
  ),
  actor_id uuid null,
  note text null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

comment on table app.command_approval_events is 'Append-only stage timeline per approval command; rejection, expiration, delegation, escalation and execution are all first-class events.';

create index command_approval_events_command_idx
  on app.command_approval_events (command_id, created_at);

create trigger command_events_reject_mutation
  before update or delete on app.command_approval_events
  for each row execute function app.reject_mutation();

-- ---------------------------------------------------------------------------
-- Standing grants: time-boxed read allowances (never mutation powerss).
-- ---------------------------------------------------------------------------
create table app.standing_grants (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  subject_id uuid not null,
  scope text not null check (scope ~ '^[a-z][a-z0-9_.:*-]{1,120}$'),
  granted_by uuid not null,
  reason text null,
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null,
  constraint standing_grant_window check (valid_until > valid_from)
);

comment on table app.standing_grants is 'Time-boxed read-standing grants. Wildcards use suffix :* and never extend to mutations.';

create unique index standing_grants_active_overlap
  on app.standing_grants (company_id, subject_id, scope)
  where deleted_at is null;

create trigger standing_grants_touch_updated_at
  before update on app.standing_grants
  for each row execute function app.touch_updated_at();

create trigger standing_grants_guard_optimistic_version
  before update on app.standing_grants
  for each row execute function app.guard_optimistic_version();

create trigger standing_grants_audit
  after insert or update on app.standing_grants
  for each row execute function app.audit_mutation_trigger();

-- Standing-grant evaluator with exact and prefix wildcard matching.
create or replace function app.has_standing_grant(
  p_subject_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security definer
set search_path = app, public, extensions
as $fn$
  select exists (
    select 1
    from app.standing_grants g
    where g.deleted_at is null
      and g.subject_id = p_subject_id
      and g.valid_from <= clock_timestamp()
      and g.valid_until > clock_timestamp()
      and (
        g.scope = p_scope
        or (
          g.scope like '%:*'
          and left(p_scope, char_length(g.scope) - 2) = left(g.scope, char_length(g.scope) - 2)
        )
      )
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Internal event recorder (used by every transition below).
-- ---------------------------------------------------------------------------
create or replace function app.command_record_event(
  p_command_id uuid,
  p_company_id uuid,
  p_event text,
  p_note text default null,
  p_actor_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  insert into app.command_approval_events (
    company_id, command_id, event, actor_id, note, metadata
  )
  values (
    p_company_id, p_command_id, p_event,
    coalesce(p_actor_id, app.current_user_id()),
    p_note,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- State machine
-- ---------------------------------------------------------------------------

-- Propose a privileged command. The initial stage is derived from the
-- caller role: staff/owner/admin_staff tenants route through L2 (CEO) and
-- L3 (Super Admin); CEO proposals route through L3; Super Admin proposals
-- require step-up attestation and self-or-dual confirmation.
create or replace function app.command_propose(
  p_company_id uuid,
  p_kind text,
  p_payload jsonb,
  p_ttl interval default interval '24 hours',
  p_idempotency_key text default null,
  p_dual_control_required boolean default false,
  p_attestation text default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_role text := app.current_user_role();
  v_actor uuid := app.current_user_id();
  v_command_id uuid;
  v_status text;
  v_existing uuid;
begin
  if v_actor is null then
    raise exception 'an authenticated actor is required to propose commands'
      using errcode = '28000';
  end if;
  if v_role is null or v_role not in ('super_admin', 'ceo', 'admin_staff', 'owner', 'staff') then
    raise exception 'the active role cannot propose commands'
      using errcode = '42501';
  end if;
  if p_kind is null or p_kind !~ '^[a-z][a-z0-9_.]{1,80}$' then
    raise exception 'invalid command kind' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'command payload must be an object' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select c.id into v_existing
    from app.command_approvals c
    where c.company_id = p_company_id
      and c.idempotency_key = p_idempotency_key
      and c.deleted_at is null;
    if found then
      return v_existing;
    end if;
  end if;

  v_status := case
    when v_role = 'super_admin' then 'awaiting_confirmation'
    when v_role = 'ceo' then 'awaiting_l3'
    else 'awaiting_l2'
  end;

  insert into app.command_approvals (
    company_id, kind, payload, payload_hash, status, initiator_id,
    dual_control_required, expires_at, idempotency_key
  )
  values (
    p_company_id, p_kind, p_payload,
    app.sha256_hex(p_payload::text),
    v_status, v_actor,
    p_dual_control_required,
    clock_timestamp() + greatest(p_ttl, interval '5 minutes'),
    p_idempotency_key
  )
  returning id into v_command_id;

  perform app.command_record_event(v_command_id, p_company_id, 'proposed');
  perform app.command_record_event(v_command_id, p_company_id, 'initiated');
  if p_attestation is not null and btrim(p_attestation) <> '' then
    update app.command_approvals c set attestation = p_attestation where c.id = v_command_id;
    perform app.command_record_event(v_command_id, p_company_id, 'attested');
  end if;

  return v_command_id;
end;
$fn$;

create or replace function app.command_approve_l2(
  p_command_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
begin
  if app.current_user_role() <> 'ceo' then
    raise exception 'only ceo level may approve stage two' using errcode = '42501';
  end if;
  update app.command_approvals c
  set status = 'awaiting_l3', l2_approved_by = app.current_user_id(), l2_approved_at = clock_timestamp()
  where c.id = p_command_id
    and c.status = 'awaiting_l2'
    and c.initiator_id <> app.current_user_id()
    and c.expires_at > clock_timestamp()
    and c.deleted_at is null
  returning * into v_row;
  if not found then
    raise exception 'command is not awaiting l2 approval (or already progressed/expired)'
      using errcode = 'P0002';
  end if;
  perform app.command_record_event(p_command_id, v_row.company_id, 'l2_approved', p_note);
end;
$fn$;

create or replace function app.command_approve_l3(
  p_command_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_next text;
begin
  if app.current_user_role() <> 'super_admin' then
    raise exception 'only super_admin may approve stage three' using errcode = '42501';
  end if;
  v_next := case when coalesce(
      (select x.dual_control_required from app.command_approvals x where x.id = p_command_id), false
    ) then 'awaiting_confirmation' else 'approved' end;
  update app.command_approvals c
  set status = v_next, l3_approved_by = app.current_user_id(), l3_approved_at = clock_timestamp()
  where c.id = p_command_id
    and c.status = 'awaiting_l3'
    and c.initiator_id <> app.current_user_id()
    and c.expires_at > clock_timestamp()
    and c.deleted_at is null
  returning * into v_row;
  if not found then
    raise exception 'command is not awaiting l3 approval (or already progressed/expired)'
      using errcode = 'P0002';
  end if;
  perform app.command_record_event(p_command_id, v_row.company_id, 'l3_approved', p_note);
end;
$fn$;

-- Step-up re-authentication attestation (the initiator's own confirmation
-- fresh-eyes check is permitted only when dual control is not required).
create or replace function app.command_step_up(p_command_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
begin
  if app.current_user_role() <> 'super_admin' then
    raise exception 'only super_admin may step up' using errcode = '42501';
  end if;
  update app.command_approvals c
  set step_up_confirmed = true
  where c.id = p_command_id
    and c.status = 'awaiting_confirmation'
    and c.expires_at > clock_timestamp()
    and c.deleted_at is null
  returning * into v_row;
  if not found then
    raise exception 'command is not awaiting confirmation' using errcode = 'P0002';
  end if;
  perform app.command_record_event(p_command_id, v_row.company_id, 'step_up_confirmed');
end;
$fn$;

create or replace function app.command_final_confirm(p_command_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_actor uuid := app.current_user_id();
begin
  if app.current_user_role() <> 'super_admin' then
    raise exception 'only super_admin may confirm execution readiness' using errcode = '42501';
  end if;
  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id and c.deleted_at is null
  for update;
  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'awaiting_confirmation' then
    raise exception 'command is not awaiting confirmation, state is %', v_row.status
      using errcode = 'P0002';
  end if;
  if v_row.expires_at <= clock_timestamp() then
    raise exception 'command expired' using errcode = 'P0002';
  end if;
  if v_row.dual_control_required then
    if v_actor = v_row.initiator_id then
      raise exception 'dual-control commands require a confirming super_admin other than the initiator'
        using errcode = '42501';
    end if;
    if v_actor = v_row.dual_confirmed_by then
      raise exception 'this super_admin already supplied the dual confirmation'
        using errcode = '42501';
    end if;
    update app.command_approvals c
    set dual_confirmed_by = v_actor, status = 'approved'
    where c.id = p_command_id;
    perform app.command_record_event(p_command_id, v_row.company_id, 'final_confirmed');
    return;
  end if;
  if v_actor = v_row.initiator_id and not v_row.step_up_confirmed then
    raise exception 'self-confirmation requires prior step-up attestation'
      using errcode = '42501';
  end if;
  update app.command_approvals c
  set status = 'approved'
  where c.id = p_command_id;
  perform app.command_record_event(p_command_id, v_row.company_id, 'final_confirmed');
  perform app.command_record_event(p_command_id, v_row.company_id, 'approved');
end;
$fn$;

create or replace function app.command_reject(
  p_command_id uuid,
  p_reason text,
  p_reason_code text default null
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
  v_role text := app.current_user_role();
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a rejection reason is required' using errcode = '22023';
  end if;
  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id and c.deleted_at is null
  for update;
  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  if v_row.status in ('executed', 'rejected', 'expired', 'cancelled') then
    raise exception 'command is already terminal (%); it can no longer be rejected', v_row.status
      using errcode = 'P0002';
  end if;
  if v_row.initiator_id = app.current_user_id() then
    raise exception 'the initiator can only cancel, never reject' using errcode = '42501';
  end if;
  if not (
    v_role = 'super_admin'
    or (v_role = 'ceo' and v_row.status = 'awaiting_l2')
  ) then
    raise exception 'your role cannot reject commands at this stage' using errcode = '42501';
  end if;
  update app.command_approvals c
  set status = 'rejected', rejection_reason = btrim(p_reason)
  where c.id = p_command_id;
  perform app.command_record_event(
    p_command_id, v_row.company_id, 'rejected',
    left(p_reason, 500), null,
    jsonb_build_object('reason_code', p_reason_code)
  );
end;
$fn$;

create or replace function app.command_delegate(
  p_command_id uuid,
  p_delegate_to uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
begin
  if app.current_user_role() not in ('ceo', 'super_admin') then
    raise exception 'only ceo or super_admin may delegate' using errcode = '42501';
  end if;
  update app.command_approvals c
  set delegated_to = p_delegate_to
  where c.id = p_command_id
    and c.status in ('awaiting_l2', 'awaiting_l3', 'awaiting_confirmation')
    and c.deleted_at is null
  returning * into v_row;
  if not found then
    raise exception 'command is not in a delegable stage' using errcode = 'P0002';
  end if;
  perform app.command_record_event(
    p_command_id, v_row.company_id, 'delegated', p_note, null,
    jsonb_build_object('delegated_to', p_delegate_to)
  );
end;
$fn$;

create or replace function app.command_escalate(
  p_command_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'an escalation reason is required' using errcode = '22023';
  end if;
  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id and c.deleted_at is null;
  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  perform app.command_record_event(p_command_id, v_row.company_id, 'escalated', left(p_reason, 500));
end;
$fn$;

create or replace function app.command_cancel(p_command_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
begin
  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id and c.deleted_at is null
  for update;
  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  if v_row.status in ('executed', 'rejected', 'expired', 'cancelled') then
    raise exception 'terminal commands cannot be cancelled' using errcode = 'P0002';
  end if;
  if v_row.initiator_id <> app.current_user_id() and app.current_user_role() <> 'super_admin' then
    raise exception 'only the initiator or super_admin may cancel' using errcode = '42501';
  end if;
  update app.command_approvals c
  set status = 'cancelled'
  where c.id = p_command_id;
  perform app.command_record_event(p_command_id, v_row.company_id, 'cancelled');
end;
$fn$;

-- One-time execution with deterministic replay. The command lock
-- blocks duplicate execution even under retries; repeated calls on an
-- executed command return the recorded execution result verdict
-- (idempotent), never re-executing.
create or replace function app.command_execute(
  p_command_id uuid,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.command_approvals%rowtype;
begin
  if jsonb_typeof(p_result) is distinct from 'object' then
    raise exception 'execution result must be an object' using errcode = '22023';
  end if;
  select * into v_row
  from app.command_approvals c
  where c.id = p_command_id and c.deleted_at is null
  for update;
  if not found then
    raise exception 'command not found' using errcode = 'P0002';
  end if;
  if v_row.status = 'executed' then
    return jsonb_build_object(
      'status', 'replay',
      'executed_by', v_row.executed_by,
      'executed_at', v_row.executed_at,
      'result', v_row.execution_result
    );
  end if;
  if v_row.status <> 'approved' then
    raise exception 'command is not approved for execution (state %)', v_row.status
      using errcode = 'P0002';
  end if;
  if v_row.expires_at <= clock_timestamp() then
    raise exception 'approved command expired before execution' using errcode = 'P0002';
  end if;

  update app.command_approvals c
  set status = 'executed',
      executed_by = app.current_user_id(),
      executed_at = clock_timestamp(),
      execution_result = p_result
  where c.id = p_command_id;

  perform app.command_record_event(p_command_id, v_row.company_id, 'executed');

  return jsonb_build_object(
    'status', 'executed',
    'executed_by', app.current_user_id(),
    'result', p_result
  );
end;
$fn$;

-- Scheduled sweep: expire every pending command past its TTL.
create or replace function app.command_expire_pending(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select c.id, c.company_id, c.expires_at
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

-- The queue is visible to the initiator and to senior approval roles.
create policy command_approvals_queue_read
  on app.command_approvals
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      initiator_id = app.current_user_id()
      or delegated_to = app.current_user_id()
      or (
        app.current_user_role() in ('ceo', 'super_admin')
        and (company_id = app.current_company_id() or app.current_user_role() = 'super_admin')
      )
    )
  );

create policy command_approval_events_queue_read
  on app.command_approval_events
  for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from app.command_approvals c
      where c.id = command_id
        and c.deleted_at is null
        and (
          c.initiator_id = app.current_user_id()
          or c.delegated_to = app.current_user_id()
          or app.current_user_role() in ('ceo', 'super_admin')
        )
    )
  );

create policy standing_grants_subject_read
  on app.standing_grants
  for select
  to authenticated
  using (deleted_at is null and subject_id = app.current_user_id());

create policy standing_grants_operator_read
  on app.standing_grants
  for select
  to authenticated
  using (
    deleted_at is null
    and app.current_user_role() in ('ceo', 'super_admin')
    and (company_id = app.current_company_id() or app.current_user_role() = 'super_admin')
  );
