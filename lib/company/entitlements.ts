// path: lib/company/entitlements.ts
import "server-only";

import type { TenantContext } from "@/lib/db/tenant-context";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { pgQuery } from "@/lib/db/pg";
import { getPlan, type PlanRow } from "@/lib/company/plans";
import { ConflictError, ForbiddenError } from "@/lib/errors/app-errors";

/**
 * Substep I - the server-side entitlement engine. Reads the plan assigned to a
 * company (companies.settings.plan_id) and gates features on it on every call.
 * The platform company is exempt (it is the operator workspace, not a billing
 * tenant). A tenant with no plan is denied all non-exempt features.
 */

const PLATFORM_MEMBER_CAP = 100_000;

/** The plan assigned to a company, or null when none is set. */
export async function planForCompany(companyId: string): Promise<PlanRow | null> {
  if (companyId === PLATFORM_COMPANY_ID) {
    return null;
  }
  const result = await pgQuery(
    `select settings->>'plan_id' as plan_id from app.companies
      where id = $1 and deleted_at is null`,
    [companyId],
  );
  const planId = (result.rows[0] as { plan_id: string | null } | undefined)?.plan_id;
  if (planId === undefined || planId === null || planId === "") {
    return null;
  }
  return getPlan(planId);
}

/** The feature entitlement keys for a company (empty when unassigned). */
export async function entitlementsForCompany(companyId: string): Promise<string[]> {
  const plan = await planForCompany(companyId);
  return plan?.entitlements ?? [];
}

/**
 * Gates a feature on the company's plan. Throws ForbiddenError when the
 * company's plan does not include the feature. The platform company is exempt.
 */
export async function requireEntitlement(context: TenantContext, feature: string): Promise<void> {
  if (context.companyId === PLATFORM_COMPANY_ID) {
    return;
  }
  const plan = await planForCompany(context.companyId);
  if (plan === null || !plan.entitlements.includes(feature)) {
    throw new ForbiddenError("Your current plan does not include this feature.");
  }
}

/** The member cap for a company (a high sentinel for the platform company). */
export async function maxMembersForCompany(companyId: string): Promise<number> {
  if (companyId === PLATFORM_COMPANY_ID) {
    return PLATFORM_MEMBER_CAP;
  }
  const plan = await planForCompany(companyId);
  return plan?.max_members ?? 0;
}

/** The count of active memberships in a company. */
export async function countActiveMembers(companyId: string): Promise<number> {
  const result = await pgQuery(
    `select count(*)::int as n from app.memberships
      where company_id = $1 and status = 'active' and deleted_at is null`,
    [companyId],
  );
  return (result.rows[0] as { n: number }).n;
}

/**
 * Asserts the company can accept one more member: it must hold the "team"
 * entitlement and be below its member cap. The platform company is exempt.
 */
export async function assertMemberCapacity(companyId: string): Promise<void> {
  if (companyId === PLATFORM_COMPANY_ID) {
    return;
  }
  const [maxMembers, activeCount] = await Promise.all([
    maxMembersForCompany(companyId),
    countActiveMembers(companyId),
  ]);
  if (maxMembers <= 0) {
    throw new ForbiddenError(
      "This workspace has no active plan; member invitations are unavailable.",
    );
  }
  if (activeCount >= maxMembers) {
    throw new ConflictError("This workspace has reached its member limit.");
  }
}
