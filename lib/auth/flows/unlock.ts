// path: lib/auth/flows/unlock.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { isLockActive } from "@/lib/auth/lockout-policy";
import {
  type UnlockRequestInput,
  unlockCommandPayloadSchema,
  unlockRequestInputSchema,
} from "@/lib/auth/schemas";
import { requireFreshReauthentication } from "@/lib/auth/step-up";
import { authSubjectHash } from "@/lib/auth/subject-hash";
import type { CommandRow } from "@/lib/commands/types";
import { assertApprovedCommandFor, proposeAndAudit } from "@/lib/db/repositories/commands";
import { readLockState, clearAccountLock } from "@/lib/db/repositories/auth-locks";
import type { TenantContext } from "@/lib/db/tenant-context";

/**
 * Substep F - permissioned account unlock. Lifting a two-hour account lock is
 * a dual-control, approval-gated platform action:
 *
 *   1. requestAccountUnlock - an eligible platform admin (super_admin/ceo)
 *      attests owner contact by email, passes a step-up 2FA gate, and proposes
 *      a dual-control auth.account.unlock command carrying the reason.
 *   2. The command travels the full approval chain (CEO L2 / super-admin L3 +
 *      final confirmation by a DISTINCT super-admin) in the command engine.
 *   3. executeAccountUnlock - once the command is approved, the active lock is
 *      cleared through the optimistic-locked writer and the unlock is audited.
 *
 * The lock is never lifted by any other path; historical attempts are immutable.
 */

export interface UnlockRequestResult {
  readonly commandId: string;
  readonly status: string;
}

/** Proposes the unlock command after the step-up 2FA gate. */
export async function requestAccountUnlock(
  context: TenantContext,
  rawInput: UnlockRequestInput,
  client: SupabaseClient,
): Promise<UnlockRequestResult> {
  const input = unlockRequestInputSchema.parse(rawInput);

  // Critical action: the admin must have re-verified a second factor recently.
  await requireFreshReauthentication(client, "auth.account.unlock");

  const subjectHash = authSubjectHash(input.subjectEmail);
  const lockState = await readLockState(subjectHash);

  const { commandId } = await proposeAndAudit(context, {
    companyId: context.companyId,
    kind: "auth.account.unlock",
    payload: {
      subjectHash,
      subjectUserId: lockState === null ? null : lockState.user_id,
      subjectEmail: input.subjectEmail,
      ownerContactConfirmed: true,
      reason: input.reason,
    },
    dualControl: true,
    attestation: input.reason,
  });

  return { commandId, status: "proposed" };
}

export interface UnlockExecutionResult {
  readonly cleared: boolean;
  readonly reason: string;
  readonly subjectHash: string;
  readonly subjectEmail: string;
  readonly commandId: string;
}

/**
 * Clears the active lock for an APPROVED unlock command. Re-verifies the
 * approval, lifts the window through the optimistic-locked writer (a no-op
 * when the window already expired), and records an immutable audit event.
 */
export async function executeAccountUnlock(
  context: TenantContext,
  command: CommandRow,
): Promise<UnlockExecutionResult> {
  const approved = await assertApprovedCommandFor(context, command.id, "auth.account.unlock");
  const payload = unlockCommandPayloadSchema.parse(approved.payload);

  const base: UnlockExecutionResult = {
    cleared: false,
    reason: "no_active_lock",
    subjectHash: payload.subjectHash,
    subjectEmail: payload.subjectEmail,
    commandId: command.id,
  };

  const lockState = await readLockState(payload.subjectHash);
  if (lockState === null || !isLockActive(lockState.locked_until)) {
    // The window already expired on its own; record the (no-op) unlock so the
    // command still reaches an executed, audited terminal state.
    await auditUnlock(context, base);
    return base;
  }

  const cleared = await clearAccountLock({
    subjectHash: payload.subjectHash,
    unlockedBy: context.userId,
    commandId: command.id,
    reason: payload.reason,
    expectedVersion: lockState.version,
  });

  const result: UnlockExecutionResult = {
    cleared: cleared.cleared,
    reason: cleared.reason,
    subjectHash: payload.subjectHash,
    subjectEmail: payload.subjectEmail,
    commandId: command.id,
  };
  await auditUnlock(context, result);
  return result;
}

async function auditUnlock(context: TenantContext, result: UnlockExecutionResult): Promise<void> {
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.lockUnlocked,
    resourceType: "auth_locks",
    actorId: context.userId,
    ipAddress: null,
    userAgent: null,
    correlationId: context.correlationId,
    metadata: {
      subjectHash: result.subjectHash,
      subjectEmail: result.subjectEmail,
      commandId: result.commandId,
      cleared: result.cleared,
      reason: result.reason,
    },
  });
}
