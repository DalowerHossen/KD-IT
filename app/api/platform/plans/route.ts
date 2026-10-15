// path: app/api/platform/plans/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { createPlan, createPlanInputSchema, listPlans } from "@/lib/company/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep I - lists the platform plan catalog. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    await workingContextForRoute(request);
    const plans = await listPlans();
    return apiOk({ plans }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}

/** Substep I - super-admin/ceo creates a plan. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, createPlanInputSchema);
    const context = await workingContextForRoute(request);
    const plan = await createPlan(context, body);
    return apiOk(plan, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
