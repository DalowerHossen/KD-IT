// path: app/api/auth/login/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { loginWithPassword } from "@/lib/auth/flows/login";
import { loginInputSchema } from "@/lib/auth/schemas";
import { createRouteHandlerClient } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Password login. Establishes the cookie session and its platform mirror,
 * then returns the validated post-login target. Credential, account, and
 * lifecycle failures share the flow's generic denial.
 */
export async function POST(request: NextRequest): Promise<
  NextResponse<
    | ApiSuccessBody<{
        readonly next: string;
        readonly mfaRequired: boolean;
        readonly mustEnroll: boolean;
      }>
    | ApiErrorBody
  >
> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, loginInputSchema);
    const client = await createRouteHandlerClient();
    const result = await loginWithPassword(client, input, {
      correlationId,
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    // When the session must reach aal2, send the client to the 2FA challenge
    // or enrollment surface; the session gate enforces it regardless.
    const next = result.mustEnroll
      ? "/mfa/setup"
      : result.mfaRequired
        ? "/mfa/verify"
        : (input.next ?? "/account");
    return apiOk(
      { next, mfaRequired: result.mfaRequired, mustEnroll: result.mustEnroll },
      { correlationId },
    );
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
