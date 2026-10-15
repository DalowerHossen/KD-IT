// path: app/api/auth/recovery/request/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { requestPasswordRecovery } from "@/lib/auth/flows/recovery";
import { recoveryRequestInputSchema } from "@/lib/auth/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Requests a password-recovery email. Always reports success so the
 * endpoint can never enumerate registered addresses.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiSuccessBody<{ readonly sent: boolean }> | ApiErrorBody>> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, recoveryRequestInputSchema);
    await requestPasswordRecovery(input, {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return apiOk({ sent: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
