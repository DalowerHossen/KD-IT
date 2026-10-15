// path: app/api/company/members/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { type MembershipListItem } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { listCompanyMembers } from "@/lib/db/repositories/memberships";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lists the team of the caller's working company. Requires an active role in
 * that company; members are returned with their role and lifecycle status.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const members: readonly MembershipListItem[] = await listCompanyMembers(context);
    return apiOk({ members }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
