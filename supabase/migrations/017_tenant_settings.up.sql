-- path: supabase/migrations/017_tenant_settings.up.sql
-- Step 03 substep L: tenant profile and invoice settings.
--
-- One row per workspace. company_profiles holds the workspace's public
-- branding, contact, address, and locale; company_invoice_settings holds the
-- invoicing configuration the Step 04 document engine will consume. Both are
-- read and written by the workspace owner (company.profile.* /
-- company.settings.update) and update under optimistic versioning. The
-- workspace name (display_name / legal_name) stays on app.companies as the
-- single source of truth set at onboarding.

create table app.company_profiles (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  tagline text null check (char_length(btrim(tagline)) between 1 and 200),
  logo_url text null check (char_length(btrim(logo_url)) between 1 and 500),
  website text null check (char_length(btrim(website)) between 1 and 300),
  contact_name text null check (char_length(btrim(contact_name)) between 1 and 100),
  contact_email text null check (char_length(btrim(contact_email)) between 3 and 200),
  address_line1 text null check (char_length(btrim(address_line1)) between 1 and 200),
  city text null check (char_length(btrim(city)) between 1 and 100),
  region text null check (char_length(btrim(region)) between 1 and 100),
  postal_code text null check (char_length(btrim(postal_code)) between 1 and 20),
  country text null check (char_length(btrim(country)) between 1 and 200),
  timezone text not null default 'UTC' check (char_length(btrim(timezone)) between 2 and 50),
  locale text not null default 'en' check (char_length(btrim(locale)) between 2 and 10)
);

create unique index idx_company_profiles_company
  on app.company_profiles (company_id)
  where deleted_at is null;

create trigger company_profiles_touch_updated_at
  before update on app.company_profiles
  for each row execute function app.touch_updated_at();

create trigger company_profiles_guard_optimistic_version
  before update on app.company_profiles
  for each row execute function app.guard_optimistic_version();

alter table app.company_profiles enable row level security;
alter table app.company_profiles force row level security;

grant select, insert, update, delete on app.company_profiles to service_role;

comment on table app.company_profiles is 'One workspace profile per company: public branding, contact, address, and locale. Owner-gated, optimistic versioning.';

create table app.company_invoice_settings (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  invoice_number_prefix text null check (char_length(btrim(invoice_number_prefix)) between 1 and 20),
  issue_from_name text null check (char_length(btrim(issue_from_name)) between 1 and 100),
  issue_from_email text null check (char_length(btrim(issue_from_email)) between 3 and 200),
  logo_url text null check (char_length(btrim(logo_url)) between 1 and 500),
  tax_rate numeric(18,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  payment_instructions text null check (char_length(btrim(payment_instructions)) between 1 and 2000),
  terms text null check (char_length(btrim(terms)) between 1 and 2000),
  footer text null check (char_length(btrim(footer)) between 1 and 500),
  default_due_days integer not null default 30 check (default_due_days between 1 and 365)
);

create unique index idx_company_invoice_settings_company
  on app.company_invoice_settings (company_id)
  where deleted_at is null;

create trigger company_invoice_settings_touch_updated_at
  before update on app.company_invoice_settings
  for each row execute function app.touch_updated_at();

create trigger company_invoice_settings_guard_optimistic_version
  before update on app.company_invoice_settings
  for each row execute function app.guard_optimistic_version();

alter table app.company_invoice_settings enable row level security;
alter table app.company_invoice_settings force row level security;

grant select, insert, update, delete on app.company_invoice_settings to service_role;

comment on table app.company_invoice_settings is 'One invoice-settings row per company: numbering prefix, issue-from, tax rate, and text blocks. Owner-gated, optimistic versioning.';
