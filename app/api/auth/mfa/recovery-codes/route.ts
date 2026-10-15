// path: app/api/auth/mfa/recovery-codes/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { getRecoveryCodesStatus } from "@/lib/auth/flows/mfa";
import { resolveMfaSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The signed-in user's recovery (backup) codes status: total and remaining.
 * Returns remaining: 0 when the set is exhausted (prompt regeneration).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const mfa = await resolveMfaSessionForRoute(request);
    const status = await getRecoveryCodesStatus(mfa.client);
    return apiOk(status === null ? { total: 0, remaining: 0 } : status, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
