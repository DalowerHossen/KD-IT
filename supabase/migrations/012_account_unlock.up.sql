-- path: supabase/migrations/012_account_unlock.up.sql
-- Migration 012 (Substep F): optimistic-locked, active-only account unlock.
--
-- The permissioned unlock flow (an auth.account.unlock approval command)
-- clears an account lock through this single atomic writer. It is the only
-- path that may lift a lock: it re-checks the caller's expected version (so a
-- concurrent clear cannot win), refuses to touch a window that has already
-- expired on its own, and records the unlocking actor, the approving command,
-- and the reason as immutable evidence. A cleared lock also restarts the
-- failure sequence at zero. No browser role may execute it.

create or replace function app.auth_locks_clear(
  p_subject_hash text,
  p_unlocked_by uuid,
  p_command_id uuid,
  p_reason text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.auth_locks%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'an unlock reason is required' using errcode = '22023';
  end if;

  select * into v_row
  from app.auth_locks
  where subject_hash = p_subject_hash
    and deleted_at is null
  for update;

  if not found then
    raise exception 'no authentication lock state exists for this subject'
      using errcode = 'P0002';
  end if;

  if v_row.version <> p_expected_version then
    raise exception 'stale authentication lock state (expected version %)',
      p_expected_version
      using errcode = '40001';
  end if;

  if v_row.locked_until is null or v_row.locked_until <= v_now then
    -- The window already expired on its own; nothing to lift. This is a
    -- safe no-op so a replayed unlock is idempotent.
    return jsonb_build_object(
      'cleared', false,
      'reason', 'no_active_lock',
      'locked_until', v_row.locked_until,
      'unlocked_by', v_row.unlocked_by,
      'unlock_command_id', v_row.unlock_command_id,
      'version', v_row.version
    );
  end if;

  update app.auth_locks
  set locked_until = null,
      consecutive_failures = 0,
      last_failure_at = null,
      unlocked_by = p_unlocked_by,
      unlock_command_id = p_command_id,
      unlock_reason = btrim(p_reason)
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'cleared', true,
    'reason', 'cleared',
    'locked_until', v_row.locked_until,
    'unlocked_by', v_row.unlocked_by,
    'unlock_command_id', v_row.unlock_command_id,
    'version', v_row.version
  );
end;
$fn$;

comment on function app.auth_locks_clear(text, uuid, uuid, text, integer) is
  'Optimistic-locked, active-only unlock writer. Records actor, command, and reason; restarts the failure sequence.';

grant execute on function app.auth_locks_clear(text, uuid, uuid, text, integer) to service_role;
revoke execute on function app.auth_locks_clear(text, uuid, uuid, text, integer) from authenticated, anon, public;
