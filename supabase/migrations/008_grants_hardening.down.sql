-- path: supabase/migrations/008_grants_hardening.down.sql
-- Rollback of migration 008.

alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema app revoke all on tables from anon;
alter default privileges in schema app revoke all on functions from public;
alter default privileges in schema app revoke all on functions from anon;

revoke select, insert, update, delete on all tables in schema app from service_role;
revoke usage, select on all sequences in schema app from service_role;

revoke execute on all functions in schema app from authenticated;
revoke execute on all functions in schema app from service_role;

drop trigger if exists queue_jobs_audit_dead_letter on app.queue_jobs;
drop function if exists app.audit_queue_dead_letter_trigger();

drop trigger if exists configuration_entries_audit on app.configuration_entries;
drop trigger if exists memberships_audit on app.memberships;
drop trigger if exists companies_audit on app.companies;
