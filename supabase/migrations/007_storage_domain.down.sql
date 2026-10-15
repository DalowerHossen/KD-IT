-- path: supabase/migrations/007_storage_domain.down.sql
-- Rollback for 007: storage domain tables, per-file migration state
-- machine, policies, triggers, and helper functions.

drop function if exists app.storage_fm_complete_retention(uuid, integer);
drop function if exists app.storage_fm_abort(uuid, integer);
drop function if exists app.storage_fm_finalize(uuid, integer);
drop function if exists app.storage_fm_transition(uuid, text, text, text, char, timestamptz, integer, text);
drop function if exists app.storage_fm_prepare_copy(uuid, uuid, text);

drop trigger if exists queue_jobs_dead_letter_audit on app.queue_jobs;
drop function if exists app.queue_dead_letter_audit();

drop trigger if exists configuration_audit on app.configuration_entries;
drop trigger if exists memberships_audit on app.memberships;
drop trigger if exists companies_audit on app.companies;

drop trigger if exists storage_migrations_audit on app.storage_migration_jobs;
drop trigger if exists storage_migration_jobs_guard_optimistic_version on app.storage_migration_jobs;
drop trigger if exists storage_migration_jobs_touch_updated_at on app.storage_migration_jobs;
drop trigger if exists file_migration_audit on app.file_migration;
drop trigger if exists file_migration_guard_optimistic_version on app.file_migration;
drop trigger if exists file_migration_touch_updated_at on app.file_migration;
drop trigger if exists file_quarantine_audit on app.file_quarantine;
drop trigger if exists file_quarantine_guard_optimistic_version on app.file_quarantine;
drop trigger if exists file_quarantine_touch_updated_at on app.file_quarantine;
drop trigger if exists file_records_audit on app.file_records;
drop trigger if exists file_records_guard_optimistic_version on app.file_records;
drop trigger if exists file_records_touch_updated_at on app.file_records;
drop trigger if exists storage_connections_audit on app.storage_connections;
drop trigger if exists storage_connections_guard_optimistic_version on app.storage_connections;
drop trigger if exists storage_connections_touch_updated_at on app.storage_connections;

drop policy if exists storage_migration_operator_read on app.storage_migration_jobs;
drop policy if exists file_migration_operator_read on app.file_migration;
drop policy if exists file_quarantine_operator_read on app.file_quarantine;
drop policy if exists file_records_operator_read on app.file_records;
drop policy if exists file_records_member_read_guard on app.file_records;
drop policy if exists storage_connections_operator_read on app.storage_connections;
drop policy if exists storage_connections_owner_read on app.storage_connections;

drop index if exists app.storage_migration_live_per_company;
drop index if exists app.file_migration_company_state_idx;
drop index if exists app.file_migration_active_per_file;
drop index if exists app.file_quarantine_file_idx;
drop index if exists app.file_records_hashed_dedupe_idx;
drop index if exists app.file_records_company_quarantine_idx;
drop index if exists app.file_records_company_category_idx;
drop index if exists app.file_records_provider_object_idx;
drop index if exists app.storage_connections_company_provider;

alter table app.storage_migration_jobs no force row level security;
alter table app.file_migration no force row level security;
alter table app.file_quarantine no force row level security;
alter table app.file_records no force row level security;
alter table app.storage_connections no force row level security;

drop table if exists app.storage_migration_jobs cascade;
drop table if exists app.file_migration cascade;
drop table if exists app.file_quarantine cascade;
drop table if exists app.file_records cascade;
drop table if exists app.storage_connections cascade;
