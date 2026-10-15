// path: lib/company/plans.ts
import "server-only";

import { z } from "zod";

import { pgQuery, withPgTransaction, toDatabaseError } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { requirePlatformRole, tenantContextSettings } from "@/lib/db/tenant-context";
import { ConflictError } from "@/lib/errors/app-errors";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

/**
 * Substep I - the plan catalog repository. Plans are platform-scope reference
 * data. Prices are canonical USD decimal strings (numeric(18,4) in the
 * database); the pg driver returns them as strings so no floating-point money
 * ever crosses a boundary.
 */

const PLAN_COLUMNS =
  "id, name, price, billing_period, storage_quota_bytes, max_members, entitlements";

const planRowSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  price: z.string(),
  billing_period: z.enum(["month", "year"]),
  storage_quota_bytes: z.number().int().min(0),
  max_members: z.number().int().min(1),
  entitlements: z.array(z.string().min(1)),
});
export type PlanRow = z.infer<typeof planRowSchema>;

/** Canonical USD decimal string, up to 14 digits before the point and 4 after. */
const PRICE_RE = /^\d{1,14}(\.\d{1,4})?$/;

export const createPlanInputSchema = z.strictObject({
  name: z.string().min(1).max(100),
  price: z.string().regex(PRICE_RE, "Price must be a non-negative decimal string."),
  billingPeriod: z.enum(["month", "year"]),
  storageQuotaBytes: z.number().int().min(0),
  maxMembers: z.number().int().min(1),
  entitlements: z.array(z.string().min(1)).min(1),
});
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;

export async function listPlans(): Promise<PlanRow[]> {
  const result = await pgQuery(
    `select ${PLAN_COLUMNS} from app.plans where deleted_at is null order by price, name`,
  );
  return z.array(planRowSchema).parse(result.rows);
}

export async function getPlan(planId: string): Promise<PlanRow | null> {
  const result = await pgQuery(
    `select ${PLAN_COLUMNS} from app.plans where id = $1 and deleted_at is null`,
    [planId],
  );
  const row = result.rows[0];
  return row === undefined ? null : planRowSchema.parse(row);
}

/** Super-admin/ceo create a plan. Reused names conflict. */
export async function createPlan(context: TenantContext, input: CreatePlanInput): Promise<PlanRow> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = createPlanInputSchema.parse(input);
  try {
    const result = await withPgTransaction(
      async (client) =>
        client.query(
          `insert into app.plans
             (company_id, name, price, billing_period, storage_quota_bytes, max_members, entitlements)
           values (app.platform_company_id(), $1, $2::numeric, $3, $4, $5, $6::jsonb)
           returning ${PLAN_COLUMNS}`,
          [
            validated.name,
            validated.price,
            validated.billingPeriod,
            validated.storageQuotaBytes,
            validated.maxMembers,
            JSON.stringify(validated.entitlements),
          ],
        ),
      tenantContextSettings(context),
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw toDatabaseError(new Error("plan insert returned no row"));
    }
    return planRowSchema.parse(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A plan with that name already exists.");
    }
    throw error;
  }
}
