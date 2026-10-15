// path: app/api/security/account-unlock/request/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestAccountUnlock } from "@/lib/auth/flows/unlock";
import { createRouteHandlerClient } from "@/lib/auth/server-auth";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { unlockRequestInputSchema } from "@/lib/auth/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Requests a permissioned account unlock. Only an eligible platform admin
 * (super_admin/ceo) may propose it, and the request passes a step-up 2FA gate.
 * It creates a dual-control auth.account.unlock approval command; the lock is
 * only cleared once that command is fully approved and executed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, unlockRequestInputSchema);
    const context = await workingContextForRoute(request);
    const client = await createRouteHandlerClient();
    const result = await requestAccountUnlock(context, body, client);
    return apiOk(result, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
