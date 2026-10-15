// path: app/api/auth/password/change/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { changePassword } from "@/lib/auth/flows/passwords";
import { passwordChangeInputSchema } from "@/lib/auth/schemas";
import { resolveSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Authenticated password change with current-password re-authentication.
 * Revokes every other session and reports how many, so callers can tell
 * the user exactly what the change protected.
 */
export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<
    ApiSuccessBody<{ readonly changed: boolean; readonly revokedSessions: number }> | ApiErrorBody
  >
> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, passwordChangeInputSchema);
    const { client, session } = await resolveSessionForRoute(
      request,
      requestIpFromHeaders(request.headers),
    );
    const result = await changePassword(client, session, input, {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return apiOk({ changed: true, revokedSessions: result.revokedSessions }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
