// path: app/api/auth/mfa/verify-recovery-code/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { buildFlowRequest } from "@/lib/auth/flows/context";
import { verifyRecoveryCode } from "@/lib/auth/flows/mfa";
import { mfaRecoveryCodeVerifyRequestSchema } from "@/lib/auth/schemas";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Verifies a single-use recovery (backup) code and upgrades the session to
 * aal2 -- the path for a lost authenticator. Each code works once; the
 * rotated refresh token is rebound to the session mirror on success.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, mfaRecoveryCodeVerifyRequestSchema);
    const mfa = await resolveMfaSessionForRoute(request);
    await verifyRecoveryCode(
      mfa.client,
      buildFlowRequest(request, correlationId),
      mfa.userId,
      mfa.email,
      input.code,
    );
    return apiOk({ verified: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
