-- path: supabase/migrations/003_companies_memberships.up.sql
-- Step 02 migration 003: tenant registry (with the reserved platform
-- company), memberships, and tenant-scoped configuration entries.

create table app.companies (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 200),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  is_platform boolean not null default false,
  storage_quota_bytes bigint not null default 5368709120 check (storage_quota_bytes >= 0),
  settings jsonb not null default '{}'::jsonb,
  constraint companies_settings_is_object check (jsonb_typeof(settings) = 'object')
);

comment on table app.companies is 'Tenant registry. The reserved platform company (is_platform) holds platform-scope rows; company_id references the owning boundary (platform for tenants).';
comment on column app.companies.company_id is 'Owning tenant boundary: the platform company for tenant rows, self-reference for the platform row. Never NULL per database contract.';

create unique index companies_platform_singleton_idx
  on app.companies (is_platform)
  where is_platform and deleted_at is null;

create index companies_company_id_idx on app.companies (company_id) where deleted_at is null;

create trigger companies_touch_updated_at
  before update on app.companies
  for each row execute function app.touch_updated_at();

create trigger companies_guard_optimistic_version
  before update on app.companies
  for each row execute function app.guard_optimistic_version();

create table app.memberships (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  user_id uuid not null,
  role text not null check (role in ('super_admin', 'ceo', 'admin_staff', 'owner', 'staff')),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'revoked')),
  invited_by uuid null,
  invited_at timestamptz null,
  activated_at timestamptz null,
  constraint memberships_active_role_consistency check (
    (status = 'active' and activated_at is not null)
    or (status <> 'active')
  )
);

comment on table app.memberships is 'User-to-tenant binding with role. Platform staff (super_admin, ceo, admin_staff) are scoped to the platform company; tenants to their company.';

create unique index memberships_company_user_key
  on app.memberships (company_id, user_id)
  where deleted_at is null;

create index memberships_user_id_idx
  on app.memberships (user_id)
  where deleted_at is null and status = 'active';

create trigger memberships_touch_updated_at
  before update on app.memberships
  for each row execute function app.touch_updated_at();

create trigger memberships_guard_optimistic_version
  before update on app.memberships
  for each row execute function app.guard_optimistic_version();

create table app.configuration_entries (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  config_key text not null check (config_key ~ '^[a-z][a-z0-9_.]{1,120}$'),
  scope text not null default 'company' check (scope in ('platform', 'company')),
  value jsonb not null,
  is_secret boolean not null default false,
  updated_by uuid null,
  correlation_id uuid null,
  constraint configuration_platform_scope_company check (
    (scope = 'platform' and company_id = app.platform_company_id())
    or (scope = 'company')
  ),
  constraint configuration_value_is_scalar_or_object check (
    jsonb_typeof(value) in ('object', 'array', 'string', 'number', 'boolean')
  )
);

comment on table app.configuration_entries is 'Versioned typed configuration. Secret values are stored encrypted by the application layer; this table only records the envelope.';

create unique index configuration_company_key_idx
  on app.configuration_entries (company_id, config_key)
  where deleted_at is null;

create trigger configuration_entries_touch_updated_at
  before update on app.configuration_entries
  for each row execute function app.touch_updated_at();

create trigger configuration_entries_guard_optimistic_version
  before update on app.configuration_entries
  for each row execute function app.guard_optimistic_version();

-- Reserved platform company: deterministic v7-shaped identifier. The
-- self-referential insert satisfies the NOT NULL tenant boundary.
insert into app.companies (
  id,
  company_id,
  legal_name,
  display_name,
  status,
  is_platform,
  storage_quota_bytes,
  settings,
  created_at,
  updated_at
)
values (
  app.platform_company_id(),
  app.platform_company_id(),
  'KD SOLUTION IT Platform',
  'KD SOLUTION IT',
  'active',
  true,
  0,
  '{"purpose":"reserved platform company for platform-scope records"}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
)
on conflict (id) do nothing;

alter table app.companies enable row level security;
alter table app.companies force row level security;
alter table app.memberships enable row level security;
alter table app.memberships force row level security;
alter table app.configuration_entries enable row level security;
alter table app.configuration_entries force row level security;

-- Default deny: anon receives no policy. authenticated reads memberships it
-- owns plus the platform row needed for bootstrapping context resolution.
create policy memberships_self_read
  on app.memberships
  for select
  to authenticated
  using (
    deleted_at is null
    and user_id = app.current_user_id()
  );

create policy memberships_platform_staff_read
  on app.memberships
  for select
  to authenticated
  using (
    deleted_at is null
    and company_id = app.current_company_id()
    and app.current_user_role() in ('super_admin', 'ceo')
  );

-- Company reads: members see their company; the platform row is readable by
-- any authenticated principal so role resolution can confirm scope.
create policy companies_member_read
  on app.companies
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      is_platform
      or id = app.current_company_id()
      or exists (
        select 1 from app.memberships m
        where m.company_id = app.companies.id
          and m.user_id = app.current_user_id()
          and m.status = 'active'
          and m.deleted_at is null
      )
    )
  );

-- Configuration: company entries read by tenant members; platform entries
-- only by platform staff. No direct client writes anywhere (RPC-only).
create policy configuration_member_read
  on app.configuration_entries
  for select
  to authenticated
  using (
    deleted_at is null
    and scope = 'company'
    and company_id = app.current_company_id()
  );

create policy configuration_platform_staff_read
  on app.configuration_entries
  for select
  to authenticated
  using (
    deleted_at is null
    and scope = 'platform'
    and app.current_user_role() in ('super_admin', 'ceo', 'admin_staff')
  );
