// path: lib/auth/working-context.ts
import "server-only";

import type { NextRequest } from "next/server";

import type { WorkingContext } from "@/lib/auth/role-resolution";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { resolveSessionForRoute } from "@/lib/auth/session";
import { listActiveMemberships, resolveEffectiveRoleFor } from "@/lib/db/repositories/memberships";
import {
  PLATFORM_COMPANY_ID,
  makeTenantContext,
  type TenantContext,
} from "@/lib/db/tenant-context";
import { ForbiddenError } from "@/lib/errors/app-errors";

/**
 * Substep C: resolving a session's working company and role. The session
 * (Substep B) authenticates the user and carries the least-privilege
 * ownership context for their own data. On top of that, a request acts with
 * a working context -- a specific company and the role the user holds there --
 * resolved from the user's ACTIVE memberships only.
 *
 * Company selection: a validated `x-kd-company` header overrides the default;
 * an unknown header silently falls back to the default (never an error) so
 * company existence cannot be probed. The default is the most recently
 * activated membership. The role is re-validated through
 * resolveEffectiveRoleFor so a suspended company or profile still yields no
 * role even though the membership row is active.
 */
export const WORKING_COMPANY_HEADER = "x-kd-company";

export interface WorkingContextInput {
  readonly userId: string;
  readonly correlationId: string;
  readonly headers: Headers;
}

/** Resolves the working company + role, or nulls when no role is conferred. */
export async function resolveWorkingContext(input: WorkingContextInput): Promise<WorkingContext> {
  const ownership = makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId: input.userId,
    role: "staff",
    correlationId: input.correlationId,
  });
  const memberships = await listActiveMemberships(ownership, input.userId);
  const defaultMembership = memberships[0];
  if (defaultMembership === undefined) {
    return { companyId: null, role: null };
  }

  let selected = defaultMembership;
  const headerCompany = input.headers.get(WORKING_COMPANY_HEADER);
  if (headerCompany !== null) {
    const match = memberships.find((membership) => membership.company_id === headerCompany);
    if (match !== undefined) {
      selected = match;
    }
  }

  const provisional = makeTenantContext({
    companyId: selected.company_id,
    userId: input.userId,
    role: selected.role,
    correlationId: input.correlationId,
  });
  const effectiveRole = await resolveEffectiveRoleFor(provisional, input.userId);
  if (effectiveRole === null) {
    return { companyId: null, role: null };
  }
  return { companyId: selected.company_id, role: effectiveRole };
}

/**
 * Resolves and REQUIRES a working context, denying generically when the
 * subject has no role in any active company. This is the guard every
 * role-bearing team route applies before acting.
 */
export async function requireWorkingContext(input: WorkingContextInput): Promise<TenantContext> {
  const working = await resolveWorkingContext(input);
  if (working.companyId === null || working.role === null) {
    throw new ForbiddenError("You do not have access to this workspace.");
  }
  return makeTenantContext({
    companyId: working.companyId,
    userId: input.userId,
    role: working.role,
    correlationId: input.correlationId,
  });
}

/**
 * Route-boundary convenience: authenticates the session, then resolves and
 * requires the working context. Every role-bearing team route starts here so
 * the authentication + company + role guard is applied identically.
 */
export async function workingContextForRoute(request: NextRequest): Promise<TenantContext> {
  const { session, correlationId } = await resolveSessionForRoute(
    request,
    requestIpFromHeaders(request.headers),
  );
  return requireWorkingContext({
    userId: session.userId,
    correlationId,
    headers: request.headers,
  });
}
