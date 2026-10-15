-- path: supabase/migrations/018_custom_domains.up.sql
-- Step 03 substep M: tenant custom domains.
--
-- A workspace requests a custom domain; the row starts pending with an opaque
-- verification token the owner publishes as a DNS TXT record. A platform
-- operator verifies ownership (the observed record value must match the
-- token) and the domain becomes active. Request and read are tenant-scoped
-- (domain.request / domain.read); verification is platform-scoped
-- (domain.verify). Each domain is claimed by at most one workspace.

create table app.custom_domains (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  domain text not null check (char_length(btrim(domain)) between 4 and 253),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verification_token text not null check (char_length(btrim(verification_token)) between 16 and 64),
  verified_at timestamptz null,
  failure_reason text null check (char_length(btrim(failure_reason)) between 1 and 500)
);

create unique index idx_custom_domains_domain
  on app.custom_domains (domain)
  where deleted_at is null;

create index idx_custom_domains_company
  on app.custom_domains (company_id)
  where deleted_at is null;

create index idx_custom_domains_status
  on app.custom_domains (status)
  where deleted_at is null;

create trigger custom_domains_touch_updated_at
  before update on app.custom_domains
  for each row execute function app.touch_updated_at();

create trigger custom_domains_guard_optimistic_version
  before update on app.custom_domains
  for each row execute function app.guard_optimistic_version();

alter table app.custom_domains enable row level security;
alter table app.custom_domains force row level security;

grant select, insert, update, delete on app.custom_domains to service_role;

comment on table app.custom_domains is 'Tenant custom domains: the claimed domain, verification status, and opaque DNS verification token. Request/read are tenant-scoped; verification is platform-scoped.';
