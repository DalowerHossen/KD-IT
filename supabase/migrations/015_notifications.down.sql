-- path: supabase/migrations/015_notifications.down.sql
-- Rollback for migration 015 (Substep J): drops the notification inbox.

drop trigger if exists notifications_guard_optimistic_version on app.notifications;
drop trigger if exists notifications_touch_updated_at on app.notifications;
drop index if exists idx_notifications_unread;
drop index if exists idx_notifications_user_inbox;
drop table if exists app.notifications;
