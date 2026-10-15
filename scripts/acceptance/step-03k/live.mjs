// path: scripts/acceptance/step-03k/live.mjs
// Step 03 substep K live acceptance: verifies the coupon catalog data plane
// against a real database. Creates a percent coupon (max_uses = 1) and a fixed
// coupon, exercises the exact discount math (preview), the atomic redemption
// (and that the usage limit is enforced on the second redemption), and the
// status gate (a deactivated coupon is no longer eligible). Requires
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and KD_DATABASE_URL; skips cleanly
// when absent. Test rows use throwaway codes and are cleaned up.

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(".");

let failures = 0;
function check(id, outcome, detail) {
  process.stdout.write(
    `${outcome ? "PASS" : "FAIL"} ${id}${detail === undefined ? "" : `: ${detail}`}\n`,
  );
  if (!outcome) {
    failures += 1;
  }
}

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "KD_DATABASE_URL"].filter(
  (key) => process.env[key] === undefined || process.env[key].trim() === "",
);
if (missing.length > 0) {
  process.stdout.write(`SKIP live acceptance: ${missing.join(", ")} is not set\n`);
  process.exit(0);
}

const runnerPath = pathToFileURL(path.join(ROOT, "scripts/db/lib/runner.mjs")).href;
const { connect } = await import(runnerPath);

const coupons = await import("../../../lib/billing/coupons.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");

const OPERATOR = "22222222-2222-2222-2222-222222222222";
const stamp = Date.now();
const percentCode = `KPERC${stamp}`;
const fixedCode = `KFIX${stamp}`;
const platformContext = tenant.makeTenantContext({
  companyId: tenant.PLATFORM_COMPANY_ID,
  userId: OPERATOR,
  role: "super_admin",
  correlationId: randomUUID(),
});
let fixedRow;
const cleanup = [];

let db;
try {
  db = await connect();
  check("live.db_reachable", (await db.query("select 1 as ok")).rows[0]?.ok === 1);

  const table = await db.query(
    `select 1 from pg_tables where schemaname = 'app' and tablename = 'coupons'`,
  );
  check("live.table_exists", table.rows.length === 1);

  await coupons.createCoupon(platformContext, {
    code: percentCode,
    type: "percent",
    value: "10.0000",
    maxUses: 1,
  });
  fixedRow = await coupons.createCoupon(platformContext, {
    code: fixedCode,
    type: "fixed",
    value: "5.0000",
  });
  cleanup.push(
    db
      .query(`delete from app.coupons where code in ($1, $2)`, [percentCode, fixedCode])
      .catch(() => {}),
  );

  const all = await coupons.listCoupons(platformContext);
  check(
    "live.list_includes_new",
    all.some((c) => c.code === percentCode) && all.some((c) => c.code === fixedCode),
  );

  const percentPreview = await coupons.previewCouponDiscount(platformContext, {
    code: percentCode,
    orderAmount: "100.0000",
  });
  check(
    "live.percent_preview",
    percentPreview.discount === "10.0000" && percentPreview.finalAmount === "90.0000",
    JSON.stringify(percentPreview),
  );

  const redemption = await coupons.redeemCoupon(platformContext, {
    code: percentCode,
    orderAmount: "100.0000",
  });
  check(
    "live.redeem_percent",
    redemption.discount === "10.0000" &&
      redemption.finalAmount === "90.0000" &&
      redemption.usesRemaining === 0,
    JSON.stringify(redemption),
  );

  let limitThrew = false;
  try {
    await coupons.redeemCoupon(platformContext, { code: percentCode, orderAmount: "100.0000" });
  } catch {
    limitThrew = true;
  }
  check("live.limit_enforced", limitThrew);

  const fixedPreview = await coupons.previewCouponDiscount(platformContext, {
    code: fixedCode,
    orderAmount: "50.0000",
  });
  check(
    "live.fixed_preview",
    fixedPreview.discount === "5.0000" && fixedPreview.finalAmount === "45.0000",
    JSON.stringify(fixedPreview),
  );

  const deactivated = await coupons.setCouponStatus(platformContext, fixedRow.id, "inactive");
  check("live.deactivate", deactivated.status === "inactive");

  let inactiveThrew = false;
  try {
    await coupons.previewCouponDiscount(platformContext, {
      code: fixedCode,
      orderAmount: "50.0000",
    });
  } catch {
    inactiveThrew = true;
  }
  check("live.inactive_rejected", inactiveThrew);
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const task of cleanup) {
    await task;
  }
  if (db) {
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
