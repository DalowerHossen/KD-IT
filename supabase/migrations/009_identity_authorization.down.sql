-- path: supabase/migrations/009_identity_authorization.down.sql
-- Step 03 substep A rollback for migration 009. Drops the identity and
-- authorization tables (their policies, indexes, and triggers drop with
-- them) and removes the membership provenance columns. No data
-- preservation is required: these tables are populated by Step 03 flows
-- only, and historical attempt evidence never exists before substep D.

drop table if exists app.auth_locks;
drop table if exists app.auth_attempts;
drop table if exists app.auth_sessions;
drop table if exists app.auth_devices;
drop table if exists app.permission_grants;
drop table if exists app.profiles;

alter table app.memberships drop column if exists granted_by_command_id;
alter table app.memberships drop column if exists status_reason;
