// path: scripts/acceptance/step-03n/live.mjs
// Step 03 substep N live acceptance: verifies the encrypted backup lifecycle
// against a real database for throwaway Professional and Starter workspaces.
// Requests a backup (entitlement-gated), fulfils it (the stored artifact must
// be ciphertext, not plaintext), downloads it (the decrypt round-trip returns
// the workspace snapshot), rejects a re-fulfil, and exercises expiry. Requires
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KD_DATABASE_URL, and the Step 02
// encryption key (KD_ENCRYPTION_MASTER_KEY / KD_ENCRYPTION_KEY_VERSION); skips
// cleanly when any are absent. Test rows are cleaned up.

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

const missing = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "KD_DATABASE_URL",
  "KD_ENCRYPTION_MASTER_KEY",
  "KD_ENCRYPTION_KEY_VERSION",
].filter((key) => process.env[key] === undefined || process.env[key].trim() === "");
if (missing.length > 0) {
  process.stdout.write(`SKIP live acceptance: ${missing.join(", ")} is not set\n`);
  process.exit(0);
}

const runnerPath = pathToFileURL(path.join(ROOT, "scripts/db/lib/runner.mjs")).href;
const { connect } = await import(runnerPath);

const backups = await import("../../../lib/company/backups.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");

const OPERATOR = "22222222-2222-2222-2222-222222222222";
let db;
let profCompanyId;
let starterCompanyId;

try {
  db = await connect();
  check("live.db_reachable", (await db.query("select 1 as ok")).rows[0]?.ok === 1);

  const table = await db.query(
    `select 1 from pg_tables where schemaname = 'app' and tablename = 'backup_requests'`,
  );
  check("live.table_exists", table.rows.length === 1);

  const plans = (
    await db.query(`select id, name from app.plans where name in ('Professional', 'Starter')`)
  ).rows;
  const professional = plans.find((p) => p.name === "Professional");
  const starter = plans.find((p) => p.name === "Starter");
  check("live.plans_present", professional !== undefined && starter !== undefined);

  const makeCompany = async (legal, display, planId) =>
    (
      await db.query(
        `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
           values (app.platform_company_id(), $1, $2, false, $3::jsonb) returning id`,
        [legal, display, JSON.stringify({ plan_id: planId })],
      )
    ).rows[0].id;

  profCompanyId = await makeCompany("J Backup Pro", "J Backup Pro", professional.id);
  starterCompanyId = await makeCompany("J Backup Starter", "J Backup Starter", starter.id);

  const profContext = tenant.makeTenantContext({
    companyId: profCompanyId,
    userId: OPERATOR,
    role: "owner",
    correlationId: randomUUID(),
  });
  const starterContext = tenant.makeTenantContext({
    companyId: starterCompanyId,
    userId: OPERATOR,
    role: "owner",
    correlationId: randomUUID(),
  });
  const platformContext = tenant.makeTenantContext({
    companyId: tenant.PLATFORM_COMPANY_ID,
    userId: OPERATOR,
    role: "super_admin",
    correlationId: randomUUID(),
  });

  const requested = await backups.requestBackup(profContext);
  check("live.request_pending", requested.status === "pending" && requested.id.length > 0);

  let inProgressThrew = false;
  try {
    await backups.requestBackup(profContext);
  } catch {
    inProgressThrew = true;
  }
  check("live.one_active_at_a_time", inProgressThrew);

  const listed = await backups.listBackups(profContext);
  check(
    "live.list_includes",
    listed.some((b) => b.id === requested.id),
  );

  let entitlementThrew = false;
  try {
    await backups.requestBackup(starterContext);
  } catch {
    entitlementThrew = true;
  }
  check("live.starter_entitlement_blocked", entitlementThrew);

  const fulfilled = await backups.fulfilBackupRequest(platformContext, requested.id);
  check(
    "live.fulfil_ready",
    fulfilled.status === "ready" &&
      /^[a-f0-9]{64}$/.test(fulfilled.artifactSha256 ?? "") &&
      (fulfilled.artifactSizeBytes ?? 0) > 0 &&
      fulfilled.expiresAt !== null,
    JSON.stringify({ status: fulfilled.status, size: fulfilled.artifactSizeBytes }),
  );

  let notPendingThrew = false;
  try {
    await backups.fulfilBackupRequest(platformContext, requested.id);
  } catch {
    notPendingThrew = true;
  }
  check("live.refulfil_rejected", notPendingThrew);

  const raw = (
    await db.query(`select artifact from app.backup_requests where id = $1`, [requested.id])
  ).rows[0];
  const marker = Buffer.from("kd-tenant-backup", "utf8");
  check(
    "live.artifact_is_ciphertext",
    Buffer.isBuffer(raw.artifact) && raw.artifact.includes(marker) === false,
  );

  const download = await backups.downloadBackup(profContext, requested.id);
  const manifest = download.snapshot?.manifest ?? {};
  check(
    "live.download_roundtrip",
    manifest.kind === "kd-tenant-backup" &&
      manifest.companyId === profCompanyId &&
      Array.isArray(download.snapshot.companies) &&
      download.snapshot.companies.length >= 1 &&
      download.artifactSha256 === fulfilled.artifactSha256,
    JSON.stringify({ kind: manifest.kind, companies: download.snapshot.companies?.length }),
  );

  await db.query(
    `update app.backup_requests set expires_at = clock_timestamp() - interval '1 hour' where id = $1`,
    [requested.id],
  );
  let expiredThrew = false;
  try {
    await backups.downloadBackup(profContext, requested.id);
  } catch {
    expiredThrew = true;
  }
  check("live.expired_download_rejected", expiredThrew);

  const expiredCount = await backups.expireBackups(platformContext);
  const after = (
    await db.query(`select status, artifact from app.backup_requests where id = $1`, [requested.id])
  ).rows[0];
  check(
    "live.expire_marks_and_clears",
    expiredCount >= 1 && after.status === "expired" && after.artifact === null,
    JSON.stringify({ expiredCount, status: after.status, artifact: after.artifact }),
  );
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  if (profCompanyId || starterCompanyId) {
    for (const id of [profCompanyId, starterCompanyId]) {
      if (id) {
        await db
          .query(`delete from app.backup_requests where company_id = $1`, [id])
          .catch(() => {});
        await db.query(`delete from app.companies where id = $1`, [id]).catch(() => {});
      }
    }
  }
  if (db) {
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
