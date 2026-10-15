-- path: supabase/migrations/009_identity_authorization.up.sql
-- Step 03 substep A migration 009: identity and authorization records.
-- Creates user-global identity profiles, explicit permission grants,
-- device and session metadata, and authentication-attempt and lock
-- records. Extends the existing membership binding with grant provenance
-- instead of duplicating the role assignment. Approved standing read
-- grants reuse app.standing_grants, so no new access-grant table exists.

-- Role-grant provenance on the existing membership binding. The role on
-- memberships remains the single source of truth for role assignment.
alter table app.memberships
  add column granted_by_command_id uuid null references app.command_approvals (id) on delete restrict,
  add column status_reason text null;

comment on column app.memberships.granted_by_command_id is 'Discrete approval command that authorized the current role assignment. Null only for bootstrap rows created before Step 03.';
comment on column app.memberships.status_reason is 'Operator-visible reason for the current membership status. Never carries secrets.';

-- ---------------------------------------------------------------------------
-- Identity profiles: one user-global row per authenticated user. Tenant
-- standing lives on memberships; this row carries identity plus platform
-- standing only, so every row is scoped to the platform company.
-- ---------------------------------------------------------------------------
create table app.profiles (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  user_id uuid not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  status text not null default 'pending_verification' check (status in ('pending_verification', 'active', 'suspended', 'deactivated')),
  status_reason text null,
  deactivated_at timestamptz null,
  constraint profiles_platform_scope check (company_id = app.platform_company_id()),
  constraint profiles_deactivation_consistency check (
    (status = 'deactivated' and deactivated_at is not null)
    or (status <> 'deactivated' and deactivated_at is null)
  )
);

comment on table app.profiles is 'User-global identity record. One live row per authenticated user, scoped to the reserved platform company.';
comment on column app.profiles.user_id is 'Supabase auth user identifier. Referenced by memberships without a database foreign key because auth.users lives outside the app schema.';

create unique index idx_profiles_user_id
  on app.profiles (user_id)
  where deleted_at is null;

create trigger profiles_touch_updated_at
  before update on app.profiles
  for each row execute function app.touch_updated_at();

create trigger profiles_guard_optimistic_version
  before update on app.profiles
  for each row execute function app.guard_optimistic_version();

create trigger profiles_audit
  after insert or update on app.profiles
  for each row execute function app.audit_mutation_trigger();

alter table app.profiles enable row level security;
alter table app.profiles force row level security;

create policy profiles_self_read
  on app.profiles
  for select
  to authenticated
  using (
    deleted_at is null
    and user_id = app.current_user_id()
  );

create policy profiles_platform_staff_read
  on app.profiles
  for select
  to authenticated
  using (
    deleted_at is null
    and app.current_user_role() in ('super_admin', 'ceo')
  );

