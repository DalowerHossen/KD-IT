// path: scripts/acceptance/step-03m/live.mjs
// Step 03 substep M live acceptance: verifies the custom-domain lifecycle
// against a real database for a throwaway workspace. Requests a domain (starts
// pending with a token), lists it (tenant), sees it in the platform
// verification queue, verifies it with the correct token (activates), then
// rejects a second domain with a wrong token and confirms an already-decided
// domain cannot be re-verified. Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// and KD_DATABASE_URL; skips cleanly when absent. Test rows are cleaned up
// (the throwaway company is left in place because its audit events are
// append-only, matching the other live suites).

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

const domainsModule = await import("../../../lib/company/domains.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");

const OPERATOR = "22222222-2222-2222-2222-222222222222";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const goodDomain = `bill-${suffix}.example.com`;
const badDomain = `reject-${suffix}.example.com`;

let db;
let companyId;
let ownerContext;
let platformContext;
try {
  db = await connect();
  check("live.db_reachable", (await db.query("select 1 as ok")).rows[0]?.ok === 1);

  const table = await db.query(
    `select 1 from pg_tables where schemaname = 'app' and tablename = 'custom_domains'`,
  );
  check("live.table_exists", table.rows.length === 1);

  companyId = (
    await db.query(
      `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
         values (app.platform_company_id(), 'J Domain Co', 'J Domain', false, '{}') returning id`,
    )
  ).rows[0].id;
  ownerContext = tenant.makeTenantContext({
    companyId,
    userId: OPERATOR,
    role: "owner",
    correlationId: randomUUID(),
  });
  platformContext = tenant.makeTenantContext({
    companyId: tenant.PLATFORM_COMPANY_ID,
    userId: OPERATOR,
    role: "super_admin",
    correlationId: randomUUID(),
  });
  db.query(`delete from app.custom_domains where company_id = $1`, [companyId]).catch(() => {});

  const requested = await domainsModule.requestDomain(ownerContext, { domain: goodDomain });
  check(
    "live.request_pending_with_token",
    requested.domain === goodDomain &&
      requested.status === "pending" &&
      /^[a-f0-9]{32}$/.test(requested.verificationToken) &&
      requested.recordName === `_kd-verify.${goodDomain}` &&
      requested.recordType === "TXT",
    JSON.stringify({
      domain: requested.domain,
      status: requested.status,
      recordName: requested.recordName,
    }),
  );

  const tenantList = await domainsModule.listDomains(ownerContext);
  check(
    "live.tenant_list",
    tenantList.some((d) => d.domain === goodDomain),
  );

  const pending = await domainsModule.listPendingDomains(platformContext);
  check(
    "live.platform_sees_pending",
    pending.some((d) => d.domain === goodDomain && d.companyName === "J Domain"),
  );

  const verified = await domainsModule.verifyDomain(platformContext, {
    domainId: requested.id,
    observedToken: requested.verificationToken,
  });
  check(
    "live.verify_token_match",
    verified.status === "verified" &&
      verified.verifiedAt !== null &&
      verified.failureReason === null,
  );

  const reread = await domainsModule.listDomains(ownerContext);
  check(
    "live.tenant_sees_verified",
    reread.some((d) => d.domain === goodDomain && d.status === "verified"),
  );

  const badRequested = await domainsModule.requestDomain(ownerContext, { domain: badDomain });
  const rejected = await domainsModule.verifyDomain(platformContext, {
    domainId: badRequested.id,
    observedToken: "00000000000000000000000000000000",
  });
  check(
    "live.verify_token_mismatch_rejects",
    rejected.status === "rejected" &&
      rejected.failureReason !== null &&
      rejected.verifiedAt === null,
  );

  let alreadyDecidedThrew = false;
  try {
    await domainsModule.verifyDomain(platformContext, {
      domainId: requested.id,
      observedToken: requested.verificationToken,
    });
  } catch {
    alreadyDecidedThrew = true;
  }
  check("live.already_decided_rejected", alreadyDecidedThrew);
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  if (companyId) {
    await db
      .query(`delete from app.custom_domains where company_id = $1`, [companyId])
      .catch(() => {});
  }
  if (db) {
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
