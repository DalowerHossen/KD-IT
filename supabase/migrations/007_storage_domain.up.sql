-- path: supabase/migrations/007_storage_domain.up.sql
-- Step 02 migration 007: runtime file storage domain. File bytes never
-- live in PostgreSQL columns; this schema stores provider references,
-- encryption envelopes, integrity hashes, quarantine truth, a hardened
-- migration state machine (one active per file), and approval-gated bulk
-- migration jobs.

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
  credentials_key_version integer null check (credentials_key_version is null or credentials_key_version >= 1),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  last_health_at timestamptz null,
  last_health_status text null check (last_health_status is null or last_health_status in ('healthy', 'degraded', 'unhealthy')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  health_error text null,
  constraint storage_credentials_encrypted check (
    (credentials_ciphertext is null and credentials_nonce is null
     and credentials_tag is null and credentials_key_version is null)
    or (credentials_ciphertext is not null
        and credentials_nonce is not null
        and credentials_tag is not null
        and credentials_key_version is not null)
  )
);

comment on table app.storage_connections is 'Registered file-storage providers per tenant. Credential columns carry AES-256-GCM envelopes only (ciphertext, 12-byte nonce, 16-byte tag, key version).';

create unique index storage_connections_company_provider
  on app.storage_connections (company_id, provider)
  where deleted_at is null;

