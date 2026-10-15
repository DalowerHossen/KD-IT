// path: app/api/auth/mfa/enroll/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { buildFlowRequest } from "@/lib/auth/flows/context";
import { enrollTotp } from "@/lib/auth/flows/mfa";
import { mfaEnrollRequestSchema } from "@/lib/auth/schemas";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Starts TOTP enrollment and returns the factor id, QR code (SVG data), and
 * the secret for manual entry. The factor stays unverified until the user
 * completes challenge + verify. The secret is shown once and never persisted
 * in plaintext by the platform.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, mfaEnrollRequestSchema);
    const mfa = await resolveMfaSessionForRoute(request);
    const result = await enrollTotp(
      mfa.client,
      buildFlowRequest(request, correlationId),
      mfa.userId,
      input.friendlyName,
    );
    return apiOk(
      { factorId: result.factorId, qrCode: result.qrCode, secret: result.secret },
      { correlationId },
    );
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
