// path: app/api/platform/companies/execute/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { executeCompanyCommandRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import {
  executeCompanyCreation,
  executeCompanyCreationInputSchema,
} from "@/lib/company/onboarding";
import { getCommandById } from "@/lib/db/repositories/commands";
import { ConflictError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep I - executes an APPROVED company-creation command. Only commands in
 * the "approved" state may be executed; the domain mutation re-verifies the
 * approval, the executor's role, and executes exactly once (idempotent), so a
 * retry can never create a duplicate company.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, executeCompanyCommandRequestSchema);
    const context = await workingContextForRoute(request);
    const command = await getCommandById(context, body.commandId);
    if (command.status !== "approved") {
      throw new ConflictError("This request is not ready to execute.");
    }
    if (command.kind !== "admin.company.create") {
      throw new ConflictError("This request cannot be executed.");
    }
    const input = executeCompanyCreationInputSchema.parse({
      ...command.payload,
      commandId: command.id,
    });
    const result = await executeCompanyCreation(context, input);
    return apiOk(result, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
