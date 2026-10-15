// path: lib/auth/flows/recovery.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { authAccountRateLimitKey, consumeAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import { getAuthEmailPort } from "@/lib/auth/email-port";
import { type AuthFlowRequest } from "@/lib/auth/flows/context";
import { getActiveLock } from "@/lib/auth/lockout";
import { hashPasswordHistoryEntry, verifyPasswordHistoryEntry } from "@/lib/auth/password-hash";
import { checkPasswordBreach } from "@/lib/auth/password-breach";
import {
  type PasswordUpdateInput,
  passwordUpdateInputSchema,
  type RecoveryRequestInput,
  recoveryRequestInputSchema,
} from "@/lib/auth/schemas";
import { requireAuthUser, signOutAllSessions, signOutCurrentSession } from "@/lib/auth/server-auth";
import { hashUserAgentSignal } from "@/lib/auth/session-risk";
import { authSubjectHash } from "@/lib/auth/subject-hash";
import { getPublicEnv } from "@/lib/config/public-env";
import { recordAuthAttempt } from "@/lib/db/repositories/auth-attempts";
import { revokeAllUserSessions } from "@/lib/db/repositories/auth-sessions";
import {
  listRecentPasswordHashes,
  recordPasswordHash,
} from "@/lib/db/repositories/password-history";
import { getOwnProfile } from "@/lib/db/repositories/profiles";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";
import { toDatabaseError } from "@/lib/db/pg";
import {
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  ValidationError,
} from "@/lib/errors/app-errors";
import { rootLogger } from "@/lib/logging/logger";

/**
 * Password-recovery flows. Requests always report success so addresses
 * can never be enumerated; completion runs on the recovery-link session,
 * enforces policy, breach, and reuse checks, then destroys every session
 * so the account starts clean and the user signs in with the new
 * password.
 */
export interface RecoveryRequestResult {
  readonly sent: boolean;
}

/** Sends the recovery email; always reports success. */
export async function requestPasswordRecovery(
  rawInput: RecoveryRequestInput,
  request: AuthFlowRequest,
): Promise<RecoveryRequestResult> {
  const input = recoveryRequestInputSchema.parse(rawInput);
  const subjectHash = authSubjectHash(input.email);
  await consumeAuthRateLimit("recoveryPerAccount", authAccountRateLimitKey(input.email));

  // Substep E: reset is unavailable during an active lock. The response stays
  // generic (sent: true) so callers cannot tell a locked account from an
  // unknown one, and no recovery link is issued while the lock is open.
  const lock = await getActiveLock(subjectHash);
  let delivered = true;
  if (lock.locked) {
    delivered = false;
  } else {
    try {
      const port = getAuthEmailPort();
      const next = encodeURIComponent("/reset-password");
      await port.sendPasswordRecovery(
        input.email,
        `${getPublicEnv().appUrl}/api/auth/callback?next=${next}`,
      );
    } catch {
      delivered = false;
    }
  }

  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.recoveryRequested,
    resourceType: "profiles",
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { subjectHash, delivered, lockBlocked: lock.locked },
  });

  return { sent: true };
}

export interface RecoveryCompletionResult {
  readonly userId: string;
}

/** Sets the new password on a recovery-link session and signs out. */
export async function completePasswordRecovery(
  client: SupabaseClient,
  rawInput: PasswordUpdateInput,
  request: AuthFlowRequest,
): Promise<RecoveryCompletionResult> {
  const input = passwordUpdateInputSchema.parse(rawInput);
  const user = await requireAuthUser(client);
  const context = makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId: user.id,
    role: "staff",
    correlationId: request.correlationId,
  });

  const profile = await getOwnProfile(context);
  if (profile === null || profile.status === "deactivated") {
    try {
      await signOutCurrentSession(client);
    } catch {
      // The recovery session is unusable without a live profile.
    }
    throw new ForbiddenError("This account is not available.");
  }

  const breach = await checkPasswordBreach(input.password);
  if (breach.checked && breach.breached) {
    throw new ValidationError("This password has appeared in a data breach. Choose another.");
  }
  if (!breach.checked) {
    rootLogger.withCorrelation(request.correlationId).warn("auth.recovery.breach_unchecked", {});
  }
  await assertPasswordNotReused(user.id, input.password);

  const { error } = await client.auth.updateUser({ password: input.password });
  if (error !== null) {
    throw new ExternalServiceError("Password reset failed. Try again.", {
      cause: toDatabaseError(error),
    });
  }

  await recordPasswordHash(user.id, await hashPasswordHistoryEntry(input.password));
  const revoked = await revokeAllUserSessions(user.id, { reason: "password-recovery" });
  await signOutAllSessions(client);

  await recordAuthAttempt({
    subjectHash: authSubjectHash(user.id),
    userId: user.id,
    factor: "recovery",
    outcome: "success",
    failureReasonCode: null,
    lockedAfter: false,
    ip: request.ipAddress,
    userAgentHash: hashUserAgentSignal(request.userAgent),
  });
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.recoveryCompleted,
    resourceType: "profiles",
    resourceId: profile.id,
    actorId: user.id,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { revokedSessions: revoked.revokedSessionIds.length },
  });

  return { userId: user.id };
}

/** Rejects passwords matching any of the recent history verifiers. */
export async function assertPasswordNotReused(userId: string, candidate: string): Promise<void> {
  const hashes = await listRecentPasswordHashes(userId);
  for (const stored of hashes) {
    if (await verifyPasswordHistoryEntry(candidate, stored)) {
      throw new ConflictError("You cannot reuse a recent password.");
    }
  }
}
