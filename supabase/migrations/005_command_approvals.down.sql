-- path: supabase/migrations/005_command_approvals.down.sql
-- Rollback of migration 005.

drop policy if exists standing_grants_operator_read on app.standing_grants;
drop policy if exists standing_grants_subject_read on app.standing_grants;
drop policy if exists command_approval_events_queue_read on app.command_approval_events;
drop policy if exists command_approvals_queue_read on app.command_approvals;

drop function if exists app.command_expire_pending(integer);
drop function if exists app.command_execute(uuid, jsonb);
drop function if exists app.command_cancel(uuid);
drop function if exists app.command_escalate(uuid, text);
drop function if exists app.command_delegate(uuid, uuid, text);
drop function if exists app.command_reject(uuid, text, text);
drop function if exists app.command_final_confirm(uuid);
drop function if exists app.command_step_up(uuid);
drop function if exists app.command_approve_l3(uuid, text);
drop function if exists app.command_approve_l2(uuid, text);
drop function if exists app.command_propose(uuid, text, jsonb, interval, text, boolean, text);
drop function if exists app.command_record_event(uuid, uuid, text, text, uuid, jsonb);
drop function if exists app.has_standing_grant(uuid, text);

drop trigger if exists command_events_reject_mutation on app.command_approval_events;
drop trigger if exists standing_grants_audit on app.standing_grants;
drop trigger if exists standing_grants_guard_optimistic_version on app.standing_grants;
drop trigger if exists standing_grants_touch_updated_at on app.standing_grants;
drop trigger if exists command_approvals_audit on app.command_approvals;
drop trigger if exists command_approvals_guard_optimistic_version on app.command_approvals;
drop trigger if exists command_approvals_touch_updated_at on app.command_approvals;

drop table if exists app.standing_grants;
drop table if exists app.command_approval_events;
drop table if exists app.command_approvals;
