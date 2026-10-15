// path: scripts/acceptance/step-03k/offline.mjs
// Step 03 substep K offline acceptance: the platform coupon catalog.
// Verifies the coupon table (migration 016), the pre-registered coupon
// permission/command, the repository/service surface, the exact discount math
// (canonical USD, percent HALF_UP rounding, fixed capped at the order amount),
// the boundary schemas (code uppercasing, canonical-USD normalization), and the
// routes. Runs without a database; the live redemption round-trip is exercised
// by live.mjs when credentials exist.

import { readFileSync } from "node:fs";

const checks = [];
let failures = 0;

function check(id, outcome, detail) {
  checks.push({ id, outcome });
  if (outcome !== true) {
    failures += 1;
  }
  const status = outcome === true ? "PASS" : "FAIL";
  process.stdout.write(`${status} ${id}${detail === undefined ? "" : `: ${detail}`}\n`);
}

process.env.NODE_ENV = "test";

const coupons = await import("../../../lib/billing/coupons.ts");
const schemas = await import("../../../lib/auth/schemas.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig016 = read("../../../supabase/migrations/016_coupons.up.sql");
const mig016down = read("../../../supabase/migrations/016_coupons.down.sql");
const couponsSrc = read("../../../lib/billing/coupons.ts");
const listRouteSrc = read("../../../app/api/platform/coupons/route.ts");
const executeRouteSrc = read("../../../app/api/platform/coupons/execute/route.ts");
const validateRouteSrc = read("../../../app/api/platform/coupons/validate/route.ts");
const statusRouteSrc = read("../../../app/api/platform/coupons/[couponId]/route.ts");
const permissionsSrc = read("../../../lib/auth/permissions.ts");
const commandTypesSrc = read("../../../lib/commands/types.ts");

// ---------------------------------------------------------------------------
// Storage: migration 016 coupon catalog.
// ---------------------------------------------------------------------------
check(
  "migration016.coupons_table",
  mig016.includes("create table app.coupons (") &&
    mig016.includes("code text not null check (char_length(btrim(code)) between 3 and 40)") &&
    mig016.includes("type text not null check (type in ('percent', 'fixed'))") &&
    mig016.includes("value numeric(18,4) not null check (value >= 0)") &&
    mig016.includes("used_count integer not null default 0") &&
    mig016.includes("status text not null default 'active'"),
);
check(
  "migration016.contract_and_scope",
  mig016.includes("id uuid primary key default app.uuid_v7()") &&
    mig016.includes("company_id uuid not null references app.companies (id) on delete restrict") &&
    mig016.includes("version integer not null default 1") &&
    mig016.includes("currency text not null default 'USD' check (currency = 'USD')") &&
    mig016.includes("constraint coupons_percent_range check (type <> 'percent' or value <= 100)"),
);
check(
  "migration016.rls_grants_triggers",
  mig016.includes("enable row level security") &&
    mig016.includes("force row level security") &&
    mig016.includes("grant select, insert, update, delete on app.coupons to service_role") &&
    mig016.includes("execute function app.touch_updated_at()") &&
    mig016.includes("execute function app.guard_optimistic_version()"),
);
check("migration016.rollback", mig016down.includes("drop table if exists app.coupons"));

// ---------------------------------------------------------------------------
// Pre-registered permission + command (reuse, not new).
// ---------------------------------------------------------------------------
check(
  "coupon.permission_registered",
  permissionsSrc.includes('"billing.coupon.manage"') &&
    permissionsSrc.includes('"Manage platform coupons."'),
);
check(
  "coupon.command_registered",
  commandTypesSrc.includes('"billing.coupon.issue"') &&
    /"billing.coupon.issue": \["super_admin", "ceo"\]/.test(commandTypesSrc),
);

// ---------------------------------------------------------------------------
// Module surface.
// ---------------------------------------------------------------------------
check(
  "module.functions",
  typeof coupons.listCoupons === "function" &&
    typeof coupons.createCoupon === "function" &&
    typeof coupons.proposeIssueCoupon === "function" &&
    typeof coupons.executeIssueCoupon === "function" &&
    typeof coupons.previewCouponDiscount === "function" &&
    typeof coupons.redeemCoupon === "function" &&
    typeof coupons.setCouponStatus === "function" &&
    typeof coupons.computeCouponDiscount === "function",
);
check(
  "module.schemas",
  schemas.couponIssueInputSchema !== undefined &&
    schemas.couponRedeemRequestSchema !== undefined &&
    schemas.couponStatusBodySchema !== undefined &&
    coupons.executeCouponInputSchema !== undefined,
);
check(
  "module.platform_gated",
  couponsSrc.includes('requirePlatformRole(context, ["super_admin", "ceo"])') &&
    couponsSrc.includes("PLATFORM_COMPANY_ID") &&
    couponsSrc.includes("ISSUE_COUPON_KIND"),
);

// ---------------------------------------------------------------------------
// Discount math (pure, exact, canonical USD).
// ---------------------------------------------------------------------------
function discount(orderAmount, type, value) {
  return coupons.computeCouponDiscount(orderAmount, { type, value });
}
const percent10 = discount("100.0000", "percent", "10.0000");
check(
  "discount.percent",
  percent10.discount === "10.0000" && percent10.finalAmount === "90.0000",
  JSON.stringify(percent10),
);
const half = discount("45.0000", "percent", "50.0000");
check(
  "discount.percent_half",
  half.discount === "22.5000" && half.finalAmount === "22.5000",
  JSON.stringify(half),
);
const roundUp = discount("1.0000", "percent", "33.3333");
check(
  "discount.percent_rounding",
  roundUp.discount === "0.3333" && roundUp.finalAmount === "0.6667",
  JSON.stringify(roundUp),
);
const fixed = discount("50.0000", "fixed", "5.0000");
check(
  "discount.fixed",
  fixed.discount === "5.0000" && fixed.finalAmount === "45.0000",
  JSON.stringify(fixed),
);
const capped = discount("4.0000", "fixed", "5.0000");
check(
  "discount.fixed_capped_at_order",
  capped.discount === "4.0000" && capped.finalAmount === "0.0000",
  JSON.stringify(capped),
);
let percentOver100Threw = false;
try {
  discount("100.0000", "percent", "150.0000");
} catch {
  percentOver100Threw = true;
}
check("discount.percent_over_100_rejects", percentOver100Threw);

// ---------------------------------------------------------------------------
// Boundary schemas: code uppercasing + canonical-USD normalization.
// ---------------------------------------------------------------------------
const issued = schemas.couponIssueInputSchema.parse({
  code: "save10",
  type: "percent",
  value: "10.5",
});
check(
  "schema.code_and_value_normalized",
  issued.code === "SAVE10" && issued.value === "10.5000",
  JSON.stringify(issued),
);
check(
  "schema.rejects_short_code",
  schemas.couponIssueInputSchema.safeParse({ code: "ab", type: "percent", value: "10" }).success ===
    false,
);

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------
check(
  "routes.list_and_propose",
  listRouteSrc.includes("listCoupons") && listRouteSrc.includes("proposeIssueCoupon"),
);
check(
  "routes.execute",
  executeRouteSrc.includes("executeIssueCoupon") &&
    executeRouteSrc.includes('"billing.coupon.issue"'),
);
check("routes.validate", validateRouteSrc.includes("previewCouponDiscount"));
check(
  "routes.status",
  statusRouteSrc.includes("setCouponStatus") && statusRouteSrc.includes("await params"),
);

process.stdout.write(`\nstep-03k offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
