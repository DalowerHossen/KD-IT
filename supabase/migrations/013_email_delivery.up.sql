-- path: supabase/migrations/013_email_delivery.up.sql
-- Migration 013 (Substep H): universal SMTP email delivery foundation.
--
-- Three service-role-only tables back the Substep H email pipeline:
--   app.email_credentials  -> encrypted provider credentials (AES-256-GCM
--                             envelope, mirroring the auth-session token
--                             storage). Verified is a recorded flag set by the
--                             connection-verification command, never inferred.
--   app.email_deliveries   -> one deliverability record per send: lifecycle
--                             status, bounce category, provider message id,
--                             retry count, and terminal timestamps.
--   app.email_suppressions -> addresses that must not receive mail
--                             (permanent bounce, complaint, unsubscribe, or
--                             manual). Enforced by the sender before dispatch.
--
-- No browser role receives any grant: email routing, credentials, and delivery
-- state are server-only. Queues and retries are reused from the Step 02
-- transactional outbox (migration 006); this migration adds only the email
-- domain tables.

create table app.email_credentials (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  provider text not null check (provider in ('resend', 'smtp')),
  from_address text not null check (from_address ~ '^[^@]+@[^@]+$'),
  credentials_ciphertext bytea not null,
  credentials_nonce bytea not null,
  credentials_tag bytea not null,
  credentials_key_version integer not null check (credentials_key_version >= 1),
  verified boolean not null default false,
  verified_at timestamptz null
);

comment on table app.email_credentials is 'Encrypted provider credentials for the universal SMTP port. Service-role only; the ciphertext envelope binds company, provider, and category as authenticated context.';
comment on column app.email_credentials.verified is 'Set only by the connection-verification command after a live adapter handshake succeeds.';

create unique index idx_email_credentials_active_provider
  on app.email_credentials (company_id, provider)
  where deleted_at is null;

create trigger email_credentials_touch_updated_at
  before update on app.email_credentials
  for each row execute function app.touch_updated_at();

create trigger email_credentials_guard_optimistic_version
  before update on app.email_credentials
  for each row execute function app.guard_optimistic_version();

create table app.email_deliveries (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  to_address text not null check (to_address ~ '^[^@]+@[^@]+$'),
  from_address text not null,
  subject text not null check (char_length(subject) between 1 and 512),
  provider text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'delivered', 'bounced', 'failed', 'suppressed')),
  bounce_category text null check (bounce_category in ('permanent', 'temporary', 'unknown')),
  provider_message_id text null check (char_length(provider_message_id) <= 256),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text null check (char_length(last_error) <= 500),
  outbox_event_id uuid null,
  sent_at timestamptz null,
  delivered_at timestamptz null,
  bounced_at timestamptz null
);

comment on table app.email_deliveries is 'Deliverability record per send. The sender advances queued to sending to delivered, bounced, failed, or suppressed; failed rows are retried via the outbox until they exhaust attempts.';

create index idx_email_deliveries_status on app.email_deliveries (status, created_at);
create index idx_email_deliveries_to on app.email_deliveries (company_id, to_address, created_at desc);
create index idx_email_deliveries_outbox on app.email_deliveries (outbox_event_id) where outbox_event_id is not null;

create trigger email_deliveries_touch_updated_at
  before update on app.email_deliveries
  for each row execute function app.touch_updated_at();

create trigger email_deliveries_guard_optimistic_version
  before update on app.email_deliveries
  for each row execute function app.guard_optimistic_version();

create table app.email_suppressions (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  address text not null check (address ~ '^[^@]+@[^@]+$'),
  reason text not null check (reason in ('permanent_bounce', 'complaint', 'unsubscribed', 'manual')),
  source text not null check (char_length(source) between 1 and 128),
  removed_at timestamptz null
);

comment on table app.email_suppressions is 'Addresses that must not receive mail. Enforced by the sender before dispatch; a permanent bounce records one automatically.';

create unique index idx_email_suppressions_active
  on app.email_suppressions (company_id, address)
  where deleted_at is null;

create index idx_email_suppressions_lookup
  on app.email_suppressions (company_id, address);

create trigger email_suppressions_touch_updated_at
  before update on app.email_suppressions
  for each row execute function app.touch_updated_at();

create trigger email_suppressions_guard_optimistic_version
  before update on app.email_suppressions
  for each row execute function app.guard_optimistic_version();

alter table app.email_credentials enable row level security;
alter table app.email_credentials force row level security;

alter table app.email_deliveries enable row level security;
alter table app.email_deliveries force row level security;

alter table app.email_suppressions enable row level security;
alter table app.email_suppressions force row level security;

grant select, insert, update, delete on app.email_credentials to service_role;
grant select, insert, update, delete on app.email_deliveries to service_role;
grant select, insert, update, delete on app.email_suppressions to service_role;
