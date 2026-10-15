-- path: supabase/migrations/011_auth_lockout.down.sql
-- Migration 011 down: drop the Substep E lock-engine functions. The
-- app.auth_locks table itself is owned by migration 009 and is untouched.
revoke execute on function app.auth_locks_record_failure(text, uuid, integer, interval) from service_role;
revoke execute on function app.auth_locks_record_success(text) from service_role;
drop function if exists app.auth_locks_record_failure(text, uuid, integer, interval);
drop function if exists app.auth_locks_record_success(text);
