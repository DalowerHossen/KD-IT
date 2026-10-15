// path: app/api/security/account-unlock/execute/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { executeAccountUnlock } from "@/lib/auth/flows/unlock";
import { executeUnlockRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { executeCommand, getCommandById } from "@/lib/db/repositories/commands";
import { ConflictError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Executes a fully APPROVED auth.account.unlock command. Only a command in the
 * "approved" state may be executed; the domain flow re-verifies the approval,
 * lifts the active lock through the optimistic-locked writer, and audits the
 * unlock. The execution is recorded so the command is idempotent. Any other
 * state denies with one generic error so approval progress cannot be
 * enumerated.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, executeUnlockRequestSchema);
    const context = await workingContextForRoute(request);
    const command = await getCommandById(context, body.commandId);
    if (command.kind !== "auth.account.unlock" || command.status !== "approved") {
      throw new ConflictError("This request is not ready to execute.");
    }

    const result = await executeAccountUnlock(context, command);
    await executeCommand(context, command.id, {
      cleared: result.cleared,
      reason: result.reason,
      subjectHash: result.subjectHash,
    });
    return apiOk(result, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
