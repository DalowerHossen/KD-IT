// path: lib/security/abuse-guard.ts
import "server-only";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import {
  consumeRateLimitBudget,
  deviceRateLimitKey,
  type RateLimitScope,
} from "@/lib/auth/auth-rate-limit";
import type { TenantContext } from "@/lib/db/tenant-context";
import { ValidationError } from "@/lib/errors/app-errors";
import { enforceNetworkRisk } from "@/lib/security/network-risk";
import { verifyTurnstileToken } from "@/lib/security/turnstile";

/**
 * Substep G - the single abuse-protection gate. Applies, in order, the
 * endpoint (IP) and device rate-limit budgets, the Turnstile human check (when
 * required), and the network-risk policy (VPN/proxy/Tor/hostile-datacenter/
 * reputation). Every denial is generic so the specific control that fired is
 * never disclosed to the caller.
 */

export interface AbuseGuardInput {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  /** A stable action identifier for audit (e.g. "auth.signup"). */
  readonly action: string;
  readonly correlationId: string;
  /** Turnstile token from the browser (required when requireTurnstile is set). */
  readonly turnstileToken?: string | null;
  /** IP-scoped (endpoint) budgets to consume. */
  readonly ipScopes: readonly RateLimitScope[];
  /** Device-scoped budgets to consume. */
  readonly deviceScopes: readonly RateLimitScope[];
  /** Account-scoped budgets to consume (when accountKey is provided). */
  readonly accountScopes?: readonly RateLimitScope[];
  /** Stable account key (e.g. the admin user id) for account-scoped budgets. */
  readonly accountKey?: string | null;
  /** Require a valid Turnstile token for this action. */
  readonly requireTurnstile?: boolean;
}

export async function enforceAbuseProtection(
  context: TenantContext,
  input: AbuseGuardInput,
): Promise<void> {
  // 1. Rate limiting: endpoint (IP) + device + account dimensions.
  for (const scope of input.ipScopes) {
    await consumeRateLimitBudget(scope, input.ipAddress ?? "unknown");
  }
  for (const scope of input.deviceScopes) {
    await consumeRateLimitBudget(scope, deviceRateLimitKey(input.ipAddress, input.userAgent));
  }
  for (const scope of input.accountScopes ?? []) {
    if (input.accountKey !== undefined && input.accountKey !== null && input.accountKey !== "") {
      await consumeRateLimitBudget(scope, input.accountKey);
    }
  }

  // 2. Turnstile human check (when required for this action).
  if (input.requireTurnstile === true) {
    const turnstile = await verifyTurnstileToken(input.turnstileToken ?? null, input.ipAddress);
    if (!turnstile.valid) {
      await auditAuthLifecycle({
        action: AUTH_LIFECYCLE_AUDIT_ACTIONS.turnstileRejected,
        resourceType: "network_risk",
        ipAddress: input.ipAddress,
        correlationId: input.correlationId,
        metadata: { action: input.action, skipped: turnstile.skipped },
      });
      throw new ValidationError("Please verify you are human to continue.");
    }
  }

  // 3. Network-risk policy (VPN / proxy / Tor / hostile datacenter / reputation).
  await enforceNetworkRisk(context, {
    ipAddress: input.ipAddress,
    action: input.action,
    correlationId: input.correlationId,
  });
}
