// path: lib/auth/auth-rate-limit.ts
import "server-only";

import { createHash } from "node:crypto";

import { normalizeUserAgent } from "@/lib/auth/device";
import { authSubjectHash } from "@/lib/auth/subject-hash";
import { rateLimitHit, requireRateLimitBudget } from "@/lib/db/repositories/rate-limit";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";

/**
 * Rate-limit budgets on top of the Step 02 atomic check-and-increment
 * primitive. Substep G extends the authentication budgets with the full
 * IP / account / device / endpoint matrix, plus signup, KYC, administration,
 * and Turnstile-verification budgets. Pre-authentication buckets are scoped
 * to the platform company with hashed keys so addresses and device signals
 * never persist in the counter store.
 */
export const RATE_LIMIT_BUDGETS = {
  // Authentication (first factor).
  loginPerIp: { limit: 20, windowSeconds: 60 },
  loginPerAccount: { limit: 10, windowSeconds: 300 },
  loginPerDevice: { limit: 15, windowSeconds: 600 },
  // Signup + verification + recovery.
  signupPerIp: { limit: 5, windowSeconds: 3600 },
  signupPerDevice: { limit: 3, windowSeconds: 3600 },
  resendPerAccount: { limit: 5, windowSeconds: 3600 },
  recoveryPerAccount: { limit: 5, windowSeconds: 3600 },
  passwordChangePerAccount: { limit: 10, windowSeconds: 3600 },
  // Second factor.
  mfaChallengePerAccount: { limit: 10, windowSeconds: 60 },
  mfaVerifyPerIp: { limit: 20, windowSeconds: 60 },
  mfaVerifyPerAccount: { limit: 5, windowSeconds: 300 },
  // Administration (team/company mutations).
  adminCommandPerIp: { limit: 20, windowSeconds: 60 },
  adminCommandPerAccount: { limit: 15, windowSeconds: 600 },
  // KYC submissions (hook for the KYC substep).
  kycSubmitPerIp: { limit: 5, windowSeconds: 3600 },
  kycSubmitPerAccount: { limit: 5, windowSeconds: 3600 },
  // Turnstile verification calls.
  turnstilePerIp: { limit: 30, windowSeconds: 300 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMIT_BUDGETS;

/** Back-compat alias for the authentication budgets. */
export type AuthRateLimitScope =
  | "loginPerIp"
  | "loginPerAccount"
  | "signupPerIp"
  | "resendPerAccount"
  | "recoveryPerAccount"
  | "passwordChangePerAccount"
  | "mfaChallengePerAccount"
  | "mfaVerifyPerIp"
  | "mfaVerifyPerAccount";

/** Consumes one budget unit; fails closed with 429 when exhausted. */
export async function consumeRateLimitBudget(scope: RateLimitScope, key: string): Promise<void> {
  const budget = RATE_LIMIT_BUDGETS[scope];
  const outcome = await rateLimitHit(
    PLATFORM_COMPANY_ID,
    `rl:${scope}:${key}`,
    budget.limit,
    budget.windowSeconds,
  );
  requireRateLimitBudget(outcome);
}

/** Back-compat wrapper over the extended budget map. */
export async function consumeAuthRateLimit(scope: AuthRateLimitScope, key: string): Promise<void> {
  await consumeRateLimitBudget(scope, key);
}

/** Stable non-reversible account key for pre-authentication buckets. */
export function authAccountRateLimitKey(email: string): string {
  return authSubjectHash(email);
}

/**
 * Stable per-device bucket key for pre-authentication device limiting. Derives
 * from the caller IP + normalized user agent (no user id is available yet), so
 * a single device across a signup attempt is counted once per window.
 */
export function deviceRateLimitKey(ip: string | null, userAgent: string | null): string {
  const ua = normalizeUserAgent(userAgent ?? "");
  return createHash("sha256")
    .update(`device:${ip ?? "no-ip"}|${ua}`, "utf8")
    .digest("hex");
}
