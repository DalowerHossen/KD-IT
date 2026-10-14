-- path: supabase/migrations/008_grants_hardening.up.sql
-- Step 02 migration 008: privilege hardening. Default deny everywhere,
-- service_role receives the privileged (server-only) surface, authenticated
-- receives policy-gated SELECT only, and audit trail triggers cover the
-- remaining domain tables.

-- Mutation trail coverage for migration 003 tables (created here so the
-- trigger function exists first, keeping expand-migrate-contract ordering).
create trigger companies_audit
  after insert or update on app.companies
  for each row execute function app.audit_mutation_trigger();

create trigger memberships_audit
  after insert or update on app.memberships
  for each row execute function app.audit_mutation_trigger();

create trigger configuration_entries_audit
  after insert or update on app.configuration_entries
  for each row execute function app.audit_mutation_trigger();

-- Dead-letter transitions are operationally significant: audit them.
create or replace function app.audit_queue_dead_letter_trigger()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  if new.status = 'dead_letter' and old.status is distinct from 'dead_letter' then
    perform app.audit_append(
      new.company_id,
      'queue.dead_letter',
      'queue_jobs',
      new.id,
      null,
      'worker',
      app.current_correlation_id(),
      null,
      null,
      null,
      jsonb_build_object('kind', new.kind, 'attempts', new.attempts, 'last_error', new.last_error)
    );
  end if;
  return new;
end;
$fn$;

create trigger queue_jobs_audit_dead_letter
  after update on app.queue_jobs
  for each row execute function app.audit_queue_dead_letter_trigger();

-- ---------------------------------------------------------------------------
-- Table privileges: start from zero, then grant precisely.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema app from public;
revoke all on all tables in schema app from anon;
revoke all on all tables in schema app from authenticated;
revoke all on all tables in schema app from service_role;

grant usage on schema app to authenticated;
grant usage on schema app to service_role;

-- Privileged server boundary: full DML under the TS-layer tenant and
-- permission checks. RLS is additionally FORCED on every table; service_role
-- bypasses because it is the trusted server principal (server-only).
grant select, insert, update, delete on all tables in schema app to service_role;
grant usage, select on all sequences in schema app to service_role;

-- Browser-role surface: SELECT only, always filtered through tenant policies.
grant select on app.companies to authenticated;
grant select on app.memberships to authenticated;
grant select on app.configuration_entries to authenticated;
grant select on app.command_approvals to authenticated;
grant select on app.command_approval_events to authenticated;
grant select on app.standing_grants to authenticated;
grant select on app.audit_events to authenticated;
grant select on app.file_records to authenticated;
grant select on app.file_quarantine to authenticated;
grant select on app.storage_migration_jobs to authenticated;
grant select on app.storage_connections to authenticated;

-- No INSERT/UPDATE/DELETE is granted to authenticated anywhere: every write
-- flows through a security-definer RPC or the privileged server boundary.

-- ---------------------------------------------------------------------------
-- Function privileges.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema app from public;
revoke all on all functions in schema app from anon;
revoke all on all functions in schema app from authenticated;
revoke all on all functions in schema app from service_role;

grant execute on all functions in schema app to service_role;

-- Policy helper functions execute as invoker inside RLS expressions and so
-- must be callable by the browser role.
grant execute on function app.current_company_id() to authenticated;
grant execute on function app.current_user_id() to authenticated;
grant execute on function app.current_user_role() to authenticated;
grant execute on function app.current_correlation_id() to authenticated;
grant execute on function app.platform_company_id() to authenticated;

-- Command and grant validation surface for authenticated principals.
grant execute on function app.command_propose(uuid, text, jsonb, interval, text, boolean, jsonb) to authenticated;
grant execute on function app.command_approve_l2(uuid, text) to authenticated;
grant execute on function app.command_approve_l3(uuid, text) to authenticated;
grant execute on function app.command_step_up(uuid) to authenticated;
grant execute on function app.command_final_confirm(uuid) to authenticated;
grant execute on function app.command_reject(uuid, text) to authenticated;
grant execute on function app.command_delegate(uuid, uuid, text) to authenticated;
grant execute on function app.command_escalate(uuid, text) to authenticated;
grant execute on function app.has_standing_grant(uuid, text) to authenticated;

-- audit_append, command_execute, command_expire_pending, queue/outbox/rate
-- functions, and idempotency functions intentionally stay service_role-only.

-- Defaults for future objects created by migration tooling: equally strict
-- unless an owning migration grants otherwise.
alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema app revoke all on tables from anon;
alter default privileges in schema app revoke all on functions from public;
alter default privileges in schema app revoke all on functions from anon;
alter default privileges in schema app revoke all on functions from authenticated;
