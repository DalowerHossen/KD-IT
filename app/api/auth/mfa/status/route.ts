// path: app/api/auth/mfa/status/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { getMfaStatus } from "@/lib/auth/flows/mfa";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The signed-in user's 2FA posture: required vs current assurance level,
 * their factors, whether enrollment is required, and remaining backup codes.
 * Drives the security settings page and the post-login challenge decision.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const mfa = await resolveMfaSessionForRoute(request);
    const status = await getMfaStatus({
      client: mfa.client,
      userId: mfa.userId,
      correlationId,
    });
    return apiOk(status, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