-- ---------------------------------------------------------------------------
-- Permission grants: explicit, approval-backed, time-boxed permission
-- assignments. Codes are validated against the single TypeScript permission
-- registry at the application boundary; the database enforces shape only so
-- later steps can extend the registry without schema changes.
-- ---------------------------------------------------------------------------
create table app.permission_grants (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  subject_user_id uuid not null,
  permission text not null check (permission ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$'),
  granted_by uuid not null,
  command_id uuid null references app.command_approvals (id) on delete restrict,
  reason text null check (reason is null or char_length(btrim(reason)) between 3 and 280),
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null,
  constraint permission_grant_window check (valid_until is null or valid_until > valid_from),
  constraint permission_grant_revocation check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

comment on table app.permission_grants is 'Explicit permission assignments, including admin_staff permission-bundle grants (bundle.* codes expanded by the application layer).';
comment on column app.permission_grants.command_id is 'Discrete approval command that authorized this grant. Every grant is created through the approval chain.';

create unique index idx_permission_grants_active_key
  on app.permission_grants (company_id, subject_user_id, permission)
  where deleted_at is null and revoked_at is null;

create index idx_permission_grants_subject
  on app.permission_grants (company_id, subject_user_id, valid_from desc)
  where deleted_at is null and revoked_at is null;

create trigger permission_grants_touch_updated_at
  before update on app.permission_grants
  for each row execute function app.touch_updated_at();

create trigger permission_grants_guard_optimistic_version
  before update on app.permission_grants
  for each row execute function app.guard_optimistic_version();

create trigger permission_grants_audit
  after insert or update on app.permission_grants
  for each row execute function app.audit_mutation_trigger();

alter table app.permission_grants enable row level security;
alter table app.permission_grants force row level security;

create policy permission_grants_self_read
  on app.permission_grants
  for select
  to authenticated
  using (
    deleted_at is null
    and revoked_at is null
    and subject_user_id = app.current_user_id()
  );

create policy permission_grants_manager_read
  on app.permission_grants
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and app.current_user_role() in ('super_admin', 'ceo', 'owner')
  );

-- ---------------------------------------------------------------------------
-- Authentication devices: user-global device metadata. Fingerprint material
-- is stored only as an HMAC so raw device signals never persist.
-- ---------------------------------------------------------------------------
create table app.auth_devices (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  user_id uuid not null,
  device_key_hash text not null check (device_key_hash ~ '^[0-9a-f]{64}$'),
  display_label text not null check (char_length(btrim(display_label)) between 1 and 120),
  platform text null check (platform is null or char_length(btrim(platform)) between 1 and 60),
  last_ip inet null,
  last_seen_at timestamptz not null default clock_timestamp(),
  trusted_until timestamptz null,
  revoked_at timestamptz null,
  revoked_reason text null,
  constraint auth_devices_platform_scope check (company_id = app.platform_company_id())
);

comment on table app.auth_devices is 'User-global authentication device metadata. One live row per user and device key hash.';
comment on column app.auth_devices.device_key_hash is 'HMAC of the stable device key. Raw fingerprints are never stored.';

create unique index idx_auth_devices_user_key
  on app.auth_devices (user_id, device_key_hash)
  where deleted_at is null;

create index idx_auth_devices_user_seen
  on app.auth_devices (user_id, last_seen_at desc)
  where deleted_at is null;

create trigger auth_devices_touch_updated_at
  before update on app.auth_devices
  for each row execute function app.touch_updated_at();

create trigger auth_devices_guard_optimistic_version
  before update on app.auth_devices
  for each row execute function app.guard_optimistic_version();

create trigger auth_devices_audit
  after insert or update on app.auth_devices
  for each row execute function app.audit_mutation_trigger();

alter table app.auth_devices enable row level security;
alter table app.auth_devices force row level security;

create policy auth_devices_self_read
  on app.auth_devices
  for select
  to authenticated
  using (
    deleted_at is null
    and user_id = app.current_user_id()
  );

create policy auth_devices_platform_staff_read
  on app.auth_devices
  for select
  to authenticated
  using (
    deleted_at is null
    and app.current_user_role() in ('super_admin', 'ceo')
  );

-- ---------------------------------------------------------------------------
-- Authentication sessions: user-global session metadata mirrored from the
-- Supabase session lifecycle (wired in substep B). Secrets and tokens are
-- never stored here; only revocation and visibility metadata.
-- ---------------------------------------------------------------------------
create table app.auth_sessions (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  user_id uuid not null,
  device_id uuid null references app.auth_devices (id) on delete restrict,
  provider_session_ref text null check (provider_session_ref is null or char_length(provider_session_ref) between 8 and 128),
  ip_address inet null,
  user_agent_hash text null check (user_agent_hash is null or user_agent_hash ~ '^[0-9a-f]{64}$'),
  last_activity_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  revocation_reason text null,
  constraint auth_sessions_platform_scope check (company_id = app.platform_company_id()),
  constraint auth_sessions_expiry_ordered check (expires_at > created_at),
  constraint auth_sessions_revocation check (
    revoked_at is null
    or revoked_at >= created_at
  )
);

comment on table app.auth_sessions is 'User-global session metadata for listing and revocation. Session secrets stay with the auth provider.';
comment on column app.auth_sessions.provider_session_ref is 'Opaque provider session reference. Never a usable credential.';

create index idx_auth_sessions_user_expiry
  on app.auth_sessions (user_id, expires_at desc)
  where deleted_at is null and revoked_at is null;

create trigger auth_sessions_touch_updated_at
  before update on app.auth_sessions
  for each row execute function app.touch_updated_at();

create trigger auth_sessions_guard_optimistic_version
  before update on app.auth_sessions
  for each row execute function app.guard_optimistic_version();

create trigger auth_sessions_audit
  after insert or update on app.auth_sessions
  for each row execute function app.audit_mutation_trigger();

alter table app.auth_sessions enable row level security;
alter table app.auth_sessions force row level security;

create policy auth_sessions_self_read
  on app.auth_sessions
  for select
  to authenticated
  using (
    deleted_at is null
    and user_id = app.current_user_id()
  );

create policy auth_sessions_platform_staff_read
  on app.auth_sessions
  for select
  to authenticated
  using (
    deleted_at is null
    and app.current_user_role() in ('super_admin', 'ceo')
  );

-- ---------------------------------------------------------------------------
-- Authentication attempts: immutable security evidence for the two-failure
-- lock contract (lock engine in substep D). Keyed by subject HMAC so probes
-- against unknown accounts cannot be joined to user rows. This table is its
-- own audit trail and intentionally carries no row-wise audit trigger, the
-- same documented treatment as Step 02 plumbing tables. No browser role
-- receives any grant here: responses stay non-enumerating.
-- ---------------------------------------------------------------------------
create table app.auth_attempts (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid null,
  factor text not null check (factor in ('password', 'totp', 'backup_code', 'oauth', 'recovery')),
  outcome text not null check (outcome in ('success', 'failure')),
  failure_reason_code text null check (failure_reason_code is null or failure_reason_code ~ '^[a-z][a-z0-9_.]{1,80}$'),
  locked_after boolean not null default false,
  ip_address inet null,
  user_agent_hash text null check (user_agent_hash is null or user_agent_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_attempts_platform_scope check (company_id = app.platform_company_id()),
  constraint auth_attempts_success_has_no_reason check (
    outcome = 'failure'
    or (outcome = 'success' and failure_reason_code is null and locked_after = false)
  )
);

comment on table app.auth_attempts is 'Immutable authentication-attempt evidence. Application code inserts only; updates are rejected by convention and locked_after marks lock transitions.';
comment on column app.auth_attempts.subject_hash is 'HMAC identity of the claimed account. Stable per account without exposing which accounts exist.';
comment on column app.auth_attempts.failure_reason_code is 'Machine-readable failure category for responders. Never returned to callers.';

create index idx_auth_attempts_subject_created
  on app.auth_attempts (subject_hash, created_at desc);

create index idx_auth_attempts_user_created
  on app.auth_attempts (user_id, created_at desc)
  where user_id is not null;

create trigger auth_attempts_touch_updated_at
  before update on app.auth_attempts
  for each row execute function app.touch_updated_at();

create trigger auth_attempts_guard_optimistic_version
  before update on app.auth_attempts
  for each row execute function app.guard_optimistic_version();

alter table app.auth_attempts enable row level security;
alter table app.auth_attempts force row level security;

-- ---------------------------------------------------------------------------
-- Authentication locks: one live row per subject carrying the consecutive
-- failure sequence and the active lock window. Updated only through
-- race-safe transactions in the substep D lock engine. No browser role
-- receives any grant here: lock state must never leak to callers.
-- ---------------------------------------------------------------------------
create table app.auth_locks (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid null,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  locked_until timestamptz null,
  lock_count integer not null default 0 check (lock_count >= 0),
  last_failure_at timestamptz null,
  unlocked_by uuid null,
  unlock_command_id uuid null references app.command_approvals (id) on delete restrict,
  unlock_reason text null,
  constraint auth_locks_platform_scope check (company_id = app.platform_company_id()),
  constraint auth_locks_counter_consistency check (
    (consecutive_failures = 0 and last_failure_at is null)
    or (consecutive_failures > 0)
  )
);

comment on table app.auth_locks is 'Consecutive authentication-failure counters and active lock windows. Lock begin and unlock events are audited explicitly by the lock engine with full context.';
comment on column app.auth_locks.unlock_command_id is 'Discrete approval command that authorized the unlock. Historical attempts are never deleted.';

create unique index idx_auth_locks_subject
  on app.auth_locks (subject_hash)
  where deleted_at is null;

create trigger auth_locks_touch_updated_at
  before update on app.auth_locks
  for each row execute function app.touch_updated_at();

create trigger auth_locks_guard_optimistic_version
  before update on app.auth_locks
  for each row execute function app.guard_optimistic_version();

alter table app.auth_locks enable row level security;
alter table app.auth_locks force row level security;

-- ---------------------------------------------------------------------------
-- Privileges. Migration 008 hardened existing tables; new tables need the
-- same treatment explicitly: full DML for the privileged server boundary,
-- policy-gated SELECT for the browser role on self-service tables only,
-- and no browser grant at all on attempt and lock evidence.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on app.profiles to service_role;
grant select, insert, update, delete on app.permission_grants to service_role;
grant select, insert, update, delete on app.auth_devices to service_role;
grant select, insert, update, delete on app.auth_sessions to service_role;
grant select, insert, update, delete on app.auth_attempts to service_role;
grant select, insert, update, delete on app.auth_locks to service_role;

grant select on app.profiles to authenticated;
grant select on app.permission_grants to authenticated;
grant select on app.auth_devices to authenticated;
grant select on app.auth_sessions to authenticated;
