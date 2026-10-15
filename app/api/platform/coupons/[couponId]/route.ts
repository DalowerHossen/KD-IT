// path: app/api/platform/coupons/[couponId]/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { couponStatusBodySchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { setCouponStatus } from "@/lib/billing/coupons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep K - activates or deactivates a coupon (super_admin/ceo). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ couponId: string }> },
): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const { couponId } = await params;
    const body = await parseJsonBody(request, couponStatusBodySchema);
    const context = await workingContextForRoute(request);
    const coupon = await setCouponStatus(context, couponId, body.status);
    return apiOk(coupon, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
