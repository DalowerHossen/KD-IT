// path: app/api/platform/coupons/validate/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { couponRedeemRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { previewCouponDiscount } from "@/lib/billing/coupons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep K - validates a coupon against an order amount and returns the exact
 * discount without consuming a use. Fails when the code is unknown or the
 * coupon is not eligible for the order (inactive, expired, over its limit,
 * below the minimum, or out of plan scope).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, couponRedeemRequestSchema);
    const context = await workingContextForRoute(request);
    const discount = await previewCouponDiscount(context, body);
    return apiOk({ eligible: true, ...discount }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
