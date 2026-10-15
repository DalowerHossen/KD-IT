// path: lib/auth/lockout.ts
import "server-only";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { getAuthEmailPort } from "@/lib/auth/email-port";
import { type AuthFlowRequest } from "@/lib/auth/flows/context";
import {
  AUTH_LOCK_FAILURE_THRESHOLD,
  AUTH_LOCK_INTERVAL_SQL,
  isLockActive,
} from "@/lib/auth/lockout-policy";
import { type AuthFactor } from "@/lib/auth/schemas";
import {
  readLockState,
  recordLockFailure,
  recordLockSuccess,
} from "@/lib/db/repositories/auth-locks";

/**
 * Substep E - account-lock orchestration. Wraps the race-safe writers so the
 * login and 2FA flows share one code path for the gate, the failure sequence,
 * the lock-begin audit, and the account-holder alert.
 */

export interface ActiveLock {
  readonly locked: boolean;
  readonly lockedUntil: string | null;
}

export interface FailureForLockInput {
  readonly subjectHash: string;
  readonly userId: string | null;
  readonly factor: AuthFactor;
  readonly failureReasonCode: string;
  readonly email: string | null;
  readonly request: AuthFlowRequest;
}

export interface FailureForLockResult extends ActiveLock {
  readonly justLocked: boolean;
}

/** Gate: resolves the active lock (if any) for a subject hash. */
export async function getActiveLock(subjectHash: string): Promise<ActiveLock> {
  const state = await readLockState(subjectHash);
  if (state === null) {
    return { locked: false, lockedUntil: null };
  }
  return { locked: isLockActive(state.locked_until), lockedUntil: state.locked_until };
}

/**
 * Advances the shared failure sequence after one failed verification. Exactly
 * when the lock window opens it audits the event and alerts the account
 * holder. Returns the lock facts for the caller's (always generic) response.
 */
export async function recordAuthFailureForLock(
  input: FailureForLockInput,
): Promise<FailureForLockResult> {
  const transition = await recordLockFailure(
    input.subjectHash,
    input.userId,
    AUTH_LOCK_FAILURE_THRESHOLD,
    AUTH_LOCK_INTERVAL_SQL,
  );

  if (transition.justLocked) {
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.lockBegun,
      resourceType: "auth_locks",
      actorId: input.userId,
      ipAddress: input.request.ipAddress,
      userAgent: input.request.userAgent,
      correlationId: input.request.correlationId,
      metadata: {
        subjectHash: input.subjectHash,
        factor: input.factor,
        reason: input.failureReasonCode,
        lockedUntil: transition.lockedUntil,
        lockCount: transition.lockCount,
      },
    });
    if (input.email !== null) {
      try {
        await getAuthEmailPort().sendAccountLockedAlert(input.email);
      } catch {
        // A delivery failure must not alter the failure path or leak state.
      }
    }
  }

  return {
    locked: transition.activeLock,
    lockedUntil: transition.lockedUntil,
    justLocked: transition.justLocked,
  };
}

/** Resets the failure sequence after a verified success. Never clears a lock. */
export async function resetLockSequence(subjectHash: string): Promise<void> {
  await recordLockSuccess(subjectHash);
}
