-- path: supabase/migrations/002_core_functions.down.sql
-- Rollback of migration 002.

drop function if exists app.sha256_hex(text);
drop function if exists app.platform_company_id();
drop function if exists app.current_correlation_id();
drop function if exists app.current_user_role();
drop function if exists app.current_user_id();
drop function if exists app.current_company_id();
drop function if exists app.reject_mutation();
drop function if exists app.guard_optimistic_version();
drop function if exists app.touch_updated_at();
drop function if exists app.uuid_v7();
drop function if exists app.getrandbits(integer);
