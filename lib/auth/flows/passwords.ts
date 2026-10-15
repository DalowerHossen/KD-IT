// path: lib/auth/flows/passwords.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { authAccountRateLimitKey, consumeAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import { type AuthFlowRequest } from "@/lib/auth/flows/context";
import { assertPasswordNotReused } from "@/lib/auth/flows/recovery";
import { hashPasswordHistoryEntry } from "@/lib/auth/password-hash";
import { checkPasswordBreach } from "@/lib/auth/password-breach";
import { type PasswordChangeInput, passwordChangeInputSchema } from "@/lib/auth/schemas";
import { type AuthSessionContext } from "@/lib/auth/session";
import { hashUserAgentSignal } from "@/lib/auth/session-risk";
import { authSubjectHash } from "@/lib/auth/subject-hash";
import { createAuthenticatedServerClient } from "@/lib/db/clients/supabase";
import { recordAuthAttempt } from "@/lib/db/repositories/auth-attempts";
import { revokeAllUserSessions } from "@/lib/db/repositories/auth-sessions";
import { recordPasswordHash } from "@/lib/db/repositories/password-history";
import { toDatabaseError } from "@/lib/db/pg";
import {
  ExternalServiceError,
  InternalError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors/app-errors";
import { rootLogger } from "@/lib/logging/logger";

/**
 * Authenticated password change. Re-authenticates the current password
 * against the provider on a sessionless client (so verification never
 * disturbs the active session), enforces policy, breach, and reuse
 * checks, then revokes every other mirror session. The current session
 * survives: the caller just proved possession twice, and revoked mirrors
 * cannot act even while their provider sessions linger.
 *
 * Substep E: this flow deliberately never touches the account lock. Changing
 * the password does not clear an active lock nor reset its failure sequence;
 * the lock can only be lifted through the permissioned unlock (Substep F).
 */
export interface PasswordChangeResult {
  readonly revokedSessions: number;
}

export async function changePassword(
  client: SupabaseClient,
  session: AuthSessionContext,
  rawInput: PasswordChangeInput,
  request: AuthFlowRequest,
): Promise<PasswordChangeResult> {
  const input = passwordChangeInputSchema.parse(rawInput);
  await consumeAuthRateLimit(
    "passwordChangePerAccount",
    session.email === null ? `user:${session.userId}` : authAccountRateLimitKey(session.email),
  );

  const breach = await checkPasswordBreach(input.newPassword);
  if (breach.checked && breach.breached) {
    throw new ValidationError("This password has appeared in a data breach. Choose another.");
  }
  if (!breach.checked) {
    rootLogger.withCorrelation(request.correlationId).warn("auth.password.breach_unchecked", {});
  }
  await assertPasswordNotReused(session.userId, input.newPassword);

  if (session.email === null) {
    throw new InternalError("Account email is missing.");
  }
  const verifier = createAuthenticatedServerClient();
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: session.email,
    password: input.currentPassword,
  });
  if (verifyError !== null) {
    await recordAuthAttempt({
      subjectHash: authSubjectHash(session.userId),
      userId: session.userId,
      factor: "password",
      outcome: "failure",
      failureReasonCode: "invalid-credentials",
      lockedAfter: false,
      ip: request.ipAddress,
      userAgentHash: hashUserAgentSignal(request.userAgent),
    });
    throw new UnauthorizedError("The current password is incorrect.");
  }

  const { error } = await client.auth.updateUser({ password: input.newPassword });
  if (error !== null) {
    throw new ExternalServiceError("Password change failed. Try again.", {
      cause: toDatabaseError(error),
    });
  }

  await recordPasswordHash(session.userId, await hashPasswordHistoryEntry(input.newPassword));
  const revoked = await revokeAllUserSessions(session.userId, {
    exceptSessionId: session.sessionId,
    reason: "password-changed",
  });

  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.passwordChanged,
    resourceType: "auth_sessions",
    actorId: session.userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { revokedSessions: revoked.revokedSessionIds.length },
  });

  return { revokedSessions: revoked.revokedSessionIds.length };
}
