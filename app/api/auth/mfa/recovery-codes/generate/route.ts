// path: app/api/auth/mfa/recovery-codes/generate/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { buildFlowRequest } from "@/lib/auth/flows/context";
import { generateRecoveryCodes } from "@/lib/auth/flows/mfa";
import { mfaRecoveryCodesGenerateRequestSchema } from "@/lib/auth/schemas";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Generates the user's single set of recovery (backup) codes. The plaintext
 * codes are returned exactly once; the client must present them for the user
 * to store. Requires an existing verified second factor (recovery codes are
 * never the only factor) and a session already at aal2.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, mfaRecoveryCodesGenerateRequestSchema);
    const mfa = await resolveMfaSessionForRoute(request);
    const codes = await generateRecoveryCodes(
      mfa.client,
      buildFlowRequest(request, correlationId),
      mfa.userId,
      input.friendlyName,
    );
    return apiOk({ codes }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
