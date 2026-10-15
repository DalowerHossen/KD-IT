// path: app/api/auth/mfa/challenge/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { buildFlowRequest } from "@/lib/auth/flows/context";
import { challengeFactor } from "@/lib/auth/flows/mfa";
import { mfaChallengeRequestSchema } from "@/lib/auth/schemas";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Creates a verification challenge for an enrolled factor; returns the id. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, mfaChallengeRequestSchema);
    const mfa = await resolveMfaSessionForRoute(request);
    const { challengeId } = await challengeFactor(
      mfa.client,
      buildFlowRequest(request, correlationId),
      mfa.userId,
      input.factorId,
    );
    return apiOk({ challengeId }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
