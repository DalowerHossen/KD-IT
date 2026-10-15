// path: scripts/acceptance/step-03g/live.mjs
// Step 03 substep G live acceptance: verifies the database is reachable, the
// atomic rate-limit writer exists and enforces a budget (allow until the limit
// is exhausted, then deny with retry-after), and that the network-risk policy
// has no stored override by default (so the passive, observe-only policy
// applies). Uses a throwaway bucket key. Requires SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, and KD_DATABASE_URL; skips cleanly when absent.

import { createHash } from "node:crypto";
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

let db;
try {
  db = await connect();

  const ping = await db.query("select 1 as ok");
  check("live.db_reachable", ping.rows[0]?.ok === 1);

  const fn = await db.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and proname = 'rate_limit_hit'`,
  );
  check("live.rate_limit_function_exists", fn.rows.length === 1);

  const suffix = createHash("sha256").update(`step03g-${Date.now()}`).digest("hex").slice(0, 12);
  const bucketKey = `rl:acceptance:signupPerIp:ip-${suffix}`;

  // First hit on a fresh budget is allowed.
  const first = await db.query(
    `select app.rate_limit_hit(app.platform_company_id(), $1, 3, 300) as outcome`,
    [bucketKey],
  );
  const o1 = first.rows[0]?.outcome;
  check("live.rate_limit_allows_first", o1?.allowed === true && o1?.current === 1);

  // Exhaust the budget: the fourth hit is denied with a retry-after hint.
  let denied = null;
  for (let i = 0; i < 3; i += 1) {
    const hit = await db.query(
      `select app.rate_limit_hit(app.platform_company_id(), $1, 3, 300) as outcome`,
      [bucketKey],
    );
    const o = hit.rows[0]?.outcome;
    if (o?.allowed === false) {
      denied = o;
    }
  }
  check("live.rate_limit_denies_at_budget", denied !== null && denied.retry_after_seconds >= 0);

  // The network-risk policy has no stored override by default.
  const cfg = await db.query(
    `select 1 from app.app_configuration
     where company_id = app.platform_company_id()
       and key = 'security.network_risk_policy'`,
  );
  check("live.risk_policy_default_absent", cfg.rows.length === 0);

  process.stdout.write(`\nstep-03g live: complete\n`);
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  if (db) {
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
