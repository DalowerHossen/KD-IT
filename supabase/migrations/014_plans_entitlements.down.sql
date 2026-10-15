-- path: supabase/migrations/014_plans_entitlements.down.sql
-- Rollback for migration 014 (Substep I): drops the plan catalog.

drop trigger if exists plans_guard_optimistic_version on app.plans;
drop trigger if exists plans_touch_updated_at on app.plans;
drop index if exists idx_plans_name;
drop table if exists app.plans;
