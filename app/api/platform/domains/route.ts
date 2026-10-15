// path: app/api/platform/domains/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { listPendingDomains } from "@/lib/company/domains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep M - the platform queue of pending custom-domain verifications. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const domains = await listPendingDomains(context);
    return apiOk({ domains }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
