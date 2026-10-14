// path: lib/db/repositories/commands.ts
import "server-only";

import { z } from "zod";

import { withPgTransaction } from "@/lib/db/pg";
import {
  type TenantContext,
  requireCommandPermission,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { ForbiddenError, NotFoundError } from "@/lib/errors/app-errors";
import {
  type CommandRow,
  type ProposeCommandInput,
  commandRowSchema,
  proposeCommandInputSchema,
} from "@/lib/commands/types";

/**
 * Command approval repository. State transitions are enforced twice:
 * REQUIRE_COMMAND_PERMISSION applies the role matrix before the call, and
 * the SECURITY DEFINER RPCs re-check the SQL-side context (supplied from
 * the same tenant context) inside the database. Both sides deny by
 * default.
 */

export const COMMAND_COLUMNS =
  "id, company_id, kind, payload, payload_hash, status, initiator_id, attestation, step_up_confirmed, dual_control_required, dual_confirmed_by, l2_approved_by, l2_approved_at, l3_approved_by, l3_approved_at, delegated_to, expires_at, executed_at, executed_by, execution_result, rejection_reason, rejected_reason_code, idempotency_key, created_at, updated_at, deleted_at, version";

async function runCommandRpc(
  context: TenantContext,
  sql: string,
  params: readonly unknown[],
): Promise<unknown> {
  const result = await withPgTransaction(
    async (client) => client.query(sql, [...params]),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row === undefined ? undefined : Object.values(row)[0];
}

export async function proposeCommand(
  context: TenantContext,
  input: ProposeCommandInput,
): Promise<string> {
  const validated = proposeCommandInputSchema.parse(input);
  requireCommandPermission(context, validated.kind);
  const id = await runCommandRpc(
    context,
    "select app.command_propose($1::uuid, $2, $3::jsonb, make_interval(mins => $4), $5, $6, $7::jsonb) as id",
    [
      validated.companyId,
      validated.kind,
      JSON.stringify(validated.payload),
      validated.commandTtlMinutes ?? 1440,
      validated.idempotencyKey ?? null,
      validated.dualControl ?? false,
      JSON.stringify(
        validated.attestation !== undefined ? { attestation: validated.attestation } : {},
      ),
    ],
  );
  return z.string().parse(id);
}

export async function approveCommandL2(
  context: TenantContext,
  commandId: string,
  note?: string,
): Promise<void> {
  await runCommandRpc(context, "select app.command_approve_l2($1::uuid, $2)", [
    commandId,
    note ?? null,
  ]);
}

export async function approveCommandL3(
  context: TenantContext,
  commandId: string,
  note?: string,
): Promise<void> {
  await runCommandRpc(context, "select app.command_approve_l3($1::uuid, $2)", [
    commandId,
    note ?? null,
  ]);
}

export async function stepUpCommand(context: TenantContext, commandId: string): Promise<void> {
  await runCommandRpc(context, "select app.command_step_up($1::uuid)", [commandId]);
}

export async function finalConfirmCommand(
  context: TenantContext,
  commandId: string,
): Promise<void> {
  await runCommandRpc(context, "select app.command_final_confirm($1::uuid)", [commandId]);
}

export async function rejectCommand(
  context: TenantContext,
  commandId: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length < 3) {
    throw new ForbiddenError("A rejection reason is required.");
  }
  await runCommandRpc(context, "select app.command_reject($1::uuid, $2)", [
    commandId,
    reason.trim(),
  ]);
}

export async function delegateCommand(
  context: TenantContext,
  commandId: string,
  toUserId: string,
): Promise<void> {
  await runCommandRpc(context, "select app.command_delegate($1::uuid, $2::uuid, null)", [
    commandId,
    toUserId,
  ]);
}

export async function escalateCommand(
  context: TenantContext,
  commandId: string,
  reason: string,
): Promise<void> {
  await runCommandRpc(context, "select app.command_escalate($1::uuid, $2)", [
    commandId,
    reason.trim(),
  ]);
}

export interface CommandExecution {
  readonly status: string;
  readonly executedBy: string | null;
  readonly result: Record<string, unknown> | null;
}

const commandExecutionSchema = z.object({
  status: z.string(),
  executed_by: z.string().nullable().optional(),
  executedBy: z.string().nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * Executes a fully approved command exactly once. Repeated calls replay
 * the recorded result, making every mutation idempotent by design.
 */
export async function executeCommand(
  context: TenantContext,
  commandId: string,
  result?: Record<string, unknown>,
): Promise<CommandExecution> {
  const raw = await runCommandRpc(context, "select app.command_execute($1::uuid, $2::jsonb)", [
    commandId,
    JSON.stringify(result ?? {}),
  ]);
  const parsed = commandExecutionSchema.parse(raw);
  return {
    status: parsed.status,
    executedBy: parsed.executed_by ?? parsed.executedBy ?? null,
    result: parsed.result ?? null,
  };
}

export async function getCommandById(
  context: TenantContext,
  commandId: string,
): Promise<CommandRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${COMMAND_COLUMNS} from app.command_approvals where id = $1 and deleted_at is null`,
        [commandId],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new NotFoundError("Command not found.");
  }
  const parsed = commandRowSchema.parse(row);
  if (parsed.company_id !== context.companyId && !context.isPlatform) {
    throw new ForbiddenError("This record does not belong to your workspace.");
  }
  return parsed;
}

export interface CommandListQuery {
  readonly limit: number;
  readonly cursor?: string;
  readonly status?: string;
}

export async function listCommands(
  context: TenantContext,
  query: CommandListQuery,
): Promise<CommandRow[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${COMMAND_COLUMNS}
         from app.command_approvals
         where deleted_at is null
           and company_id = $1
           and ($2::text is null or status = $2)
           and ($3::timestamptz is null or created_at < $3)
         order by created_at desc, id desc
         limit $4`,
        [context.companyId, query.status ?? null, query.cursor ?? null, query.limit],
      ),
    tenantContextSettings(context),
  );
  return z.array(commandRowSchema).parse(result.rows);
}

/** Step-up executed with audit correlation by callers at route level. */
export async function proposeAndAudit(
  context: TenantContext,
  input: ProposeCommandInput,
): Promise<{ commandId: string }> {
  const commandId = await proposeCommand(context, input);
  await appendAuditEvent(context, {
    actorType: "user",
    action: `command.proposed.${input.kind}`,
    resourceType: "command_approvals",
    resourceId: commandId,
    metadata: { kind: input.kind },
  });
  return { commandId };
}
