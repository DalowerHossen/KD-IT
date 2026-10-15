// path: app/api/platform/coupons/execute/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { executeCompanyCommandRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { executeCouponInputSchema, executeIssueCoupon } from "@/lib/billing/coupons";
import { getCommandById } from "@/lib/db/repositories/commands";
import { ConflictError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep K - executes an APPROVED billing.coupon.issue command. Only commands
 * in the "approved" state may be executed; the domain mutation re-verifies the
 * approval and executes exactly once, so a retry can never create a duplicate
 * coupon.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, executeCompanyCommandRequestSchema);
    const context = await workingContextForRoute(request);
    const command = await getCommandById(context, body.commandId);
    if (command.status !== "approved") {
      throw new ConflictError("This request is not ready to execute.");
    }
    if (command.kind !== "billing.coupon.issue") {
      throw new ConflictError("This request cannot be executed.");
    }
    const input = executeCouponInputSchema.parse({ ...command.payload, commandId: command.id });
    const coupon = await executeIssueCoupon(context, input);
    return apiOk(coupon, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
