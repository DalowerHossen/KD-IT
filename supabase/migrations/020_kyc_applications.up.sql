-- path: supabase/migrations/020_kyc_applications.up.sql
-- Step 03 substep O: KYC upload and review.
--
-- A workspace owner submits a KYC application: the business details are
-- encrypted with the Step 02 data-plane envelope (the data key is derived from
-- the workspace + application, so no separate key is stored) and the supporting
-- documents live in Step 02 storage under the "kyc" file category. The
-- application tracks approval states (pending -> under_review -> approved or
-- rejected, then expired). A background worker expires approved applications
-- once their validity window passes, and a sanctions-screening hook records a
-- screening verdict per application. The application's effective status is the
-- basis for downstream feature gating (merchant-of-record unlock is Step 05).

create table app.kyc_applications (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'under_review', 'approved', 'rejected', 'expired')),
  business_type text not null check (
    business_type in ('sole_proprietorship', 'partnership', 'llc', 'corporation', 'non_profit', 'other')
  ),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  details bytea not null,
  details_sha256 text not null check (char_length(details_sha256) = 64),
  documents jsonb not null default '{}'::jsonb check (jsonb_typeof(documents) = 'object'),
  submitted_by uuid not null,
  submitted_at timestamptz not null default clock_timestamp(),
  review_started_by uuid null,
  review_started_at timestamptz null,
  review_note text null check (review_note is null or char_length(btrim(review_note)) between 1 and 500),
  decided_by uuid null,
  decided_at timestamptz null,
  decision_reason text null check (decision_reason is null or char_length(btrim(decision_reason)) between 1 and 500),
  decision_command_id uuid null references app.command_approvals (id) on delete restrict,
  valid_until timestamptz null,
  resubmission_requested_by uuid null,
  resubmission_requested_at timestamptz null,
  resubmission_reason text null check (resubmission_reason is null or char_length(btrim(resubmission_reason)) between 1 and 500),
  sanctions_status text not null default 'unscreened' check (sanctions_status in ('unscreened', 'cleared', 'flagged'))
);

comment on table app.kyc_applications is 'KYC applications: approval states, the encrypted business details (Step 02 envelope), the Step 02 "kyc" file references, the review/decision trail, the validity window, and the sanctions-screening verdict.';

create unique index idx_kyc_applications_active
  on app.kyc_applications (company_id)
  where status in ('pending', 'under_review') and deleted_at is null;

create index idx_kyc_applications_review_queue
  on app.kyc_applications (submitted_at desc)
  where status in ('pending', 'under_review') and deleted_at is null;

create index idx_kyc_applications_company
  on app.kyc_applications (company_id, created_at desc)
  where deleted_at is null;

create trigger kyc_applications_touch_updated_at
  before update on app.kyc_applications
  for each row execute function app.touch_updated_at();

create trigger kyc_applications_guard_optimistic_version
  before update on app.kyc_applications
  for each row execute function app.guard_optimistic_version();

alter table app.kyc_applications enable row level security;
alter table app.kyc_applications force row level security;

grant select, insert, update, delete on app.kyc_applications to service_role;

-- Extend the in-app notification vocabulary with the KYC lifecycle types so a
-- workspace owner is notified when their application is requested for
-- resubmission, approved, rejected, nearing expiry, or expired.
do $$
declare
  rec record;
begin
  for rec in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where rel.relname = 'notifications'
      and nsp.nspname = 'app'
      and con.contype = 'c'
      and (
        select bool_or(a.attname = 'type')
        from unnest(con.conkey) as k(att)
        join pg_attribute a on a.attrelid = rel.oid and a.attnum = k.att
      )
  loop
    execute format('alter table app.notifications drop constraint %I', rec.conname);
  end loop;
end;
$$;

alter table app.notifications add constraint notifications_type_check
  check (type in (
    'membership.invited',
    'membership.role_changed',
    'workspace.ready',
    'security.alert',
    'kyc.submission_requested',
    'kyc.approved',
    'kyc.rejected',
    'kyc.expiring',
    'kyc.expired'
  ));