create table app.file_records (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  category text not null default 'other' check (
    category in ('kyc', 'invoice', 'receipt', 'branding', 'attachment', 'export', 'other')
  ),
  storage_provider text not null check (storage_provider in ('google_drive', 'supabase_storage')),
  provider_object_id text not null check (btrim(provider_object_id) <> '' and length(provider_object_id) <= 1024),
  original_name text not null check (btrim(original_name) <> '' and length(original_name) <= 250),
  sanitized_name text not null check (btrim(sanitized_name) <> '' and length(sanitized_name) <= 250),
  mime_type text not null check (btrim(mime_type) <> ''),
  extension text not null check (extension ~ '^\.[a-z0-9]{1,10}$'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 107374182400),
  encryption_ciphertext_sha256 char(64) not null,
  plaintext_hmac char(64) null,
  encryption_nonce_b64 text null,
  encryption_tag_b64 text null,
  encryption_key_version integer not null default 1 check (encryption_key_version >= 1),
  upload_state text not null default 'scanning' check (
    upload_state in ('scanning', 'clean', 'quarantined', 'deleted', 'materializing')
  ),
  uploaded_by uuid null,
  uploaded_at timestamptz null,
  migration_state text not null default 'stable' check (migration_state in ('stable', 'migrating')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint file_publish_never_before_clean check (
    upload_state <> 'clean' or uploaded_at is not null
  )
);

comment on table app.file_records is 'Encrypted file metadata ledger. provider_object_id+provider is where ciphertext lives; reads always honor the recorded provider.';

create unique index file_records_provider_object_idx
  on app.file_records (company_id, storage_provider, provider_object_id)
  where deleted_at is null;

create index file_records_company_category_idx
  on app.file_records (company_id, category, created_at desc)
  where deleted_at is null;

create index file_records_company_quarantine_idx
  on app.file_records (company_id, upload_state, created_at)
  where deleted_at is null;

create index file_records_hashed_dedupe_idx
  on app.file_records (company_id, plaintext_hmac)
  where deleted_at is null and plaintext_hmac is not null;

create table app.file_quarantine (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  file_id uuid not null references app.file_records (id) on delete restrict,
  verdict text not null check (verdict in ('suspicious', 'clean', 'malicious')),
  detector text not null default 'internal' check (detector ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  decided_by uuid null,
  decided_at timestamptz null
);

comment on table app.file_quarantine is 'Scan verdicts per file; releases and purges surface in the audit ledger through the mutation audit trigger.';

create index file_quarantine_file_idx
  on app.file_quarantine (file_id, created_at desc);

-- Per-file migration ledger: exactly one active migration per file
-- (partial unique), with source snapshot and target snapshot enabling
-- deterministic, resumable, idempotent recovery.
create table app.file_migration (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  file_id uuid not null references app.file_records (id) on delete restrict,
  command_id uuid not null references app.command_approvals (id) on delete restrict,
  state text not null check (state in ('pending', 'copying', 'verifying', 'switching', 'retention', 'completed', 'failed')),
  source_provider text not null check (source_provider in ('google_drive', 'supabase_storage')),
  source_object_id text not null,
  source_sha256 char(64) not null,
  target_provider text not null check (target_provider in ('google_drive', 'supabase_storage')),
  target_object_id text null,
  copied_sha256 char(64) null,
  retry_count integer not null default 0 check (retry_count >= 0),
  error text null,
  retention_until timestamptz null,
  old_provider text null,
  old_object_id text null,
  lock_version integer not null default 0 check (lock_version >= 0),
  constraint migration_direction check (source_provider <> target_provider)
);

comment on table app.file_migration is 'One active migration per encrypted file; atomic switch via read-guard + transition updates; retention uses timing-before-purge.';

create unique index file_migration_active_per_file
  on app.file_migration (file_id)
  where deleted_at is null and state not in ('completed', 'failed');

create index file_migration_company_state_idx
  on app.file_migration (company_id, state, created_at);

-- Approval-gated bulk migration job for capacity sweeping (kept distinct
-- from per-file state machine; counter total is reactive).
create table app.storage_migration_jobs (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  command_id uuid not null references app.command_approvals (id) on delete restrict,
  status text not null default 'pending' check (
    status in ('pending', 'scanning', 'copying', 'verifying', 'switching', 'retention', 'completed', 'failed', 'cancelled')
  ),
  from_provider text not null check (from_provider in ('google_drive', 'supabase_storage')),
  to_provider text not null check (to_provider in ('google_drive', 'supabase_storage')),
  scanned_count integer not null default 0 check (scanned_count >= 0),
  copied_count integer not null default 0 check (copied_count >= 0),
  verified_count integer not null default 0 check (verified_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  retention_until timestamptz null,
  error text null,
  result jsonb null check (result is null or jsonb_typeof(result) = 'object'),
  last_progress_at timestamptz null,
  constraint migration_direction check (from_provider <> to_provider)
);

comment on table app.storage_migration_jobs is 'Bulk provider migration per tenant for capacity rebalancing; per-file state lives in app.file_migration.';

create unique index storage_migration_live_per_company
  on app.storage_migration_jobs (company_id)
  where status not in ('completed', 'failed', 'cancelled') and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Row-level security: enabled + FORCED + default-deny read guard.
-- ---------------------------------------------------------------------------

alter table app.storage_connections enable row level security;
alter table app.storage_connections force row level security;
alter table app.file_records enable row level security;
alter table app.file_records force row level security;
alter table app.file_quarantine enable row level security;
alter table app.file_quarantine force row level security;
alter table app.file_migration enable row level security;
alter table app.file_migration force row level security;
alter table app.storage_migration_jobs enable row level security;
alter table app.storage_migration_jobs force row level security;

-- Provider registry: tenant owner + platform operators read.
create policy storage_connections_owner_read
  on app.storage_connections for select to authenticated
  using (deleted_at is null and company_id = app.current_company_id() and app.current_user_role() = 'owner');

create policy storage_connections_operator_read
  on app.storage_connections for select to authenticated
  using (app.current_user_role() in ('super_admin', 'ceo', 'admin_staff'));

-- Hardened read guard: silently hide quarantined files from members
-- (operators bypass via dedicated policy below).
create policy file_records_member_read_guard
  on app.file_records for select to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and upload_state <> 'quarantined'
  );

create policy file_records_operator_read
  on app.file_records for select to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and app.current_user_role() in ('owner', 'super_admin', 'ceo', 'admin_staff')
  );

create policy file_quarantine_operator_read
  on app.file_quarantine for select to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and app.current_user_role() in ('owner', 'super_admin', 'ceo', 'admin_staff')
  );

create policy file_migration_operator_read
  on app.file_migration for select to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and app.current_user_role() in ('owner', 'super_admin', 'ceo', 'admin_staff')
  );

create policy storage_migration_operator_read
  on app.storage_migration_jobs for select to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and app.current_user_role() in ('owner', 'super_admin', 'ceo', 'admin_staff')
  );

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger storage_connections_touch_updated_at
  before update on app.storage_connections
  for each row execute function app.touch_updated_at();
create trigger storage_connections_guard_optimistic_version
  before update on app.storage_connections
  for each row execute function app.guard_optimistic_version();
create trigger storage_connections_audit
  after insert or update on app.storage_connections
  for each row execute function app.audit_mutation_trigger();

create trigger file_records_touch_updated_at
  before update on app.file_records
  for each row execute function app.touch_updated_at();
create trigger file_records_guard_optimistic_version
  before update on app.file_records
  for each row execute function app.guard_optimistic_version();
create trigger file_records_audit
  after insert or update on app.file_records
  for each row execute function app.audit_mutation_trigger();

