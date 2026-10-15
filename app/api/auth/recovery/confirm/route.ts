// path: app/api/auth/recovery/confirm/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { completePasswordRecovery } from "@/lib/auth/flows/recovery";
import { passwordUpdateInputSchema } from "@/lib/auth/schemas";
import { createRouteHandlerClient } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Sets the new password on a recovery-link session. Runs on the
 * link-established session rather than a full session: recovery completes
 * for any live profile, then destroys every session so the user signs in
 * with the new password.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiSuccessBody<{ readonly reset: boolean }> | ApiErrorBody>> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, passwordUpdateInputSchema);
    const client = await createRouteHandlerClient();
    await completePasswordRecovery(client, input, {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return apiOk({ reset: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
