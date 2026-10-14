-- path: supabase/migrations/007_storage_domain.up.sql
-- Step 02 migration 007: runtime file storage domain. Structured metadata,
-- integrity, and encryption envelopes live here; file bytes never live in
-- ordinary PostgreSQL columns.

create table app.storage_connections (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  provider text not null check (provider in ('google_drive', 'supabase_storage')),
  status text not null default 'disabled' check (status in ('disabled', 'enabled', 'error')),
  credentials_ciphertext bytea null,
  credentials_nonce bytea null,
  credentials_tag bytea null,
  credentials_key_version integer null,
  settings jsonb not null default '{}'::jsonb,
  last_health_at timestamptz null,
  last_health_status text null check (last_health_status in ('healthy', 'degraded', 'unhealthy')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  health_error text null,
  constraint storage_credentials_envelope_complete check (
    (credentials_ciphertext is null and credentials_nonce is null and credentials_tag is null and credentials_key_version is null)
    or (credentials_ciphertext is not null and credentials_nonce is not null and credentials_tag is not null and credentials_key_version is not null)
  ),
  constraint storage_settings_is_object check (jsonb_typeof(settings) = 'object')
);

comment on table app.storage_connections is 'Per-tenant provider registry. Credentials are AES-256-GCM envelopes written by the server; no client ever reads their plaintext.';

create unique index storage_connections_company_provider_key
  on app.storage_connections (company_id, provider)
  where deleted_at is null;

create trigger storage_connections_touch_updated_at
  before update on app.storage_connections
  for each row execute function app.touch_updated_at();

create trigger storage_connections_guard_optimistic_version
  before update on app.storage_connections
  for each row execute function app.guard_optimistic_version();

create trigger storage_connections_audit
  after insert or update on app.storage_connections
  for each row execute function app.audit_mutation_trigger();

create table app.file_records (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  storage_provider text not null check (storage_provider in ('google_drive', 'supabase_storage')),
  provider_object_id text not null check (char_length(provider_object_id) between 1 and 1024),
  provider_parent_ref text null,
  category text not null check (category in ('kyc', 'invoice', 'receipt', 'branding', 'export', 'attachment', 'other')),
  original_filename text not null check (char_length(original_filename) between 1 and 500),
  sanitized_filename text not null check (char_length(sanitized_filename) between 1 and 500),
  mime_type text not null check (mime_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'),
  byte_length bigint not null check (byte_length >= 0 and byte_length <= 5368709120),
  encryption_key_version integer not null check (encryption_key_version >= 1),
  encryption_nonce bytea not null check (octet_length(encryption_nonce) = 12),
  encryption_tag bytea not null check (octet_length(encryption_tag) = 16),
  ciphertext_sha256 char(64) not null,
  plaintext_hmac char(64) not null,
  migration_state text not null default 'stable' check (migration_state in ('stable', 'migrating', 'retaining')),
  quarantine_status text not null default 'clean' check (quarantine_status in ('clean', 'pending', 'quarantined', 'released')),
  published_at timestamptz null,
  uploaded_by uuid null,
  uploaded_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint file_metadata_is_object check (jsonb_typeof(metadata) = 'object'),
  constraint file_publication_requires_clean check (
    published_at is null or quarantine_status = 'clean'
  )
);

comment on table app.file_records is 'Authoritative encrypted-file metadata: provider, object id, encryption envelope, integrity hashes, migration and quarantine state, optimistic version. Reads use storage_provider as recorded.';

create unique index file_records_provider_object_key
  on app.file_records (company_id, storage_provider, provider_object_id)
  where deleted_at is null;

create index file_records_company_category_idx
  on app.file_records (company_id, category, created_at desc)
  where deleted_at is null;

create index file_records_dedupe_idx
  on app.file_records (company_id, plaintext_hmac)
  where deleted_at is null and quarantine_status = 'clean';

create index file_records_migration_state_idx
  on app.file_records (migration_state)
  where migration_state <> 'stable';

create trigger file_records_touch_updated_at
  before update on app.file_records
  for each row execute function app.touch_updated_at();

create trigger file_records_guard_optimistic_version
  before update on app.file_records
  for each row execute function app.guard_optimistic_version();

create trigger file_records_audit
  after insert or update on app.file_records
  for each row execute function app.audit_mutation_trigger();

create table app.file_quarantine (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  file_id uuid not null references app.file_records (id) on delete restrict,
  detector text not null check (detector ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  verdict text not null check (verdict in ('clean', 'suspicious', 'malicious', 'error')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'released', 'deleted', 'acknowledged')),
  decided_by uuid null,
  decided_at timestamptz null,
  constraint quarantine_details_is_object check (jsonb_typeof(details) = 'object'),
  constraint quarantine_decision_consistency check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

comment on table app.file_quarantine is 'Malware and policy verdicts per file. A file is never published while any pending or malicious quarantine row exists.';

create index file_quarantine_file_status_idx
  on app.file_quarantine (file_id, status);

create trigger file_quarantine_touch_updated_at
  before update on app.file_quarantine
  for each row execute function app.touch_updated_at();

create trigger file_quarantine_guard_optimistic_version
  before update on app.file_quarantine
  for each row execute function app.guard_optimistic_version();

create trigger file_quarantine_audit
  after insert or update on app.file_quarantine
  for each row execute function app.audit_mutation_trigger();

create table app.storage_migration_jobs (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  file_id uuid not null references app.file_records (id) on delete restrict,
  command_id uuid not null references app.command_approvals (id) on delete restrict,
  source_provider text not null check (source_provider in ('google_drive', 'supabase_storage')),
  target_provider text not null check (target_provider in ('google_drive', 'supabase_storage')),
  status text not null default 'queued' check (
    status in ('queued', 'copying', 'verifying', 'switching', 'retaining', 'completed', 'failed', 'cancelled')
  ),
  copied_bytes bigint not null default 0 check (copied_bytes >= 0),
  verified_ciphertext boolean not null default false,
  retain_until timestamptz null,
  error text null,
  result jsonb null,
  constraint migration_result_is_object check (result is null or jsonb_typeof(result) = 'object'),
  constraint migration_providers_differ check (source_provider <> target_provider)
);

comment on table app.storage_migration_jobs is 'Approval-gated provider migration: copy encrypted object, verify ciphertext integrity, atomic provider flip, retention window before source removal. Retry-safe and resumable.';

-- Exactly one active migration per file; idempotent by construction.
create unique index storage_migration_active_file_key
  on app.storage_migration_jobs (file_id)
  where status in ('queued', 'copying', 'verifying', 'switching', 'retaining');

create index storage_migration_runnable_idx
  on app.storage_migration_jobs (status, created_at)
  where status in ('queued', 'copying', 'verifying', 'switching', 'retaining');

create trigger storage_migration_jobs_touch_updated_at
  before update on app.storage_migration_jobs
  for each row execute function app.touch_updated_at();

create trigger storage_migration_jobs_guard_optimistic_version
  before update on app.storage_migration_jobs
  for each row execute function app.guard_optimistic_version();

create trigger storage_migration_jobs_audit
  after insert or update on app.storage_migration_jobs
  for each row execute function app.audit_mutation_trigger();

alter table app.storage_connections enable row level security;
alter table app.storage_connections force row level security;
alter table app.file_records enable row level security;
alter table app.file_records force row level security;
alter table app.file_quarantine enable row level security;
alter table app.file_quarantine force row level security;
alter table app.storage_migration_jobs enable row level security;
alter table app.storage_migration_jobs force row level security;

-- Tenant members list their own files; connection truth stays server-side
-- because it contains credential envelopes and health detail.
create policy file_records_member_read
  on app.file_records
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
  );

create policy file_quarantine_member_read
  on app.file_quarantine
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
  );

create policy storage_migration_jobs_member_read
  on app.storage_migration_jobs
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
  );

-- Connection rows are readable only by tenant owner and platform staff;
-- credential columns are additionally withheld by explicit column selection
-- in every repository and by the privileged-only write path.
create policy storage_connections_owner_read
  on app.storage_connections
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and app.current_user_role() in ('super_admin', 'ceo', 'owner')
  );
