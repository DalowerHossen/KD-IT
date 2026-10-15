// path: app/api/company/members/suspend/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { suspendMemberRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { enforceAbuseProtection } from "@/lib/security/abuse-guard";
import { proposeAndAudit } from "@/lib/db/repositories/commands";
import { getMembership } from "@/lib/db/repositories/memberships";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proposes suspending an active member, removing their role once approved.
 * The membership must exist in the working company. Creates an
 * admin.membership.suspend approval command; applied on execution.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, suspendMemberRequestSchema);
    const context = await workingContextForRoute(request);
    await enforceAbuseProtection(context, {
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
      action: "admin.membership.suspend",
      correlationId,
      ipScopes: ["adminCommandPerIp"],
      deviceScopes: [],
      accountScopes: ["adminCommandPerAccount"],
      accountKey: context.userId,
    });
    const membership = await getMembership(context, body.membershipId);
    const { commandId } = await proposeAndAudit(context, {
      companyId: context.companyId,
      kind: "admin.membership.suspend",
      payload: {
        companyId: context.companyId,
        membershipId: membership.id,
        expectedVersion: body.expectedVersion,
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      },
    });
    return apiOk({ commandId, status: "proposed" }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
