// path: app/api/auth/mfa/verify/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { buildFlowRequest } from "@/lib/auth/flows/context";
import { verifyFactor } from "@/lib/auth/flows/mfa";
import { mfaVerifyRequestSchema } from "@/lib/auth/schemas";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Verifies a TOTP code for a factor and upgrades the session to aal2. On
 * success the rotated refresh token is rebound to the session mirror, so the
 * session gate admits the request thereafter. Every failure is generic.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, mfaVerifyRequestSchema);
    const mfa = await resolveMfaSessionForRoute(request);
    await verifyFactor(
      mfa.client,
      buildFlowRequest(request, correlationId),
      mfa.userId,
      mfa.email,
      input.factorId,
      input.challengeId,
      input.code,
    );
    return apiOk({ verified: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
