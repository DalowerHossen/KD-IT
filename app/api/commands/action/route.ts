// path: app/api/commands/action/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { commandActionRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import {
  approveCommandL2,
  approveCommandL3,
  finalConfirmCommand,
  getCommandById,
  rejectCommand,
  stepUpCommand,
} from "@/lib/db/repositories/commands";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Drives one stage of the command approval chain: step-up attestation, L2
 * (CEO), L3 (super-admin), final confirmation (a DISTINCT super-admin when
 * dual control is required), or rejection. Each stage enforces its own role
 * and state in the database, so a caller can never advance a command they are
 * not entitled to move. This is what makes the permissioned unlock's
 * CEO + super-admin chain completable through the API.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, commandActionRequestSchema);
    const context = await workingContextForRoute(request);

    switch (body.action) {
      case "step-up":
        await stepUpCommand(context, body.commandId);
        break;
      case "approve-l2":
        await approveCommandL2(context, body.commandId, body.reason);
        break;
      case "approve-l3":
        await approveCommandL3(context, body.commandId, body.reason);
        break;
      case "final-confirm":
        await finalConfirmCommand(context, body.commandId);
        break;
      case "reject":
        if (body.reason === undefined) {
          throw new Error("A rejection reason is required.");
        }
        await rejectCommand(context, body.commandId, body.reason);
        break;
    }

    const command = await getCommandById(context, body.commandId);
    return apiOk({ commandId: command.id, status: command.status }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
