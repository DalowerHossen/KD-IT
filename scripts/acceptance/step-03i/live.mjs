// path: scripts/acceptance/step-03i/live.mjs
// Step 03 substep I live acceptance: verifies the plan catalog (seeded plans,
// canonical decimal-string prices, entitlement arrays), the server-side
// entitlement engine (platform-exempt; a plan-bearing company is granted its
// features and denied the rest; member capacity), and the approval-gated
// company onboarding execution (a directly-inserted approved command
// provisions a company + active owner binding + plan assignment atomically,
// and the command is recorded executed). Requires SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, and KD_DATABASE_URL; skips cleanly when absent.
// All test rows use throwaway identifiers and are cleaned up.

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

const plans = await import("../../../lib/company/plans.ts");
const entitlements = await import("../../../lib/company/entitlements.ts");
const onboarding = await import("../../../lib/company/onboarding.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");

const PLATFORM = tenant.PLATFORM_COMPANY_ID;
const OPERATOR = "22222222-2222-2222-2222-222222222222";
const cleanup = [];

let db;
try {
  db = await connect();

  const ping = await db.query("select 1 as ok");
  check("live.db_reachable", ping.rows[0]?.ok === 1);

  // Plan catalog: seeded plans with canonical decimal-string prices.
  const catalog = await plans.listPlans();
  const starter = catalog.find((p) => p.name === "Starter");
  const professional = catalog.find((p) => p.name === "Professional");
  check(
    "live.plans_seeded",
    catalog.length >= 2 &&
      starter !== undefined &&
      professional !== undefined &&
      catalog.every((p) => typeof p.price === "string" && p.price.length > 0),
  );
  check(
    "live.plan_entitlements",
    starter?.entitlements.includes("team") === true &&
      professional?.entitlements.includes("notifications") === true &&
      starter?.entitlements.includes("notifications") === false,
  );

  // Entitlement engine: the platform company is exempt.
  check("live.platform_exempt", (await entitlements.planForCompany(PLATFORM)) === null);

  // A plan-bearing tenant is granted its features and denied the rest.
  const companyInsert = await db.query(
    `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
       values (app.platform_company_id(), 'H Live Tenant', 'H Live', false, $1::jsonb)
       returning id`,
    [JSON.stringify({ plan_id: starter.id })],
  );
  const testCompanyId = companyInsert.rows[0].id;
  cleanup.push(
    db.query(`delete from app.memberships where company_id = $1`, [testCompanyId]).catch(() => {}),
    db.query(`delete from app.companies where id = $1`, [testCompanyId]).catch(() => {}),
  );
  const testContext = tenant.makeTenantContext({
    companyId: testCompanyId,
    userId: OPERATOR,
    role: "owner",
    correlationId: randomUUID(),
  });
  check("live.plan_lookup", (await entitlements.planForCompany(testCompanyId))?.name === "Starter");
  const testEntitlements = await entitlements.entitlementsForCompany(testCompanyId);
  check(
    "live.entitlements_resolved",
    testEntitlements.includes("team") === true && testEntitlements.includes("backups") === false,
  );
  let teamGranted = true;
  try {
    await entitlements.requireEntitlement(testContext, "team");
  } catch {
    teamGranted = false;
  }
  let backupsDenied = false;
  try {
    await entitlements.requireEntitlement(testContext, "backups");
  } catch {
    backupsDenied = true;
  }
  check("live.entitlement_gate", teamGranted === true && backupsDenied === true);
  check("live.member_capacity", (await entitlements.countActiveMembers(testCompanyId)) === 0);
  await entitlements.assertMemberCapacity(testCompanyId);

  // Onboarding execution: a directly-inserted approved command provisions a
  // company + active owner binding + plan assignment atomically.
  const ownerId = randomUUID();
  await db.query(
    `insert into app.profiles (company_id, user_id, display_name, status)
       values (app.platform_company_id(), $1, 'H Live Owner', 'active')`,
    [ownerId],
  );
  cleanup.push(db.query(`delete from app.profiles where user_id = $1`, [ownerId]).catch(() => {}));

  const payload = JSON.stringify({
    legalName: "H Live Incorporated",
    displayName: "H Live",
    planId: starter.id,
    ownerUserId: ownerId,
  });
  const commandInsert = await db.query(
    `insert into app.command_approvals
       (company_id, kind, payload, payload_hash, status, initiator_id, expires_at)
     values (app.platform_company_id(), 'admin.company.create', $1::jsonb,
             app.sha256_hex($1), 'approved', $2::uuid, clock_timestamp() + interval '1 hour')
     returning id`,
    [payload, OPERATOR],
  );
  const commandId = commandInsert.rows[0].id;
  cleanup.push(
    db.query(`delete from app.command_approvals where id = $1`, [commandId]).catch(() => {}),
  );

  const platformContext = tenant.makeTenantContext({
    companyId: PLATFORM,
    userId: OPERATOR,
    role: "super_admin",
    correlationId: randomUUID(),
  });
  const result = await onboarding.executeCompanyCreation(platformContext, {
    legalName: "H Live Incorporated",
    displayName: "H Live",
    planId: starter.id,
    ownerUserId: ownerId,
    commandId,
  });
  cleanup.push(
    db
      .query(`delete from app.memberships where company_id = $1`, [result.companyId])
      .catch(() => {}),
    db.query(`delete from app.companies where id = $1`, [result.companyId]).catch(() => {}),
  );
  check(
    "live.onboarding_created",
    /^[0-9a-f-]{36}$/.test(result.companyId) && result.membershipId !== "",
  );

  const newCompany = await db.query(
    `select settings->>'plan_id' as plan_id from app.companies where id = $1`,
    [result.companyId],
  );
  check("live.onboarding_plan_assigned", newCompany.rows[0]?.plan_id === starter.id);
  const ownerMembership = await db.query(
    `select role, status from app.memberships where company_id = $1 and user_id = $2`,
    [result.companyId, ownerId],
  );
  check(
    "live.onboarding_owner_binding",
    ownerMembership.rows[0]?.role === "owner" && ownerMembership.rows[0]?.status === "active",
  );
  const commandState = await db.query(`select status from app.command_approvals where id = $1`, [
    commandId,
  ]);
  check("live.onboarding_command_executed", commandState.rows[0]?.status === "executed");
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
