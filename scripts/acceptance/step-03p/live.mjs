// path: scripts/acceptance/step-03p/live.mjs
// Step 03 substep P live acceptance: exercises the settings UI's backing
// surfaces against a real database for a throwaway workspace. Uploads a real
// file through the tenant upload pipeline (the new /api/company/files route's
// service) with category "kyc", asserts the stored record, and smoke-tests the
// read surfaces the settings pages consume (profile, invoice settings, domains,
// backups, kyc, notifications). Requires SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, KD_DATABASE_URL, and the Step 02 encryption key
// (KD_ENCRYPTION_MASTER_KEY / KD_ENCRYPTION_KEY_VERSION); skips cleanly when any
// are absent. Test rows are cleaned up.

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

const fileService = await import("../../../lib/storage/file-service.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");
const profile = await import("../../../lib/company/profile.ts");
const invoiceSettings = await import("../../../lib/company/invoice-settings.ts");
const domains = await import("../../../lib/company/domains.ts");
const backups = await import("../../../lib/company/backups.ts");
const kyc = await import("../../../lib/company/kyc.ts");
const notifications = await import("../../../lib/notifications/repository.ts");

const OWNER = "55555555-5555-5555-5555-555555550001";
// A valid 1x1 transparent PNG (passes the tenant upload content validation).
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const pngBytes = Buffer.from(PNG_BASE64, "base64");

let db;
let companyId;
let uploadedFileId;

try {
  db = await connect();
  check("live.db_reachable", (await db.query("select 1 as ok")).rows[0]?.ok === 1);

  companyId = (
    await db.query(
      `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
         values (app.platform_company_id(), 'Settings UI Test Co', 'Settings UI Test Co', false, '{}'::jsonb) returning id`,
    )
  ).rows[0].id;

  const ownerContext = tenant.makeTenantContext({
    companyId,
    userId: OWNER,
    role: "owner",
    correlationId: randomUUID(),
  });

  // New tenant upload: the /api/company/files route's service call.
  const uploaded = await fileService.uploadEncryptedFile(ownerContext, {
    originalFilename: "kyc-id-front.png",
    declaredMime: "image/png",
    category: "kyc",
    bytes: pngBytes,
  });
  uploadedFileId = uploaded.id;
  check("live.upload_summary", uploaded.id.length > 0 && uploaded.byteLength === pngBytes.length);
  check(
    "live.upload_provider",
    typeof uploaded.storageProvider === "string" && uploaded.storageProvider.length > 0,
  );

  const record = (
    await db.query(
      `select category, upload_state, byte_size, original_name from app.file_records where id = $1`,
      [uploadedFileId],
    )
  ).rows[0];
  check(
    "live.upload_record",
    record !== undefined &&
      record.category === "kyc" &&
      record.upload_state === "clean" &&
      record.byte_size === pngBytes.length,
  );

  // Settings-read smoke: the read surfaces the settings pages consume.
  const companyProfile = await profile.getCompanyProfile(ownerContext);
  check(
    "live.profile",
    companyProfile.displayName === "Settings UI Test Co" &&
      companyProfile.legalName === "Settings UI Test Co" &&
      typeof companyProfile.timezone === "string" &&
      typeof companyProfile.locale === "string",
  );

  const invoice = await invoiceSettings.getInvoiceSettings(ownerContext);
  check(
    "live.invoice",
    typeof invoice.taxRate === "string" &&
      /^\d+(\.\d+)?$/.test(invoice.taxRate) &&
      Number.isInteger(invoice.defaultDueDays),
  );

  const domainList = await domains.listDomains(ownerContext);
  check("live.domains", Array.isArray(domainList));

  const backupList = await backups.listBackups(ownerContext);
  check("live.backups", Array.isArray(backupList));

  const kycView = await kyc.getKycApplication(ownerContext);
  check("live.kyc_null", kycView === null);

  const inbox = await notifications.listNotifications(ownerContext);
  check("live.notifications", Array.isArray(inbox));
} finally {
  if (uploadedFileId) {
    await db.query(`delete from app.file_records where id = $1`, [uploadedFileId]).catch(() => {});
  }
  if (companyId) {
    await db
      .query(`delete from app.audit_events where company_id = $1`, [companyId])
      .catch(() => {});
    await db
      .query(`delete from app.notifications where company_id = $1`, [companyId])
      .catch(() => {});
    await db.query(`delete from app.companies where id = $1`, [companyId]).catch(() => {});
  }
  if (db) {
    await db.end().catch(() => {});
  }
}

process.stdout.write(
  `\nstep-03p live: ${failures === 0 ? "all checks passed" : `${failures} failed`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
