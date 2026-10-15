// path: app/api/platform/kyc/decision/execute/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { kycExecuteDecisionSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { executeKycDecision } from "@/lib/company/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep O - applies a fully-approved kyc.decision.finalize command. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, kycExecuteDecisionSchema);
    const context = await workingContextForRoute(request);
    const kyc = await executeKycDecision(context, body.commandId);
    return apiOk(kyc, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
