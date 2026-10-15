// path: lib/security/network-risk.ts
import "server-only";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { getConfigurationValue } from "@/lib/db/repositories/config";
import type { TenantContext } from "@/lib/db/tenant-context";
import { ForbiddenError } from "@/lib/errors/app-errors";
import { z } from "zod";

/**
 * Substep G - network-risk classification and enforcement. Decides whether a
 * caller's IP belongs to a hostile or high-risk network class (VPN/proxy, Tor,
 * hostile datacenter, poor reputation) and enforces the configured policy.
 *
 * The classification is delegated to a pluggable provider. Real Tor-exit,
 * VPN/proxy, datacenter, and reputation data is operator-supplied (a MaxMind
 * or reputation feed bound through setNetworkRiskProvider); the default
 * provider is deliberately passive and reports "unknown" rather than fabricate
 * a classification. Enforcement is a separate, config-driven decision so the
 * data source and the policy can change independently.
 */

export const NETWORK_RISK_POLICY_CONFIG_KEY = "security.network_risk_policy";

export type NetworkRiskCategory =
  "residential" | "business" | "datacenter" | "vpn_proxy" | "tor" | "unknown";

export const networkRiskCategorySchema = z.enum([
  "residential",
  "business",
  "datacenter",
  "vpn_proxy",
  "tor",
  "unknown",
]);

export interface NetworkRiskAssessment {
  readonly category: NetworkRiskCategory;
  readonly isHostile: boolean;
  readonly labels: readonly string[];
  /** The data source that produced the assessment (for audit/evidence). */
  readonly source: string;
}

export interface NetworkRiskPolicy {
  /** When false, assessment is recorded but never blocks. */
  readonly enforce: boolean;
  /** Categories that are denied outright when enforce is true. */
  readonly blockCategories: readonly NetworkRiskCategory[];
  /** Whether an "unknown" classification is denied when enforce is true. */
  readonly blockUnknown: boolean;
}

export const defaultNetworkRiskPolicy: NetworkRiskPolicy = {
  enforce: false,
  blockCategories: ["tor", "vpn_proxy", "datacenter"],
  blockUnknown: false,
};

const networkRiskPolicySchema = z
  .object({
    enforce: z.boolean().optional(),
    blockCategories: z.array(networkRiskCategorySchema).optional(),
    blockUnknown: z.boolean().optional(),
  })
  .strict();

/** Merges a stored policy over the defaults. */
export function resolveNetworkRiskPolicy(
  stored: unknown,
  override: Partial<NetworkRiskPolicy> = {},
): NetworkRiskPolicy {
  const parsed =
    stored === null || stored === undefined ? {} : networkRiskPolicySchema.parse(stored);
  return {
    enforce: override.enforce ?? parsed.enforce ?? defaultNetworkRiskPolicy.enforce,
    blockCategories:
      override.blockCategories ??
      parsed.blockCategories ??
      defaultNetworkRiskPolicy.blockCategories,
    blockUnknown:
      override.blockUnknown ?? parsed.blockUnknown ?? defaultNetworkRiskPolicy.blockUnknown,
  };
}

/** Reads the effective policy for a company (platform default, tenant override).
 *
 * The KD_NETWORK_RISK_ENFORCED env var, when set, has the highest precedence for
 * the enforce flag (a deploy-wide switch independent of the config-table policy).
 */
export async function readNetworkRiskPolicy(
  context: TenantContext,
  override: Partial<NetworkRiskPolicy> = {},
): Promise<NetworkRiskPolicy> {
  const stored = await getConfigurationValue(context, NETWORK_RISK_POLICY_CONFIG_KEY);
  const envEnforced = process.env.KD_NETWORK_RISK_ENFORCED;
  const effectiveOverride: Partial<NetworkRiskPolicy> =
    envEnforced === "true" || envEnforced === "false"
      ? { ...override, enforce: envEnforced === "true" }
      : override;
  return resolveNetworkRiskPolicy(stored, effectiveOverride);
}

export interface NetworkRiskProvider {
  readonly name: string;
  assess(ip: string): Promise<NetworkRiskAssessment>;
}

/**
 * Default passive provider: no external data feed is bound, so the IP cannot
 * be classified. It reports "unknown" and never "hostile", which the default
 * policy allows (blockUnknown is false). Operators bind a real provider to
 * enable actual VPN/proxy/Tor/datacenter/reputation blocking.
 */
export const passiveNetworkRiskProvider: NetworkRiskProvider = {
  name: "passive",
  async assess(): Promise<NetworkRiskAssessment> {
    return { category: "unknown", isHostile: false, labels: [], source: "passive-no-data" };
  },
};

let activeRiskProvider: NetworkRiskProvider = passiveNetworkRiskProvider;

/** Binds the operator-supplied classification feed. */
export function setNetworkRiskProvider(provider: NetworkRiskProvider): void {
  activeRiskProvider = provider;
}

/** The active classification provider (passive by default). */
export function getNetworkRiskProvider(): NetworkRiskProvider {
  return activeRiskProvider;
}

/** Classifies an IP via the active provider; null IPs are "unknown". */
export async function assessNetworkRisk(ip: string | null): Promise<NetworkRiskAssessment> {
  if (ip === null || ip === "") {
    return { category: "unknown", isHostile: false, labels: [], source: "no-ip" };
  }
  return getNetworkRiskProvider().assess(ip);
}

export interface EnforceNetworkRiskInput {
  readonly ipAddress: string | null;
  readonly action: string;
  readonly correlationId: string;
  readonly policy?: NetworkRiskPolicy;
}

export interface NetworkRiskDenial {
  readonly blocked: boolean;
  readonly category: NetworkRiskCategory;
  readonly source: string;
}

/**
 * Assesses the caller IP against the policy. When enforcement is on and the
 * category is blocked (or is "unknown" and blockUnknown is set), denies with a
 * single generic message so the specific network class is never disclosed, and
 * records an immutable security audit event.
 */
export async function enforceNetworkRisk(
  context: TenantContext,
  input: EnforceNetworkRiskInput,
): Promise<NetworkRiskDenial> {
  const policy = input.policy ?? (await readNetworkRiskPolicy(context));
  const assessment = await assessNetworkRisk(input.ipAddress);

  const shouldBlock =
    policy.enforce &&
    (policy.blockCategories.includes(assessment.category) ||
      (assessment.category === "unknown" && policy.blockUnknown));

  if (shouldBlock) {
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.networkRiskBlocked,
      resourceType: "network_risk",
      ipAddress: input.ipAddress,
      correlationId: input.correlationId,
      metadata: {
        action: input.action,
        category: assessment.category,
        source: assessment.source,
        labels: [...assessment.labels],
      },
    });
    throw new ForbiddenError("This request cannot be completed from your network.");
  }

  return { blocked: false, category: assessment.category, source: assessment.source };
}
