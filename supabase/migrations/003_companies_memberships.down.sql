-- path: supabase/migrations/003_companies_memberships.down.sql
-- Rollback of migration 003 in reverse dependency order.

drop policy if exists configuration_platform_staff_read on app.configuration_entries;
drop policy if exists configuration_member_read on app.configuration_entries;
drop policy if exists companies_member_read on app.companies;
drop policy if exists memberships_platform_staff_read on app.memberships;
drop policy if exists memberships_self_read on app.memberships;

drop trigger if exists configuration_entries_guard_optimistic_version on app.configuration_entries;
drop trigger if exists configuration_entries_touch_updated_at on app.configuration_entries;
drop trigger if exists memberships_guard_optimistic_version on app.memberships;
drop trigger if exists memberships_touch_updated_at on app.memberships;
drop trigger if exists companies_guard_optimistic_version on app.companies;
drop trigger if exists companies_touch_updated_at on app.companies;

drop table if exists app.configuration_entries;
drop table if exists app.memberships;
delete from app.companies where id = app.platform_company_id();
drop table if exists app.companies;
