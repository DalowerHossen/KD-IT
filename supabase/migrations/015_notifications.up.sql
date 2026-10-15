-- path: supabase/migrations/015_notifications.up.sql
-- Migration 015 (Substep J): the in-app notification inbox.
--
-- app.notifications is a per-recipient notification row. The working
-- (company) context is recorded for scope, but a recipient reads their own
-- feed across workspaces. A read_at timestamp tracks the read state; the
-- unread count is derived from it. Optional email delivery of a notification
-- is gated by the "notifications" entitlement on the company's plan (Substep I)
-- and routed through the universal-SMTP pipeline (Substep H).

create table app.notifications (
  id uuid primary key default app.uuid_v7(),
  company_id uuid not null references app.companies (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz null,
  version integer not null default 1,
  user_id uuid not null,
  type text not null check (type in (
    'membership.invited',
    'membership.role_changed',
    'workspace.ready',
    'security.alert'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(body) between 1 and 2000),
  related_id uuid null,
  read_at timestamptz null
);

comment on table app.notifications is 'Per-recipient in-app notification feed. Read state tracked by read_at; the recipient reads their own feed.';
comment on column app.notifications.related_id is 'Optional id of the domain row this notification is about (membership, company, etc.).';

create index idx_notifications_user_inbox
  on app.notifications (user_id, created_at desc)
  where deleted_at is null;

create index idx_notifications_unread
  on app.notifications (user_id)
  where deleted_at is null and read_at is null;

create trigger notifications_touch_updated_at
  before update on app.notifications
  for each row execute function app.touch_updated_at();

create trigger notifications_guard_optimistic_version
  before update on app.notifications
  for each row execute function app.guard_optimistic_version();

alter table app.notifications enable row level security;
alter table app.notifications force row level security;

grant select, insert, update, delete on app.notifications to service_role;
