// path: app/api/auth/reauth/check/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { readAssurance } from "@/lib/auth/flows/mfa";
import {
  STEP_UP_TTL_MINUTES_DEFAULT,
  clampStepUpTtlMinutes,
  isCriticalAction,
  stepUpRequired,
} from "@/lib/auth/mfa-policy";
import { resolveSessionForRoute } from "@/lib/auth/session";
import { BadRequestError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tells the client whether a pending critical action needs a fresh
 * second-factor verification (step-up) before it may proceed. Returns
 * required=false for non-critical actions and for critical actions whose last
 * verification is within the TTL; required=true otherwise, in which case the
 * client re-prompts the MFA challenge and retries the action.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const actionId = request.nextUrl.searchParams.get("actionId");
    if (actionId === null) {
      return apiError(new BadRequestError("An action is required."), { correlationId });
    }
    if (!isCriticalAction(actionId)) {
      return apiOk({ required: false, actionId }, { correlationId });
    }
    const { client } = await resolveSessionForRoute(request, requestIpFromHeaders(request.headers));
    const assurance = await readAssurance(client);
    const ttl = clampStepUpTtlMinutes(STEP_UP_TTL_MINUTES_DEFAULT);
    const now = Math.floor(Date.now() / 1000);
    const required = stepUpRequired({
      role: "staff",
      isCriticalAction: true,
      lastAal2VerifiedAt: assurance.lastAal2VerifiedAt,
      now,
      ttlMinutes: ttl,
    });
    return apiOk({ required, actionId }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
