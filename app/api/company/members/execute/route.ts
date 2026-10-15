// path: app/api/company/members/execute/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import {
  executeMemberCommandRequestSchema,
  inviteMembershipInputSchema,
  suspendMembershipInputSchema,
  updateMembershipRoleInputSchema,
} from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { executeCommand, getCommandById } from "@/lib/db/repositories/commands";
import {
  inviteMembership,
  suspendMembership,
  updateMembershipRole,
} from "@/lib/db/repositories/memberships";
import { ConflictError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Executes an APPROVED membership command (invite, role change, or
 * suspend). Only commands in the "approved" state may be executed; the
 * domain mutation re-verifies the approval, the executor's role, the company
 * boundary, and optimistic-lock agreement, then the execution is recorded so
 * the command is idempotent. Any other state denies generically.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, executeMemberCommandRequestSchema);
    const context = await workingContextForRoute(request);
    const command = await getCommandById(context, body.commandId);
    if (command.status !== "approved") {
      throw new ConflictError("This request is not ready to execute.");
    }

    if (command.kind === "admin.membership.invite") {
      const input = inviteMembershipInputSchema.parse({
        ...command.payload,
        commandId: command.id,
      });
      const membership = await inviteMembership(context, input);
      await executeCommand(context, command.id, {
        membershipId: membership.id,
        status: membership.status,
      });
      return apiOk({ membershipId: membership.id, status: membership.status }, { correlationId });
    }

    if (command.kind === "admin.membership.update_role") {
      const input = updateMembershipRoleInputSchema.parse({
        ...command.payload,
        commandId: command.id,
      });
      const membership = await updateMembershipRole(context, input);
      await executeCommand(context, command.id, {
        membershipId: membership.id,
        status: membership.status,
      });
      return apiOk(
        { membershipId: membership.id, status: membership.status, role: membership.role },
        { correlationId },
      );
    }

    if (command.kind === "admin.membership.suspend") {
      const input = suspendMembershipInputSchema.parse({
        ...command.payload,
        commandId: command.id,
      });
      const membership = await suspendMembership(context, input);
      await executeCommand(context, command.id, {
        membershipId: membership.id,
        status: membership.status,
      });
      return apiOk({ membershipId: membership.id, status: membership.status }, { correlationId });
    }

    throw new ConflictError("This request cannot be executed.");
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