create trigger file_quarantine_touch_updated_at
  before update on app.file_quarantine
  for each row execute function app.touch_updated_at();
create trigger file_quarantine_guard_optimistic_version
  before update on app.file_quarantine
  for each row execute function app.guard_optimistic_version();
create trigger file_quarantine_audit
  after insert or update on app.file_quarantine
  for each row execute function app.audit_mutation_trigger();

create trigger file_migration_touch_updated_at
  before update on app.file_migration
  for each row execute function app.touch_updated_at();
create trigger file_migration_guard_optimistic_version
  before update on app.file_migration
  for each row execute function app.guard_optimistic_version();
create trigger file_migration_audit
  after insert or update on app.file_migration
  for each row execute function app.audit_mutation_trigger();

create trigger storage_migration_jobs_touch_updated_at
  before update on app.storage_migration_jobs
  for each row execute function app.touch_updated_at();
create trigger storage_migration_jobs_guard_optimistic_version
  before update on app.storage_migration_jobs
  for each row execute function app.guard_optimistic_version();
create trigger storage_migrations_audit
  after insert or update on app.storage_migration_jobs
  for each row execute function app.audit_mutation_trigger();

-- Audit triggers for base tables (defined in 003; function lives in 004).
create trigger companies_audit
  after insert or update on app.companies
  for each row execute function app.audit_mutation_trigger();

create trigger memberships_audit
  after insert or update on app.memberships
  for each row execute function app.audit_mutation_trigger();

create trigger configuration_audit
  after insert or update on app.configuration_entries
  for each row execute function app.audit_mutation_trigger();

-- Queue dead-letters escalate into the ledger.
create or replace function app.queue_dead_letter_audit()
returns trigger
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  if NEW.status = 'dead_letter' and OLD.status is distinct from 'dead_letter' then
    perform app.audit_append(
      NEW.company_id,
      'queue.dead_letter',
      'queue_jobs',
      NEW.id,
      null,
      'worker',
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'kind', NEW.kind,
        'attempts', NEW.attempts,
        'max_attempts', NEW.max_attempts,
        'last_error', NEW.last_error
      )
    );
  end if;
  return NEW;
end;
$fn$;

create trigger queue_jobs_dead_letter_audit
  after update on app.queue_jobs
  for each row execute function app.queue_dead_letter_audit();

-- ---------------------------------------------------------------------------
-- File-migration state machine (service-role boundary only).
-- ---------------------------------------------------------------------------

-- Prepare copy: marks the target side; source snapshot is frozen here so
-- the copy pipeline can be retried identically.
create or replace function app.storage_fm_prepare_copy(
  p_file_id uuid,
  p_command_id uuid,
  p_target_provider text
)
returns uuid
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_file app.file_records%rowtype;
  v_id uuid;
begin
  select * into v_file
  from app.file_records fr
  where fr.id = p_file_id and fr.deleted_at is null
  for update;
  if not found then
    raise exception 'file not found' using errcode = 'P0002';
  end if;
  if v_file.migration_state = 'migrating' then
    raise exception 'file already under migration' using errcode = '55P03';
  end if;
  if v_file.storage_provider = p_target_provider then
    raise exception 'target provider must differ from current provider' using errcode = '22023';
  end if;

  insert into app.file_migration (
    company_id, file_id, command_id, state,
    source_provider, source_object_id, source_sha256, target_provider
  )
  values (
    v_file.company_id, v_file.id, p_command_id, 'pending',
    v_file.storage_provider, v_file.provider_object_id, v_file.encryption_ciphertext_sha256, p_target_provider
  )
  returning id into v_id;

  update app.file_records fr
  set migration_state = 'migrating'
  where fr.id = v_file.id;

  return v_id;
end;
$fn$;

-- Transition: complete each side-effect-free stage after the external
-- copy/verify step reports success. Lock-version optimistic claim keeps
-- two workers from interleaving on the same migration row.
create or replace function app.storage_fm_transition(
  p_file_migration_id uuid,
  p_from_state text,
  p_to_state text,
  p_target_object_id text default null,
  p_copied_sha256 char(64) default null,
  p_retention_until timestamptz default null,
  p_lock_version integer default null,
  p_error text default null
)
returns app.file_migration
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.file_migration%rowtype;
begin
  select * into v_row
  from app.file_migration m
  where m.id = p_file_migration_id and m.deleted_at is null
  for update;
  if not found then
    raise exception 'migration not found' using errcode = 'P0002';
  end if;
  if p_lock_version is not null and p_lock_version <> v_row.lock_version then
    raise exception 'optimistic lock conflict on migration row' using errcode = '55P03';
  end if;
  if v_row.state <> p_from_state then
    raise exception 'migration state mismatch: % (expected %)', v_row.state, p_from_state
      using errcode = 'P0002';
  end if;

  if p_to_state = 'failed' and p_error is not null then
    update app.file_migration m
    set state = 'failed', retry_count = retry_count + 1, error = left(p_error, 500),
        lock_version = lock_version + 1
    where m.id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  update app.file_migration m
  set state = p_to_state,
      target_object_id = coalesce(p_target_object_id, target_object_id),
      copied_sha256 = coalesce(p_copied_sha256, copied_sha256),
      retention_until = coalesce(p_retention_until, retention_until),
      lock_version = lock_version + 1
  where m.id = v_row.id
  returning * into v_row;
  return v_row;
