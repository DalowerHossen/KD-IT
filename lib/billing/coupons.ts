// path: lib/billing/coupons.ts
import "server-only";

import { z } from "zod";

import {
  couponIssueInputSchema,
  couponRedeemRequestSchema,
  type CouponIssueInput,
  type CouponRedeemRequest,
} from "@/lib/auth/schemas";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import {
  assertApprovedCommandFor,
  executeCommand,
  proposeAndAudit,
} from "@/lib/db/repositories/commands";
import { pgQuery, toDatabaseError, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import {
  PLATFORM_COMPANY_ID,
  requirePlatformRole,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { Decimal, decimalToUsd, usdSubtract, usdToDecimal } from "@/lib/money/decimal";
import type { UsdAmount } from "@/lib/money/usd";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-errors";

const ISSUE_COUPON_KIND = "billing.coupon.issue" as const;

/**
 * Substep K - the platform coupon catalog. Coupons are platform-scope
 * reference data: a discount code with a type (percent or fixed), a canonical
 * USD value, and optional usage, lifetime, and plan-scope limits. Issuing a
 * coupon is the approval command billing.coupon.issue (super_admin/ceo);
 * redeeming one is an atomic, race-safe read-modify-write that can never
 * exceed max_uses. Money moves as canonical USD decimal strings (lib/money)
 * end to end.
 */

const COUPON_COLUMNS =
  "id, code, type, value, currency, max_uses, used_count, min_order_amount, applies_to_plan_id, expires_at, status";

const couponRowSchema = z.object({
  id: z.string().min(1).max(64),
  code: z.string().min(3).max(40),
  type: z.enum(["percent", "fixed"]),
  value: z.string(),
  currency: z.literal("USD"),
  max_uses: z.number().int().min(1).nullable(),
  used_count: z.number().int().min(0),
  min_order_amount: z.string().nullable(),
  applies_to_plan_id: z.string().min(1).max(64).nullable(),
  expires_at: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
});
export type CouponRow = z.infer<typeof couponRowSchema>;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

// ---------------------------------------------------------------------------
// Discount math (pure, exact, canonical USD in and out).
// ---------------------------------------------------------------------------

export interface CouponDiscount {
  readonly discount: UsdAmount;
  readonly finalAmount: UsdAmount;
}

/**
 * Computes the exact discount a coupon applies to an order amount. Percent
 * coupons round HALF_UP to scale 4 so a customer is never overcharged; a fixed
 * coupon is capped at the order amount so the final amount can never go
 * negative.
 */
export function computeCouponDiscount(orderAmount: string, coupon: CouponRow): CouponDiscount {
  const order = usdToDecimal(orderAmount);
  let discount: Decimal;
  if (coupon.type === "percent") {
    const value = usdToDecimal(coupon.value);
    if (value.gt(100)) {
      throw new ValidationError("Percent coupons cannot exceed 100.");
    }
    discount = order.mul(value).div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  } else {
    const value = usdToDecimal(coupon.value);
    discount = value.lt(order) ? value : order;
  }
  if (discount.isNegative()) {
    discount = new Decimal(0);
  }
  const discountCanonical = decimalToUsd(discount);
  const finalCanonical = usdSubtract(orderAmount, discountCanonical);
  return { discount: discountCanonical, finalAmount: finalCanonical };
}

// ---------------------------------------------------------------------------
// Catalog queries.
// ---------------------------------------------------------------------------

export async function listCoupons(
  context: TenantContext,
  filter?: { readonly status?: string },
): Promise<CouponRow[]> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const status = filter?.status ?? null;
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${COUPON_COLUMNS}
           from app.coupons
          where deleted_at is null
            and ($1::text is null or status = $1)
          order by created_at desc, id desc`,
        [status],
      ),
    tenantContextSettings(context),
  );
  return z.array(couponRowSchema).parse(result.rows);
}

export async function getCouponByCode(
  context: TenantContext,
  code: string,
): Promise<CouponRow | null> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${COUPON_COLUMNS} from app.coupons where code = $1 and deleted_at is null`,
        [code.toUpperCase()],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  return row === undefined ? null : couponRowSchema.parse(row);
}

// ---------------------------------------------------------------------------
// Issuance (approval command billing.coupon.issue).
// ---------------------------------------------------------------------------

export interface ExecuteCouponInput extends CouponIssueInput {
  readonly commandId: string;
}

export const executeCouponInputSchema = couponIssueInputSchema.extend({
  commandId: z.string().min(1).max(64),
});

function buildCouponPayload(input: CouponIssueInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    code: input.code,
    type: input.type,
    value: input.value,
  };
  if (input.maxUses !== undefined) {
    payload.maxUses = input.maxUses;
  }
  if (input.minOrderAmount !== undefined) {
    payload.minOrderAmount = input.minOrderAmount;
  }
  if (input.appliesToPlanId !== undefined) {
    payload.appliesToPlanId = input.appliesToPlanId;
  }
  if (input.expiresAt !== undefined) {
    payload.expiresAt = input.expiresAt;
  }
  return payload;
}

