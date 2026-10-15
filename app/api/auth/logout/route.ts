// path: app/api/auth/logout/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { logoutAllSessions, logoutCurrentSession } from "@/lib/auth/flows/sessions";
import { logoutInputSchema } from "@/lib/auth/schemas";
import { resolveSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Logout with scope: the current session on this device only, or every
 * session on every device. Mirror rows revoke before provider sessions so
 * a provider failure can never resurrect a revoked mirror.
 */
export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<
    ApiSuccessBody<{ readonly signedOut: boolean; readonly scope: string }> | ApiErrorBody
  >
> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, logoutInputSchema);
    const { client, session } = await resolveSessionForRoute(
      request,
      requestIpFromHeaders(request.headers),
    );
    const flowRequest = {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    };
    if (input.scope === "all") {
      await logoutAllSessions(client, session, flowRequest);
    } else {
      await logoutCurrentSession(client, session, flowRequest);
    }
    return apiOk({ signedOut: true, scope: input.scope }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
