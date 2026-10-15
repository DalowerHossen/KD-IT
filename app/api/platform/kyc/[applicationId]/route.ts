// path: app/api/platform/kyc/[applicationId]/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { getKycApplicationForReview } from "@/lib/company/kyc";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep O - loads one KYC application (decrypted) for a platform reviewer. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const { applicationId } = await params;
    const validId = uuidV7Schema.parse(applicationId);
    const context = await workingContextForRoute(request);
    const kyc = await getKycApplicationForReview(context, validId);
    return apiOk(kyc, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
