// path: app/api/platform/kyc/[applicationId]/resubmission/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { kycResubmissionInputSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { requestKycResubmission } from "@/lib/company/kyc";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep O - requests the owner re-submit a rejected KYC application. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const { applicationId } = await params;
    const validId = uuidV7Schema.parse(applicationId);
    const body = await parseJsonBody(request, kycResubmissionInputSchema);
    const context = await workingContextForRoute(request);
    const kyc = await requestKycResubmission(context, validId, body);
    return apiOk(kyc, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
