// path: app/api/platform/kyc/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { listPendingKycApplications } from "@/lib/company/kyc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep O - the cross-tenant queue of KYC applications awaiting review. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const queue = await listPendingKycApplications(context);
    return apiOk({ queue }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
