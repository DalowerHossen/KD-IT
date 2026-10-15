// path: app/api/company/members/invite/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { inviteMemberRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { enforceAbuseProtection } from "@/lib/security/abuse-guard";
import { proposeAndAudit } from "@/lib/db/repositories/commands";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proposes inviting a user to the working company with a role. This creates
 * a discrete approval command (admin.membership.invite); the membership is
 * only created once the command is approved and executed. The proposer's
 * role must hold the command in the role matrix.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, inviteMemberRequestSchema);
    const context = await workingContextForRoute(request);
    await enforceAbuseProtection(context, {
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
      action: "admin.membership.invite",
      correlationId,
      ipScopes: ["adminCommandPerIp"],
      deviceScopes: [],
      accountScopes: ["adminCommandPerAccount"],
      accountKey: context.userId,
    });
    const { commandId } = await proposeAndAudit(context, {
      companyId: context.companyId,
      kind: "admin.membership.invite",
      payload: {
        companyId: context.companyId,
        userId: body.userId,
        role: body.role,
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      },
    });
    return apiOk({ commandId, status: "proposed" }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
