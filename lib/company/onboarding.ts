// path: lib/company/onboarding.ts
import "server-only";

import { z } from "zod";

import { companyCreateInputSchema, type CompanyCreateInput } from "@/lib/auth/schemas";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import {
  assertApprovedCommandFor,
  executeCommand,
  proposeAndAudit,
} from "@/lib/db/repositories/commands";
import { getPlan } from "@/lib/company/plans";
import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import {
  PLATFORM_COMPANY_ID,
  makeTenantContext,
  requirePlatformRole,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { NotFoundError, ValidationError } from "@/lib/errors/app-errors";
import { notifyWorkspaceReady } from "@/lib/notifications/service";

const CREATE_COMPANY_KIND = "admin.company.create" as const;

export interface ExecuteCompanyCreationInput extends CompanyCreateInput {
  readonly commandId: string;
}

const executeCompanyCreationInputSchema = companyCreateInputSchema.extend({
  commandId: z.string().min(1).max(64),
});
export { executeCompanyCreationInputSchema };

/**
 * Substep I - company onboarding (tenant provisioning). Proposing a company
 * creation is a dual-controlled platform command (super_admin/ceo); the
 * company and its owner binding are created only once the command is fully
 * approved and executed, in a single transaction so a retry can never create
 * a duplicate company.
 */

async function assertOwnerExists(ownerUserId: string): Promise<void> {
  const result = await pgQuery(
    `select 1 from app.profiles where user_id = $1 and deleted_at is null`,
    [ownerUserId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError("The selected owner does not have an account.");
  }
}

/** Proposes an admin.company.create command after validating the owner + plan. */
export async function proposeCompanyCreation(
  context: TenantContext,
  input: CompanyCreateInput,
): Promise<{ commandId: string }> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = companyCreateInputSchema.parse(input);
  await assertOwnerExists(validated.ownerUserId);
  if (validated.planId !== undefined && (await getPlan(validated.planId)) === null) {
    throw new ValidationError("The selected plan does not exist.");
  }
  return proposeAndAudit(context, {
    companyId: PLATFORM_COMPANY_ID,
    kind: CREATE_COMPANY_KIND,
    payload: {
      legalName: validated.legalName,
      displayName: validated.displayName,
      ...(validated.planId !== undefined ? { planId: validated.planId } : {}),
      ownerUserId: validated.ownerUserId,
    },
  });
}

/** Executes an approved company-creation command, atomically. */
export async function executeCompanyCreation(
  context: TenantContext,
  input: ExecuteCompanyCreationInput,
): Promise<{ companyId: string; membershipId: string }> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = executeCompanyCreationInputSchema.parse(input);
  await assertApprovedCommandFor(context, validated.commandId, CREATE_COMPANY_KIND);
  const planId = validated.planId ?? null;
  const settings = planId !== null ? JSON.stringify({ plan_id: planId }) : "{}";

  const created = await withPgTransaction(async (client) => {
    const owner = await client.query(
      `select 1 from app.profiles where user_id = $1 and deleted_at is null`,
      [validated.ownerUserId],
    );
    if (owner.rows.length === 0) {
      throw new NotFoundError("The selected owner does not have an account.");
    }
    const company = await client.query(
      `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
           values (app.platform_company_id(), $1, $2, false, $3::jsonb)
           returning id`,
      [validated.legalName, validated.displayName, settings],
    );
    const companyId = (company.rows[0] as { id: string }).id;
    const membership = await client.query(
      `insert into app.memberships
           (company_id, user_id, role, status, invited_by, invited_at, activated_at)
           values ($1, $2, 'owner', 'active', $3, clock_timestamp(), clock_timestamp())
           returning id`,
      [companyId, validated.ownerUserId, context.userId],
    );
    const membershipId = (membership.rows[0] as { id: string }).id;
    return { companyId, membershipId };
  }, tenantContextSettings(context));

  await executeCommand(context, validated.commandId, {
    companyId: created.companyId,
    membershipId: created.membershipId,
  });
  await appendAuditEvent(context, {
    actorType: "user",
    action: "company.created",
    resourceType: "companies",
    resourceId: created.companyId,
    actorId: context.userId,
    metadata: { ownerUserId: validated.ownerUserId, planId, commandId: validated.commandId },
  });
  // Substep J: notify the new owner, scoped to the new workspace.
  const newCompanyContext = makeTenantContext({
    companyId: created.companyId,
    userId: context.userId,
    role: context.role,
    correlationId: context.correlationId,
  });
  await notifyWorkspaceReady(newCompanyContext, {
    userId: validated.ownerUserId,
    companyId: created.companyId,
  });
  return created;
}
