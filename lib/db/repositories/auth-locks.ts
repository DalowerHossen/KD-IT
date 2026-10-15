// path: lib/db/repositories/auth-locks.ts
import "server-only";

import { z } from "zod";

import { type AuthLockRow, authLockRowSchema } from "@/lib/auth/schemas";
import { pgQuery } from "@/lib/db/pg";

const LOCK_COLUMNS =
  "id, company_id, subject_hash, user_id, consecutive_failures, locked_until, lock_count, last_failure_at, unlocked_by, unlock_command_id, unlock_reason, version";

/**
 * Authentication lock repository (Substep E). Reads the per-subject lock state
 * and drives the two race-safe PL/pgSQL writers (migration 011). The table is
 * RLS-forced with no browser grants; only the privileged server boundary
 * touches it.
 */

export interface LockTransition {
  readonly justLocked: boolean;
  readonly activeLock: boolean;
  readonly lockedUntil: string | null;
  readonly consecutiveFailures: number;
  readonly lockCount: number;
}

const lockTransitionRowSchema = z.strictObject({
  just_locked: z.boolean(),
  active_lock: z.boolean(),
  locked_until: z.string().datetime().nullable(),
  consecutive_failures: z.number().int().min(0),
  lock_count: z.number().int().min(0),
});

/** Reads the current lock state for a subject, or null when none exists. */
export async function readLockState(subjectHash: string): Promise<AuthLockRow | null> {
  const result = await pgQuery(
    `select ${LOCK_COLUMNS}
     from app.auth_locks
     where subject_hash = $1 and deleted_at is null
     limit 1`,
    [subjectHash],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return authLockRowSchema.parse(row);
}

/**
 * Atomically records one failure for the shared sequence. Opens the exact
 * lock window at the threshold and returns the transition so the caller can
 * react (audit + alert) when a lock just began.
 */
export async function recordLockFailure(
  subjectHash: string,
  userId: string | null,
  threshold: number,
  intervalSql: string,
): Promise<LockTransition> {
  const result = await pgQuery(
    `select app.auth_locks_record_failure($1, $2::uuid, $3::int, $4::interval) as state`,
    [subjectHash, userId, threshold, intervalSql],
  );
  const state = lockTransitionRowSchema.parse(result.rows[0]?.state);
  return {
    justLocked: state.just_locked,
    activeLock: state.active_lock,
    lockedUntil: state.locked_until,
    consecutiveFailures: state.consecutive_failures,
    lockCount: state.lock_count,
  };
}

/** Resets the failure sequence on a verified success. Never clears a lock. */
export async function recordLockSuccess(subjectHash: string): Promise<void> {
  await pgQuery(`select app.auth_locks_record_success($1)`, [subjectHash]);
}

export interface ClearLockInput {
  readonly subjectHash: string;
  readonly unlockedBy: string;
  readonly commandId: string;
  readonly reason: string;
  readonly expectedVersion: number;
}

export interface ClearLockResult {
  readonly cleared: boolean;
  readonly reason: string;
  readonly lockedUntil: string | null;
  readonly unlockedBy: string | null;
  readonly unlockCommandId: string | null;
  readonly version: number;
}

const clearLockRowSchema = z.strictObject({
  cleared: z.boolean(),
  reason: z.string(),
  locked_until: z.string().datetime().nullable(),
  unlocked_by: z.string().uuid().nullable(),
  unlock_command_id: z.string().uuid().nullable(),
  version: z.number().int().min(1),
});

/**
 * Atomically lifts an active lock (Substep F). Refuses a stale expected
 * version and a window that already expired; records the actor, approving
 * command, and reason as immutable evidence and restarts the failure
 * sequence at zero.
 */
export async function clearAccountLock(input: ClearLockInput): Promise<ClearLockResult> {
  const result = await pgQuery(
    `select app.auth_locks_clear($1, $2::uuid, $3::uuid, $4, $5::int) as state`,
    [input.subjectHash, input.unlockedBy, input.commandId, input.reason, input.expectedVersion],
  );
  const state = clearLockRowSchema.parse(result.rows[0]?.state);
  return {
    cleared: state.cleared,
    reason: state.reason,
    lockedUntil: state.locked_until,
    unlockedBy: state.unlocked_by,
    unlockCommandId: state.unlock_command_id,
    version: state.version,
  };
}
