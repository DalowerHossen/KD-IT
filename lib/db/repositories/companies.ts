// path: lib/db/repositories/companies.ts
import "server-only";

import { z } from "zod";

import { type CompanyStatus, companyStatusSchema } from "@/lib/auth/schemas";
import { withPgTransaction } from "@/lib/db/pg";
import { NotFoundError } from "@/lib/errors/app-errors";
import { type TenantContext, tenantContextSettings } from "@/lib/db/tenant-context";

/**
 * Substep C: company lifecycle reads needed for approval-aware role
 * resolution. A company confers access only while "active"; suspended and
 * archived companies confer no role to any of their members. Reads are
 * scoped to the active company boundary.
 */
const COMPANY_COLUMNS = "id, company_id, status, is_platform, display_name, version";

/** The active company's lifecycle status, or null when it does not exist. */
export async function getCompanyLifecycleStatus(
  context: TenantContext,
  companyId: string,
): Promise<CompanyStatus | null> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(`select status from app.companies where id = $1 and deleted_at is null`, [
        companyId,
      ]),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as { status: unknown } | undefined;
  if (row === undefined) {
    return null;
  }
  const parsed = companyStatusSchema.safeParse(row.status);
  return parsed.success ? parsed.data : null;
}

/** The active company row, for surfaces that need its identity. */
export interface CompanyRow {
  readonly id: string;
  readonly companyId: string;
  readonly status: CompanyStatus;
  readonly isPlatform: boolean;
  readonly displayName: string;
  readonly version: number;
}

const companyRowSchema = z.strictObject({
  id: z.string(),
  company_id: z.string(),
  status: companyStatusSchema,
  is_platform: z.boolean(),
  display_name: z.string(),
  version: z.number().int().min(1),
});

export async function getOwnCompany(context: TenantContext): Promise<CompanyRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${COMPANY_COLUMNS}
         from app.companies
         where id = $1 and deleted_at is null`,
        [context.companyId],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new NotFoundError("This workspace was not found.");
  }
  const parsed = companyRowSchema.parse(row);
  return {
    id: parsed.id,
    companyId: parsed.company_id,
    status: parsed.status,
    isPlatform: parsed.is_platform,
    displayName: parsed.display_name,
    version: parsed.version,
  };
}
