// path: app/api/platform/kyc/[applicationId]/decision/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { kycDecisionInputSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { proposeKycDecision } from "@/lib/company/kyc";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep O - proposes a kyc.decision.finalize command (approve or reject).
 * The decision is applied only once the command clears the approval chain.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const { applicationId } = await params;
    const validId = uuidV7Schema.parse(applicationId);
    const body = await parseJsonBody(request, kycDecisionInputSchema);
    const context = await workingContextForRoute(request);
    const { commandId } = await proposeKycDecision(context, validId, body);
    return apiOk({ commandId }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
