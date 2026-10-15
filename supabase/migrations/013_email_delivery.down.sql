-- path: supabase/migrations/013_email_delivery.down.sql
-- Rollback for migration 013 (Substep H): drops the email delivery tables.
-- The queues/retries they reuse live in the Step 02 outbox (migration 006)
-- and are untouched here.

drop trigger if exists email_suppressions_guard_optimistic_version on app.email_suppressions;
drop trigger if exists email_suppressions_touch_updated_at on app.email_suppressions;
drop index if exists idx_email_suppressions_lookup;
drop index if exists idx_email_suppressions_active;
drop table if exists app.email_suppressions;

drop trigger if exists email_deliveries_guard_optimistic_version on app.email_deliveries;
drop trigger if exists email_deliveries_touch_updated_at on app.email_deliveries;
drop index if exists idx_email_deliveries_outbox;
drop index if exists idx_email_deliveries_to;
drop index if exists idx_email_deliveries_status;
drop table if exists app.email_deliveries;

drop trigger if exists email_credentials_guard_optimistic_version on app.email_credentials;
drop trigger if exists email_credentials_touch_updated_at on app.email_credentials;
drop index if exists idx_email_credentials_active_provider;
drop table if exists app.email_credentials;
