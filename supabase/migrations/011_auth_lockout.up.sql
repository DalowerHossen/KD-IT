-- path: supabase/migrations/011_auth_lockout.up.sql
-- Migration 011 (Substep E): race-safe account-lock engine.
--
-- The app.auth_locks table (migration 009) stores the consecutive-failure
-- counter and the active lock window. This migration adds the two atomic,
-- race-safe writers that the Substep E flows call:
--   app.auth_locks_record_failure -> advances the shared password/2FA failure
--                                     sequence and, exactly at the threshold,
--                                     opens a fixed two-hour window. An active
--                                     window is never extended or re-counted.
--   app.auth_locks_record_success -> resets the sequence without ever clearing
--                                     an active lock (a success cannot bypass
--                                     or lift a lock).
--
-- Both are security-definer so the privileged server boundary can operate the
-- table even though no browser role receives any grant: lock state must never
-- leak to callers. The service role already holds full DML on the table
-- (migration 009) and blanket function execute (migration 008); explicit
-- grants below make the intent self-documenting.

create or replace function app.auth_locks_record_failure(
  p_subject_hash text,
  p_user_id uuid,
  p_threshold integer,
  p_lock_interval interval
)
returns jsonb
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
declare
  v_row app.auth_locks%rowtype;
  v_now timestamptz := clock_timestamp();
  v_consecutive integer;
  v_last_failure timestamptz;
  v_locked_until timestamptz;
  v_just_locked boolean := false;
begin
  if p_threshold < 1 then
    raise exception 'lock threshold must be >= 1' using errcode = '22023';
  end if;
  if p_lock_interval < interval '0' then
    raise exception 'lock interval must be non-negative' using errcode = '22023';
  end if;

  -- Upsert a neutral row (counter 0 / last_failure null). The upsert takes
  -- the row lock that serializes concurrent failures for the same subject, so
  -- the transition below always reads a single current state.
  insert into app.auth_locks (company_id, subject_hash, user_id)
  values (app.platform_company_id(), p_subject_hash, p_user_id)
  on conflict (subject_hash) where deleted_at is null do update set
    user_id = coalesce(excluded.user_id, app.auth_locks.user_id)
  returning * into v_row;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    -- Active lock: the window is fixed. Do not count or extend it; the denial
    -- evidence is preserved in app.auth_attempts by the caller.
    return jsonb_build_object(
      'just_locked', false,
      'active_lock', true,
      'locked_until', v_row.locked_until,
      'consecutive_failures', v_row.consecutive_failures,
      'lock_count', v_row.lock_count
    );
  end if;

  v_consecutive := v_row.consecutive_failures + 1;
  v_last_failure := v_now;
  if v_consecutive >= p_threshold then
    -- Open an exact window and consume the streak so the next window again
    -- requires p_threshold consecutive failures after it expires.
    v_locked_until := v_now + p_lock_interval;
    v_just_locked := true;
    v_consecutive := 0;
    v_last_failure := null;
  else
    v_locked_until := null;
  end if;

  update app.auth_locks
  set user_id = coalesce(p_user_id, user_id),
      consecutive_failures = v_consecutive,
      last_failure_at = v_last_failure,
      locked_until = v_locked_until,
      lock_count = lock_count + (case when v_just_locked then 1 else 0 end)
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'just_locked', v_just_locked,
    'active_lock', v_row.locked_until is not null,
    'locked_until', v_row.locked_until,
    'consecutive_failures', v_row.consecutive_failures,
    'lock_count', v_row.lock_count
  );
end;
$fn$;

create or replace function app.auth_locks_record_success(p_subject_hash text)
returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $fn$
begin
  -- A successful credential check resets the failure sequence but must never
  -- bypass or clear an active lock: locked_until, lock_count and the unlock
  -- fields are deliberately left untouched.
  update app.auth_locks
  set consecutive_failures = 0,
      last_failure_at = null
  where subject_hash = p_subject_hash
    and deleted_at is null;
end;
$fn$;

comment on function app.auth_locks_record_failure(text, uuid, integer, interval) is
  'Race-safe consecutive-failure writer. Opens an exact lock window at the threshold and never extends an active one.';
comment on function app.auth_locks_record_success(text) is
  'Resets the failure sequence on a verified success without clearing an active lock.';

grant execute on function app.auth_locks_record_failure(text, uuid, integer, interval) to service_role;
grant execute on function app.auth_locks_record_success(text) to service_role;
revoke execute on function app.auth_locks_record_failure(text, uuid, integer, interval) from authenticated, anon, public;
revoke execute on function app.auth_locks_record_success(text) from authenticated, anon, public;
