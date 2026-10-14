-- path: supabase/migrations/007_storage_domain.down.sql
-- Rollback of migration 007.

drop policy if exists storage_connections_owner_read on app.storage_connections;
drop policy if exists storage_migration_jobs_member_read on app.storage_migration_jobs;
drop policy if exists file_quarantine_member_read on app.file_quarantine;
drop policy if exists file_records_member_read on app.file_records;

drop trigger if exists storage_migration_jobs_audit on app.storage_migration_jobs;
drop trigger if exists storage_migration_jobs_guard_optimistic_version on app.storage_migration_jobs;
drop trigger if exists storage_migration_jobs_touch_updated_at on app.storage_migration_jobs;
drop trigger if exists file_quarantine_audit on app.file_quarantine;
drop trigger if exists file_quarantine_guard_optimistic_version on app.file_quarantine;
drop trigger if exists file_quarantine_touch_updated_at on app.file_quarantine;
drop trigger if exists file_records_audit on app.file_records;
drop trigger if exists file_records_guard_optimistic_version on app.file_records;
drop trigger if exists file_records_touch_updated_at on app.file_records;
drop trigger if exists storage_connections_audit on app.storage_connections;
drop trigger if exists storage_connections_guard_optimistic_version on app.storage_connections;
drop trigger if exists storage_connections_touch_updated_at on app.storage_connections;

drop table if exists app.storage_migration_jobs;
drop table if exists app.file_quarantine;
drop table if exists app.file_records;
drop table if exists app.storage_connections;
