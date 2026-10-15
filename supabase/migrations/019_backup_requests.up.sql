-- path: supabase/migrations/019_backup_requests.up.sql
-- Step 03 substep N: encrypted backup requests.
--
-- A workspace whose plan holds the "backups" entitlement (Professional)
-- requests an encrypted export of its data. The request starts pending; a
-- background worker (Step 16) fulfils it by snapshotting the workspace,
-- encrypting the snapshot with the Step 02 data-plane envelope (the data key
-- is derived from the workspace + request, so no separate key is stored),
-- storing the ciphertext here, and recording its SHA-256. The owner downloads
-- the decrypted export within the expiry window. Lifecycle: pending -> ready
-- (or failed), then expired.

create table app.backup_requests (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  requested_by uuid not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'expired')),
  fulfilled_at timestamptz null,
  expires_at timestamptz null,
  artifact bytea null,
  artifact_sha256 text null check (artifact_sha256 is null or char_length(artifact_sha256) = 64),
  artifact_size_bytes bigint null check (artifact_size_bytes is null or artifact_size_bytes >= 0),
  failure_reason text null check (failure_reason is null or char_length(btrim(failure_reason)) between 1 and 500)
);

create index idx_backup_requests_company
  on app.backup_requests (company_id)
  where deleted_at is null;

create index idx_backup_requests_status
  on app.backup_requests (status, expires_at)
  where deleted_at is null;

create trigger backup_requests_touch_updated_at
  before update on app.backup_requests
  for each row execute function app.touch_updated_at();

create trigger backup_requests_guard_optimistic_version
  before update on app.backup_requests
  for each row execute function app.guard_optimistic_version();

alter table app.backup_requests enable row level security;
alter table app.backup_requests force row level security;

grant select, insert, update, delete on app.backup_requests to service_role;

comment on table app.backup_requests is 'Encrypted backup requests: the lifecycle, the encrypted at-rest artifact (Step 02 envelope), its SHA-256, and the expiry window. Professional workspaces (backups entitlement).';
