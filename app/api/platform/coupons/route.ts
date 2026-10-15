// path: app/api/platform/coupons/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { couponIssueInputSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { listCoupons, proposeIssueCoupon } from "@/lib/billing/coupons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep K - lists the platform coupon catalog. Super-admin/ceo. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const coupons = await listCoupons(context);
    return apiOk({ coupons }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}

/**
 * Substep K - proposes issuing a new coupon. Creates the billing.coupon.issue
 * approval command (super_admin/ceo); the coupon row is created only after the
 * command is fully approved and executed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, couponIssueInputSchema);
    const context = await workingContextForRoute(request);
    const { commandId } = await proposeIssueCoupon(context, body);
    return apiOk({ commandId, status: "proposed" }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
