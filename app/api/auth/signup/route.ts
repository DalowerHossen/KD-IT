// path: app/api/auth/signup/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { signupWithPassword } from "@/lib/auth/flows/signup";
import { signupInputSchema } from "@/lib/auth/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Account registration. The response is identical for new and already
 * registered addresses: the flow result is deliberately not echoed, so
 * the endpoint can never enumerate accounts.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiSuccessBody<{ readonly sent: boolean }> | ApiErrorBody>> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, signupInputSchema);
    await signupWithPassword(input, {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return apiOk({ sent: true }, { correlationId, status: 201 });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