async function assertPlanScope(appliesToPlanId: string | undefined): Promise<void> {
  if (appliesToPlanId === undefined) {
    return;
  }
  const plan = await pgQuery("select 1 from app.plans where id = $1 and deleted_at is null", [
    appliesToPlanId,
  ]);
  if (plan.rows.length === 0) {
    throw new ValidationError("The selected plan does not exist.");
  }
}

/** Proposes a billing.coupon.issue command for a coupon (super_admin/ceo). */
export async function proposeIssueCoupon(
  context: TenantContext,
  input: CouponIssueInput,
): Promise<{ commandId: string }> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = couponIssueInputSchema.parse(input);
  if (validated.type === "percent" && usdToDecimal(validated.value).gt(100)) {
    throw new ValidationError("Percent coupons cannot exceed 100.");
  }
  await assertPlanScope(validated.appliesToPlanId);
  return proposeAndAudit(context, {
    companyId: PLATFORM_COMPANY_ID,
    kind: ISSUE_COUPON_KIND,
    payload: buildCouponPayload(validated),
  });
}

/** Creates a coupon row. Super-admin/ceo; reused codes conflict. */
export async function createCoupon(
  context: TenantContext,
  input: CouponIssueInput,
): Promise<CouponRow> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = couponIssueInputSchema.parse(input);
  const code = validated.code.toUpperCase();
  if (validated.type === "percent" && usdToDecimal(validated.value).gt(100)) {
    throw new ValidationError("Percent coupons cannot exceed 100.");
  }
  await assertPlanScope(validated.appliesToPlanId);
  try {
    const result = await withPgTransaction(
      async (client) =>
        client.query(
          `insert into app.coupons
             (company_id, code, type, value, currency, max_uses, min_order_amount, applies_to_plan_id, expires_at)
           values (app.platform_company_id(), $1, $2, $3::numeric, 'USD', $4, $5::numeric, $6, $7::timestamptz)
           returning ${COUPON_COLUMNS}`,
          [
            code,
            validated.type,
            validated.value,
            validated.maxUses ?? null,
            validated.minOrderAmount ?? null,
            validated.appliesToPlanId ?? null,
            validated.expiresAt ?? null,
          ],
        ),
      tenantContextSettings(context),
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw toDatabaseError(new Error("coupon insert returned no row"));
    }
    return couponRowSchema.parse(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A coupon with that code already exists.");
    }
    throw error;
  }
}

/** Executes an approved billing.coupon.issue command exactly once. */
export async function executeIssueCoupon(
  context: TenantContext,
  input: ExecuteCouponInput,
): Promise<CouponRow> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = executeCouponInputSchema.parse(input);
  await assertApprovedCommandFor(context, validated.commandId, ISSUE_COUPON_KIND);
  const created = await createCoupon(context, {
    code: validated.code,
    type: validated.type,
    value: validated.value,
    ...(validated.maxUses !== undefined ? { maxUses: validated.maxUses } : {}),
    ...(validated.minOrderAmount !== undefined ? { minOrderAmount: validated.minOrderAmount } : {}),
    ...(validated.appliesToPlanId !== undefined
      ? { appliesToPlanId: validated.appliesToPlanId }
      : {}),
    ...(validated.expiresAt !== undefined ? { expiresAt: validated.expiresAt } : {}),
  });
  await executeCommand(context, validated.commandId, { couponId: created.id, code: created.code });
  await appendAuditEvent(context, {
    actorType: "user",
    action: "coupon.issued",
    resourceType: "coupons",
    resourceId: created.id,
    actorId: context.userId,
    metadata: { code: created.code, type: created.type, commandId: validated.commandId },
  });
  return created;
}

// ---------------------------------------------------------------------------
// Redemption (atomic, race-safe) and validation.
// ---------------------------------------------------------------------------

