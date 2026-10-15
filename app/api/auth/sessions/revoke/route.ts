// path: app/api/auth/sessions/revoke/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { revokeSession } from "@/lib/auth/flows/sessions";
import { revokeSessionInputSchema } from "@/lib/auth/schemas";
import { resolveSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Revokes one session by id. The lookup is ownership-scoped: unknown ids
 * and other users' sessions share one generic outcome. Revoking the
 * current session self-cleans on the next request.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiSuccessBody<{ readonly revoked: boolean }> | ApiErrorBody>> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, revokeSessionInputSchema);
    const { session } = await resolveSessionForRoute(
      request,
      requestIpFromHeaders(request.headers),
    );
    await revokeSession(session, input, {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return apiOk({ revoked: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
