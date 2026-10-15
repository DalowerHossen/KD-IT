// path: lib/auth/flows/signup.ts
import "server-only";

import {
  auditAuthLifecycle,
  AUTH_LIFECYCLE_AUDIT_ACTIONS,
  UNKNOWN_AUTH_SUBJECT_ID,
} from "@/lib/auth/audit";
import { authAccountRateLimitKey, consumeAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import { getAuthEmailPort } from "@/lib/auth/email-port";
import { getTurnstileConfig } from "@/lib/security/turnstile";
import { enforceAbuseProtection } from "@/lib/security/abuse-guard";
import { type AuthFlowRequest } from "@/lib/auth/flows/context";
import { hashPasswordHistoryEntry } from "@/lib/auth/password-hash";
import { checkPasswordBreach } from "@/lib/auth/password-breach";
import {
  type ResendVerificationInput,
  resendVerificationInputSchema,
  type SignupInput,
  signupInputSchema,
} from "@/lib/auth/schemas";
import { authSubjectHash } from "@/lib/auth/subject-hash";
import { getPublicEnv } from "@/lib/config/public-env";
import { recordPasswordHash } from "@/lib/db/repositories/password-history";
import { createProfile, getOwnProfile } from "@/lib/db/repositories/profiles";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";
import { ValidationError } from "@/lib/errors/app-errors";
import { rootLogger } from "@/lib/logging/logger";

/**
 * Signup and verification-email flows. Responses are identical whether the
 * address is new or already registered: the email sender reports delivery
 * without revealing account existence, and no branch of these flows
 * enumerates registered addresses. Passwords are breach-checked before
 * the provider ever sees them.
 */
export interface SignupResult {
  readonly userId: string | null;
  readonly confirmationSent: boolean;
}

function verificationRedirectTo(): string {
  const next = encodeURIComponent("/verify-email?verified=1");
  return `${getPublicEnv().appUrl}/api/auth/callback?next=${next}`;
}

function ownershipContext(
  userId: string,
  correlationId: string,
): ReturnType<typeof makeTenantContext> {
  return makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId,
    role: "staff",
    correlationId,
  });
}

/** Registers an account and sends the verification email. */
export async function signupWithPassword(
  rawInput: SignupInput,
  request: AuthFlowRequest,
): Promise<SignupResult> {
  const input = signupInputSchema.parse(rawInput);

  // Substep G: signup abuse protection - endpoint (IP) + device rate limits,
  // the Turnstile human check (when enforced), and the network-risk policy.
  // A pre-account platform context carries the policy read.
  const guardContext = makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId: UNKNOWN_AUTH_SUBJECT_ID,
    role: "staff",
    correlationId: request.correlationId,
  });
  await enforceAbuseProtection(guardContext, {
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    action: "auth.signup",
    correlationId: request.correlationId,
    turnstileToken: input.turnstileToken,
    ipScopes: ["signupPerIp"],
    deviceScopes: ["signupPerDevice"],
    requireTurnstile: getTurnstileConfig().enforced,
  });

  const breach = await checkPasswordBreach(input.password);
  if (breach.checked && breach.breached) {
    throw new ValidationError("This password has appeared in a data breach. Choose another.");
  }
  if (!breach.checked) {
    rootLogger.withCorrelation(request.correlationId).warn("auth.signup.breach_unchecked", {});
  }

  const port = getAuthEmailPort();
  const result = await port.createUserAndSendConfirmation({
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    emailRedirectTo: verificationRedirectTo(),
  });

  if (result.confirmationSent) {
    const context = ownershipContext(result.userId, request.correlationId);
    try {
      await createProfile(context, {
        userId: result.userId,
        displayName: input.displayName,
      });
    } catch (error) {
      const existing = await getOwnProfile(context);
      if (existing === null) {
        throw error;
      }
    }
    await recordPasswordHash(result.userId, await hashPasswordHistoryEntry(input.password));
  }

  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.signupCompleted,
    resourceType: "profiles",
    actorId: result.confirmationSent ? result.userId : null,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: {
      subjectHash: authSubjectHash(input.email),
      confirmationSent: result.confirmationSent,
      breachChecked: breach.checked,
    },
  });

  return {
    userId: result.confirmationSent ? result.userId : null,
    confirmationSent: result.confirmationSent,
  };
}

export interface ResendVerificationResult {
  readonly sent: boolean;
}

/**
 * Re-sends the verification email. Always reports success: delivery
 * failures are audited for operators but never surface, because any
 * distinction would enumerate registered addresses.
 */
export async function resendVerificationEmail(
  rawInput: ResendVerificationInput,
  request: AuthFlowRequest,
): Promise<ResendVerificationResult> {
  const input = resendVerificationInputSchema.parse(rawInput);
  await consumeAuthRateLimit("resendPerAccount", authAccountRateLimitKey(input.email));

  let delivered = true;
  try {
    const port = getAuthEmailPort();
    await port.resendConfirmation(input.email);
  } catch {
    delivered = false;
  }

  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.verificationResent,
    resourceType: "profiles",
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { subjectHash: authSubjectHash(input.email), delivered },
  });

  return { sent: true };
}
