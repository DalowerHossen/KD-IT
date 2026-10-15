// path: app/api/company/backups/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { listBackups, requestBackup } from "@/lib/company/backups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep N - lists the workspace's backup requests. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const backups = await listBackups(context);
    return apiOk({ backups }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}

/**
 * Substep N - requests an encrypted backup (owner, "backups" entitlement).
 * Starts pending; a background worker fulfils it into a downloadable export.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const context = await workingContextForRoute(request);
    const backup = await requestBackup(context);
    return apiOk(backup, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
