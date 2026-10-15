// path: app/api/company/backups/[requestId]/download/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { downloadBackup } from "@/lib/company/backups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep N - downloads the decrypted export of a ready, unexpired backup
 * (owner). The artifact is stored encrypted at rest; the server decrypts it
 * within the authenticated request and returns the workspace snapshot.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const { requestId } = await params;
    const validRequest = uuidV7Schema.parse(requestId);
    const context = await workingContextForRoute(request);
    const backup = await downloadBackup(context, validRequest);
    return apiOk(backup, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
