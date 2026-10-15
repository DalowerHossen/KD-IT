// path: app/api/notifications/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { listNotifications, unreadCount } from "@/lib/notifications/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep J - lists the signed-in user's notification inbox + unread count. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const [notifications, unread] = await Promise.all([
      listNotifications(context, 50),
      unreadCount(context),
    ]);
    return apiOk({ notifications, unread }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
