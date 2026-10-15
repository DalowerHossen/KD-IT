-- path: supabase/migrations/014_plans_entitlements.up.sql
-- Migration 014 (Substep I): tenant provisioning plan catalog and
-- entitlements.
--
-- app.plans is the platform-scope plan catalog. Each plan carries a USD price
-- (numeric(18,4), canonical decimal across TS/JSON boundaries), a billing
-- period, a storage quota, a member cap, and a JSONB array of feature
-- entitlement keys. The server-side entitlement guard reads the plan assigned
-- to a company (companies.settings.plan_id) and gates features on it. Payment
-- provider credential control is Step 06's; this catalog is reference data.
--
-- Two plans are seeded so the entitlement engine is demonstrable: the free
-- Starter plan (team, billing, security) and a paid Professional plan that
-- additionally enables notifications and encrypted backups.

create table app.plans (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  price numeric(18,4) not null check (price >= 0),
  billing_period text not null check (billing_period in ('month', 'year')),
  storage_quota_bytes bigint not null check (storage_quota_bytes >= 0),
  max_members integer not null check (max_members >= 1),
  entitlements jsonb not null default '[]'::jsonb,
  constraint plans_entitlements_is_array check (jsonb_typeof(entitlements) = 'array'),
  constraint plans_platform_scope check (company_id = app.platform_company_id())
);

comment on table app.plans is 'Platform-scope plan catalog: USD price, billing period, storage/member limits, and feature entitlement keys. Service-role only.';
comment on column app.plans.price is 'Canonical USD numeric(18,4); crosses TS/JSON boundaries as a decimal string.';

create unique index idx_plans_name
  on app.plans (name)
  where deleted_at is null;

create trigger plans_touch_updated_at
  before update on app.plans
  for each row execute function app.touch_updated_at();

create trigger plans_guard_optimistic_version
  before update on app.plans
  for each row execute function app.guard_optimistic_version();

alter table app.plans enable row level security;
alter table app.plans force row level security;

grant select, insert, update, delete on app.plans to service_role;

insert into app.plans
  (company_id, name, price, billing_period, storage_quota_bytes, max_members, entitlements)
values
  (app.platform_company_id(), 'Starter', 0.0000, 'month', 5368709120, 10,
   '["team", "billing", "security"]'),
  (app.platform_company_id(), 'Professional', 49.0000, 'month', 53687091200, 50,
   '["team", "billing", "security", "notifications", "backups"]');
