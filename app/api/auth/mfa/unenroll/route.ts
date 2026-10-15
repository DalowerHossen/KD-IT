// path: app/api/auth/mfa/unenroll/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { buildFlowRequest } from "@/lib/auth/flows/context";
import { unenrollFactor } from "@/lib/auth/flows/mfa";
import { mfaUnenrollRequestSchema } from "@/lib/auth/schemas";
import { requireFreshReauthentication } from "@/lib/auth/step-up";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Removes a factor. Unenrolling is a critical action: it additionally
 * requires a fresh (TTL-bounded) second-factor verification on top of the
 * aal2 the provider already demands, so a stale aal2 session cannot drop a
 * factor. A stale session raises the step-up reauthentication requirement.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, mfaUnenrollRequestSchema);
    const mfa = await resolveMfaSessionForRoute(request);
    await requireFreshReauthentication(mfa.client, "mfa.unenroll");
    await unenrollFactor(
      mfa.client,
      buildFlowRequest(request, correlationId),
      mfa.userId,
      input.factorId,
    );
    return apiOk({ unenrolled: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
