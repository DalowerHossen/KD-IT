-- path: supabase/migrations/006_concurrency_outbox.down.sql
-- Rollback of migration 006.

drop trigger if exists leader_locks_guard_optimistic_version on app.leader_locks;
drop trigger if exists leader_locks_touch_updated_at on app.leader_locks;
drop trigger if exists queue_jobs_guard_optimistic_version on app.queue_jobs;
drop trigger if exists queue_jobs_touch_updated_at on app.queue_jobs;
drop trigger if exists rate_limit_counters_guard_optimistic_version on app.rate_limit_counters;
drop trigger if exists rate_limit_counters_touch_updated_at on app.rate_limit_counters;
drop trigger if exists outbox_events_guard_optimistic_version on app.outbox_events;
drop trigger if exists outbox_events_touch_updated_at on app.outbox_events;
drop trigger if exists idempotency_keys_guard_optimistic_version on app.idempotency_keys;
drop trigger if exists idempotency_keys_touch_updated_at on app.idempotency_keys;

drop policy if exists queue_jobs_company_read on app.queue_jobs;
drop policy if exists outbox_company_read on app.outbox_events;
drop policy if exists idempotency_company_read on app.idempotency_keys;

drop function if exists app.storage_quota_release(bigint);
drop function if exists app.storage_quota_claim(bigint);
drop function if exists app.leader_release(uuid, text, text);
drop function if exists app.leader_try_acquire(uuid, text, text, integer);
drop function if exists app.queue_fail(uuid, text, text, interval);
drop function if exists app.queue_succeed(uuid, text, jsonb);
drop function if exists app.queue_claim(text, text[], integer, integer);
drop function if exists app.rate_limit_hit(uuid, text, integer, integer);
drop function if exists app.outbox_reschedule(uuid, text, text, interval);
drop function if exists app.outbox_mark_published(uuid, text);
drop function if exists app.outbox_claim(text, integer, interval);
drop function if exists app.idempotency_fail(uuid, text, text);
drop function if exists app.idempotency_complete(uuid, text, text, jsonb);
drop function if exists app.idempotency_begin(uuid, text, text, char, interval, interval);

drop table if exists app.leader_locks;
drop table if exists app.queue_jobs;
drop table if exists app.rate_limit_counters;
drop table if exists app.outbox_events;
drop table if exists app.idempotency_keys;
