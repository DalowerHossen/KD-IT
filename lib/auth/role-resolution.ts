// path: lib/auth/role-resolution.ts
import "server-only";

import type { AuthRole } from "@/lib/auth/roles";
import type { CompanyStatus, MembershipStatus, ProfileStatus } from "@/lib/auth/schemas";

/**
 * Substep C: approval-aware role resolution. A role is a property of an
 * approved, currently-valid binding -- never of a request or a client claim.
 *
 * The approval-awareness is structural: a membership only reaches "active"
 * through an approved command (invite, then role assignment), a company only
 * confers access while "active", and a profile only while "active". Resolving
 * a role therefore requires ALL THREE to be active; any other combination
 * yields no role. This is what makes the check approval-aware without a
 * separate approvals table lookup: the approval is encoded in the row states.
 *
 * The pure decision lives here so it is unit-testable without a database;
 * the repository feeds it authoritative row states.
 */
export interface EffectiveRoleInput {
  /** The user's binding in the target company, or null when none exists. */
  readonly membership: { readonly role: AuthRole; readonly status: MembershipStatus } | null;
  /** The target company's lifecycle status, or null when it does not exist. */
  readonly companyStatus: CompanyStatus | null;
  /** The member's global profile status, or null when no profile exists. */
  readonly profileStatus: ProfileStatus | null;
}

/**
 * Resolves the effective role, or null when no role is conferred. Every
 * denial reason collapses to null so callers cannot enumerate why a subject
 * has no role; the structured evidence lives in the audit trail.
 */
export function resolveEffectiveRole(input: EffectiveRoleInput): AuthRole | null {
  const { membership, companyStatus, profileStatus } = input;
  if (membership === null) {
    return null;
  }
  if (membership.status !== "active") {
    return null;
  }
  if (companyStatus !== "active") {
    return null;
  }
  if (profileStatus !== "active") {
    return null;
  }
  return membership.role;
}

/**
 * A working context is a company + role the session may act with. When no
 * role is conferred the company is null and the session falls back to its
 * least-privilege ownership context (own data only, never role decisions).
 */
export interface WorkingContext {
  readonly companyId: string | null;
  readonly role: AuthRole | null;
}

/** Projects an effective-role result into a working context. */
export function toWorkingContext(companyId: string, role: AuthRole | null): WorkingContext {
  return role === null ? { companyId: null, role: null } : { companyId, role };
}
