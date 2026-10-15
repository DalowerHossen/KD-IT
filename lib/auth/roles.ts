// path: lib/auth/roles.ts
import { z } from "zod";

/**
 * Central typed role registry. This module is the single source of truth
 * for authenticated roles: navigation contracts, the command registry, and
 * the permission registry all import from here instead of redefining role
 * strings. Clients never receive a login role; tokenized client access is
 * owned by Step 11 and stays outside this registry.
 */
export const AUTH_ROLES = ["super_admin", "ceo", "admin_staff", "owner", "staff"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const authRoleSchema = z.enum(AUTH_ROLES);

/** Authority rank: a lower number outranks a higher number. */
const ROLE_RANK: Readonly<Record<AuthRole, number>> = {
  super_admin: 0,
  ceo: 1,
  admin_staff: 2,
  owner: 3,
  staff: 4,
};

/** Numeric authority rank of a role. Lower numbers hold more authority. */
export function roleRank(role: AuthRole): number {
  return ROLE_RANK[role];
}

/**
 * Rank comparison for same-scope escalation guards. Rank never crosses
 * scopes by itself: platform permissions never flow to tenant roles and
 * tenant permissions never flow to platform roles through this helper.
 */
export function roleOutranksOrEquals(active: AuthRole, required: AuthRole): boolean {
  return roleRank(active) <= roleRank(required);
}

/** Roles bound to the reserved platform company. */
export const PLATFORM_SCOPE_ROLES: readonly AuthRole[] = ["super_admin", "ceo", "admin_staff"];

/** Roles bound to tenant companies. */
export const TENANT_SCOPE_ROLES: readonly AuthRole[] = ["owner", "staff"];

export function isPlatformRole(role: AuthRole): boolean {
  return PLATFORM_SCOPE_ROLES.includes(role);
}

export function isTenantRole(role: AuthRole): boolean {
  return TENANT_SCOPE_ROLES.includes(role);
}

/**
 * Specialized admin_staff work taxonomy. These are permission bundles,
 * never top-level roles: an admin_staff member holds least-privilege base
 * permissions plus whichever bundles are explicitly granted through the
 * approval chain. Bundle grants use the bundle.* permission codes.
 */
export const ADMIN_STAFF_BUNDLES = [
  "kyc_reviewer",
  "payment_processor",
  "support_agent",
  "content_manager",
  "compliance_officer",
  "fraud_analyst",
  "finance_analyst",
] as const;

export type AdminStaffBundle = (typeof ADMIN_STAFF_BUNDLES)[number];

export const adminStaffBundleSchema = z.enum(ADMIN_STAFF_BUNDLES);
