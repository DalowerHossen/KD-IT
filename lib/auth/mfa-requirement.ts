// path: lib/auth/mfa-requirement.ts
import "server-only";

import { type AuthRole } from "@/lib/auth/roles";
import { requiredAssuranceForRoles, type AuthenticatorAssuranceLevel } from "@/lib/auth/mfa-policy";
import { readTenantEnforce2FA } from "@/lib/auth/tenant-2fa";
import { listActiveMemberships } from "@/lib/db/repositories/memberships";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";

/**
 * Computes the assurance level a user's session must reach, from the roles
 * they actively hold. A single provider session must satisfy the strictest
 * role, so any non-staff active membership mandates aal2; otherwise the
 * tenant staff-enforcement rule applies. Unknown or absent roles resolve to
 * aal1 (fail-open for users with no role, who have no protected surface).
 */
export async function requiredAssuranceForUser(
  userId: string,
  correlationId: string,
): Promise<AuthenticatorAssuranceLevel> {
  const context = makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId,
    role: "staff",
    correlationId,
  });
  let roles: readonly AuthRole[] = [];
  try {
    const memberships = await listActiveMemberships(context, userId);
    roles = memberships.map((membership) => membership.role);
  } catch {
    roles = [];
  }
  const enforce = await readTenantEnforce2FA(userId, correlationId);
  return requiredAssuranceForRoles(roles, enforce);
}
