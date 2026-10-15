-- path: supabase/migrations/010_auth_lifecycle.up.sql
-- Step 03 substep B migration 010: authentication lifecycle records.
-- Adds the pending_approval profile status for the signup, verification,
-- approval, and activation workflow; stores encrypted session refresh
-- tokens so per-session revocation and logout-everywhere are real provider
-- revocations instead of mirror-only flags; and creates the password
-- history store that blocks reuse of the previous five passwords.

-- Signup lifecycle gains an explicit platform-approval state between email
-- verification and activation.
alter table app.profiles drop constraint if exists profiles_status_check;

alter table app.profiles add constraint profiles_status_check
  check (status in (
    'pending_verification',
    'pending_approval',
    'active',
    'suspended',
    'deactivated'
  ));

comment on column app.profiles.status is 'Identity lifecycle: pending_verification after signup, pending_approval after email verification, active after platform approval. Suspended and deactivated deny with generic errors.';

-- Session refresh-token envelopes. Columns mirror the storage_connections
-- AES-256-GCM envelope shape (ciphertext, 12-byte nonce, 16-byte tag, key
-- version) with company, session, and category bound as authenticated
-- context. The SHA-256 fingerprint identifies the current session without
-- exposing a usable credential. Migrations 009 and 010 are applied to
-- greenfield databases only, so NOT NULL needs no backfill.
alter table app.auth_sessions
  add column refresh_token_ciphertext bytea not null,
  add column refresh_token_nonce bytea not null,
  add column refresh_token_tag bytea not null,
  add column refresh_token_key_version integer not null check (refresh_token_key_version >= 1),
  add column refresh_token_sha256 text not null check (refresh_token_sha256 ~ '^[0-9a-f]{64}$');

comment on column app.auth_sessions.refresh_token_ciphertext is 'AES-256-GCM ciphertext of the provider refresh token. Decrypted only inside the server revocation boundary.';
comment on column app.auth_sessions.refresh_token_sha256 is 'SHA-256 fingerprint of the refresh token. Matchable but never usable as a credential.';

create unique index idx_auth_sessions_user_token
  on app.auth_sessions (user_id, refresh_token_sha256)
  where deleted_at is null and revoked_at is null;

-- One live row per user and device key so logins upsert instead of
-- duplicating devices.
create unique index idx_auth_devices_user_key
  on app.auth_devices (user_id, device_key_hash)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Password history: previous password verifiers for reuse prevention. Each
-- row holds one scrypt verifier; writers keep the newest five per user.
-- This table carries no browser grant and no row-wise audit trigger:
-- verifiers must never enter audit metadata or leave the server boundary.
-- ---------------------------------------------------------------------------
create table app.password_history (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  user_id uuid not null,
  password_hash text not null check (char_length(password_hash) between 32 and 512),
  constraint password_history_platform_scope check (company_id = app.platform_company_id())
);

comment on table app.password_history is 'Previous scrypt password verifiers, newest five per user. Service-role only; never audited row-wise because verifiers must not enter audit metadata.';

create index idx_password_history_user_created
  on app.password_history (user_id, created_at desc);

create trigger password_history_touch_updated_at
  before update on app.password_history
  for each row execute function app.touch_updated_at();

create trigger password_history_guard_optimistic_version
  before update on app.password_history
  for each row execute function app.guard_optimistic_version();

alter table app.password_history enable row level security;
alter table app.password_history force row level security;

grant select, insert, update, delete on app.password_history to service_role;
