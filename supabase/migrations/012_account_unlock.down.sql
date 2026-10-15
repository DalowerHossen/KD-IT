-- path: supabase/migrations/012_account_unlock.down.sql
-- Migration 012 down: drop the Substep F unlock writer. The auth_locks table
-- and its columns are owned by migration 009 and are untouched.
revoke execute on function app.auth_locks_clear(text, uuid, uuid, text, integer) from service_role;
drop function if exists app.auth_locks_clear(text, uuid, uuid, text, integer);
