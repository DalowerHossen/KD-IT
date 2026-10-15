-- path: supabase/migrations/016_coupons.up.sql
-- Step 03 substep K: the platform coupon catalog.
--
-- Coupons are platform-scope reference data: a discount code with a type
-- (percent or fixed), a canonical USD value, and optional usage, lifetime,
-- and plan-scope limits. Issuing a coupon is the approval command
-- billing.coupon.issue (super_admin/ceo). Redeeming one is an atomic,
-- race-safe read-modify-write so concurrent redemptions can never exceed
-- max_uses.
--
-- Monetary columns are canonical USD numeric(18,4); they cross the TS/JSON
-- boundary as decimal strings via the pg type parsers (lib/money).

create table app.coupons (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  code text not null check (char_length(btrim(code)) between 3 and 40),
  type text not null check (type in ('percent', 'fixed')),
  value numeric(18,4) not null check (value >= 0),
  constraint coupons_percent_range check (type <> 'percent' or value <= 100),
  currency text not null default 'USD' check (currency = 'USD'),
  max_uses integer null check (max_uses is null or max_uses >= 1),
  used_count integer not null default 0 check (used_count >= 0),
  min_order_amount numeric(18,4) null check (min_order_amount is null or min_order_amount >= 0),
  applies_to_plan_id uuid null references app.plans (id) on delete restrict,
  expires_at timestamptz null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

comment on table app.coupons is 'Platform-scope coupon catalog: discount code, type, canonical USD value, usage/lifetime/plan limits, and status. Service-role only.';
comment on column app.coupons.value is 'Canonical USD numeric(18,4). For percent type this is 0..100; for fixed type it is an absolute USD amount. Crosses TS/JSON boundaries as a decimal string.';

create unique index idx_coupons_code
  on app.coupons (code)
  where deleted_at is null;

create index idx_coupons_status
  on app.coupons (status)
  where deleted_at is null;

create trigger coupons_touch_updated_at
  before update on app.coupons
  for each row execute function app.touch_updated_at();

create trigger coupons_guard_optimistic_version
  before update on app.coupons
  for each row execute function app.guard_optimistic_version();

alter table app.coupons enable row level security;
alter table app.coupons force row level security;

grant select, insert, update, delete on app.coupons to service_role;
