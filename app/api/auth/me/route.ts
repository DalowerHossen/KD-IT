// path: app/api/auth/me/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { resolveSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns the caller's own identity for authenticated surfaces: user id,
 * email, display name, and lifecycle status. Gated accounts receive the
 * session resolver's generic denial, never a partial identity.
 */
export async function GET(request: NextRequest): Promise<
  NextResponse<
    | ApiSuccessBody<{
        readonly userId: string;
        readonly email: string | null;
        readonly displayName: string;
        readonly status: string;
      }>
    | ApiErrorBody
  >
> {
  const correlationId = requestCorrelationId(request);
  try {
    const { session } = await resolveSessionForRoute(
      request,
      requestIpFromHeaders(request.headers),
    );
    return apiOk(
      {
        userId: session.userId,
        email: session.email,
        displayName: session.profile.display_name,
        status: session.profile.status,
      },
      { correlationId },
    );
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