end;
$fn$;

-- Atomic finalize: only valid from switching or retention; validates
-- ciphertext integrity hash before any provider flip. Returns the completed
-- migration row (authoritative switch evidence).
create or replace function app.storage_fm_finalize(
  p_file_migration_id uuid,
  p_lock_version integer
)
returns app.file_migration
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_mig app.file_migration%rowtype;
  v_file app.file_records%rowtype;
begin
  select * into v_mig
  from app.file_migration m
  where m.id = p_file_migration_id and m.deleted_at is null
  for update;
  if not found
     or v_mig.lock_version <> p_lock_version
     or v_mig.state not in ('switching', 'retention') then
    raise exception 'migration not in a finalizable state' using errcode = '55P03';
  end if;
  if v_mig.target_object_id is null or v_mig.target_object_id = '' then
    raise exception 'switching requires target object recorded' using errcode = '22023';
  end if;

  select * into v_file
  from app.file_records fr where fr.id = v_mig.file_id for update;
  if not found or v_file.deleted_at is not null then
    raise exception 'file row missing during finalize' using errcode = 'P0002';
  end if;
  if coalesce(v_mig.copied_sha256, v_file.encryption_ciphertext_sha256) <> v_file.encryption_ciphertext_sha256 then
    update app.file_migration m
    set state = 'failed', error = 'integrity hash mismatch during finalize',
        lock_version = lock_version + 1
    where m.id = v_mig.id;
    raise exception 'integrity hash mismatch' using errcode = '22023';
  end if;

  update app.file_migration m
  set state = 'completed',
      old_provider = v_file.storage_provider,
      old_object_id = v_file.provider_object_id,
      lock_version = lock_version + 1
  where m.id = v_mig.id
  returning * into v_mig;

  update app.file_records fr
  set storage_provider = v_mig.target_provider,
      provider_object_id = v_mig.target_object_id,
      migration_state = 'stable'
  where fr.id = v_file.id;

  return v_mig;
end;
$fn$;

-- Abort: undo migration when copy/verify failed and file still intact.
create or replace function app.storage_fm_abort(
  p_file_migration_id uuid,
  p_lock_version integer
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_mig app.file_migration%rowtype;
begin
  select * into v_mig
  from app.file_migration m
  where m.id = p_file_migration_id and m.deleted_at is null
  for update;
  if not found or v_mig.lock_version <> p_lock_version then
    raise exception 'migration not abortable (missing or stale lock version)'
      using errcode = '55P03';
  end if;
  if v_mig.state in ('switching') then
    raise exception 'migration is switching; finalize instead' using errcode = '22023';
  end if;
  update app.file_records fr
  set migration_state = 'stable'
  where fr.id = v_mig.file_id and fr.migration_state = 'migrating';
  update app.file_migration m
  set deleted_at = clock_timestamp(), lock_version = lock_version + 1
  where m.id = v_mig.id;
end;
$fn$;

-- Retention completion: after the window, the old provider object has been
-- purged; complete any retention rows whose command reached that point.
create or replace function app.storage_fm_complete_retention(
  p_file_migration_id uuid,
  p_lock_version integer
)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_mig app.file_migration%rowtype;
begin
  select * into v_mig
  from app.file_migration m
  where m.id = p_file_migration_id and m.deleted_at is null
  for update;
  if not found or v_mig.lock_version <> p_lock_version or v_mig.state <> 'retention' then
    raise exception 'retention row not in a completable state' using errcode = 'P0002';
  end if;
  if v_mig.retention_until is null or clock_timestamp() < v_mig.retention_until then
    raise exception 'retention window not elapsed' using errcode = '22023';
  end if;
  update app.file_migration m
  set state = 'completed', lock_version = lock_version + 1
  where m.id = v_mig.id;
end;
$fn$;