/**
 * Validates a coupon against an order amount and returns the exact discount
 * without consuming a use. The eligibility guard (active, unexpired, under
 * max_uses, meets the minimum, matches the plan scope) is evaluated in SQL.
 */
export async function previewCouponDiscount(
  context: TenantContext,
  request: CouponRedeemRequest,
): Promise<CouponDiscount> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = couponRedeemRequestSchema.parse(request);
  const code = validated.code.toUpperCase();
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${COUPON_COLUMNS}
           from app.coupons
          where code = $1
            and deleted_at is null
            and status = 'active'
            and (expires_at is null or expires_at > clock_timestamp())
            and (max_uses is null or used_count < max_uses)
            and (min_order_amount is null or $2::numeric >= min_order_amount)
            and (applies_to_plan_id is null or $3::uuid is null or applies_to_plan_id = $3::uuid)`,
        [code, validated.orderAmount, validated.appliesToPlanId ?? null],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    const existing = await pgQuery(
      "select code from app.coupons where code = $1 and deleted_at is null",
      [code],
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError("The coupon was not found.");
    }
    throw new ValidationError("This coupon is not available for this order.");
  }
  return computeCouponDiscount(validated.orderAmount, couponRowSchema.parse(row));
}

export interface CouponRedeemResult {
  readonly couponId: string;
  readonly code: string;
  readonly discount: UsdAmount;
  readonly finalAmount: UsdAmount;
  readonly usesRemaining: number | null;
}

/**
 * Atomically consumes one use of a coupon and returns the exact discount. The
 * use is only taken when every eligibility guard holds in a single
 * read-modify-write, so two concurrent redemptions can never push used_count
 * past max_uses. Called by the billing pipeline (Step 04/06) when a coupon is
 * applied to a real order.
 */
export async function redeemCoupon(
  context: TenantContext,
  request: CouponRedeemRequest,
): Promise<CouponRedeemResult> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const validated = couponRedeemRequestSchema.parse(request);
  const code = validated.code.toUpperCase();
  const { row, discount, finalAmount } = await withPgTransaction(async (client) => {
    const updated = await client.query(
      `update app.coupons
            set used_count = used_count + 1
          where code = $1
            and deleted_at is null
            and status = 'active'
            and (expires_at is null or expires_at > clock_timestamp())
            and (max_uses is null or used_count < max_uses)
            and (min_order_amount is null or $2::numeric >= min_order_amount)
            and (applies_to_plan_id is null or $3::uuid is null or applies_to_plan_id = $3::uuid)
          returning ${COUPON_COLUMNS}`,
      [code, validated.orderAmount, validated.appliesToPlanId ?? null],
    );
    if (updated.rows.length === 0) {
      const existing = await client.query(
        "select code from app.coupons where code = $1 and deleted_at is null",
        [code],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError("The coupon was not found.");
      }
      throw new ValidationError("This coupon is not available for this order.");
    }
    const parsed = couponRowSchema.parse(updated.rows[0]);
    const calc = computeCouponDiscount(validated.orderAmount, parsed);
    return { row: parsed, discount: calc.discount, finalAmount: calc.finalAmount };
  }, tenantContextSettings(context));
  await appendAuditEvent(context, {
    actorType: "user",
    action: "coupon.redeemed",
    resourceType: "coupons",
    resourceId: row.id,
    actorId: context.userId,
    metadata: { code: row.code, orderAmount: validated.orderAmount, discount },
  });
  return {
    couponId: row.id,
    code: row.code,
    discount,
    finalAmount,
    usesRemaining: row.max_uses === null ? null : row.max_uses - row.used_count,
  };
}

// ---------------------------------------------------------------------------
// Status management.
// ---------------------------------------------------------------------------

/** Activates or deactivates a coupon (super_admin/ceo). Idempotent. */
export async function setCouponStatus(
  context: TenantContext,
  couponId: string,
  status: "active" | "inactive",
): Promise<CouponRow> {
  requirePlatformRole(context, ["super_admin", "ceo"]);
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.coupons set status = $2
           where id = $1 and deleted_at is null
           returning ${COUPON_COLUMNS}`,
        [couponId, status],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new NotFoundError("The coupon was not found.");
  }
  const updated = couponRowSchema.parse(row);
  await appendAuditEvent(context, {
    actorType: "user",
    action: status === "active" ? "coupon.activated" : "coupon.deactivated",
    resourceType: "coupons",
    resourceId: updated.id,
    actorId: context.userId,
    metadata: { code: updated.code },
  });
  return updated;
}
