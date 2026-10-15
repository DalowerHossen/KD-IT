// path: app/api/auth/sessions/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk, type ApiErrorBody, type ApiSuccessBody } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { listSessions } from "@/lib/auth/flows/sessions";
import { type AuthSessionListItem } from "@/lib/auth/schemas";
import { resolveSessionForRoute } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lists the caller's live sessions with device labels and the current
 * session bound by token fingerprint. Fingerprints stay server-side; the
 * response carries a boolean current marker per session.
 */
export async function GET(
  request: NextRequest,
): Promise<
  NextResponse<ApiSuccessBody<{ readonly sessions: readonly AuthSessionListItem[] }> | ApiErrorBody>
> {
  const correlationId = requestCorrelationId(request);
  try {
    const { client, session } = await resolveSessionForRoute(
      request,
      requestIpFromHeaders(request.headers),
    );
    const sessions = await listSessions(client, session);
    return apiOk({ sessions }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
