// path: app/api/notifications/mark-read/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { markNotificationReadRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { markNotificationRead } from "@/lib/notifications/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep J - marks one of the signed-in user's notifications read. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, markNotificationReadRequestSchema);
    const context = await workingContextForRoute(request);
    await markNotificationRead(context, body.notificationId);
    return apiOk({ ok: true }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
