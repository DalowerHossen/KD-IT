// path: app/api/auth/verify/resend/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { resendVerificationEmail } from "@/lib/auth/flows/signup";
import { resendVerificationInputSchema } from "@/lib/auth/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Verification-email re-send. Always reports success: delivery outcome is
 * audited for operators but never surfaces, so registered addresses can
 * never be enumerated through this endpoint.
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiSuccessBody<{ readonly sent: boolean }> | ApiErrorBody>> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, resendVerificationInputSchema);
    await resendVerificationEmail(input, {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return apiOk({ sent: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
