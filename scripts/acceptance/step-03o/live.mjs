// path: scripts/acceptance/step-03o/live.mjs
// Step 03 substep O live acceptance: verifies the KYC lifecycle against a real
// database for a throwaway workspace. Submits an application (encrypted
// details + Step 02 "kyc" documents), verifies the stored details are
// ciphertext, reads it back (decrypt round-trip), works it through the review
// queue -> review -> approval-gated decision (command chain), checks feature
// gating, sanctions screening, and expiry. Requires SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, KD_DATABASE_URL, and the Step 02 encryption key
// (KD_ENCRYPTION_MASTER_KEY / KD_ENCRYPTION_KEY_VERSION); skips cleanly when
// any are absent. Test rows are cleaned up.

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

const kyc = await import("../../../lib/company/kyc.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");
const commands = await import("../../../lib/db/repositories/commands.ts");

const OWNER = "55555555-5555-5555-5555-555555550001";
const SUPER_ADMIN = "44444444-4444-4444-4444-444444440001";
const SUPER_ADMIN_2 = "44444444-4444-4444-4444-444444440002";
const REGISTRATION_NUMBER = "RegNum-TEST-9f3a-xyz";
const MARKER = Buffer.from("RegNum-TEST-9f3a", "utf8");

let db;
let companyId;
let frontFileId;
let backFileId;
let nonKycFileId;
let applicationId;

try {
  db = await connect();
  check("live.db_reachable", (await db.query("select 1 as ok")).rows[0]?.ok === 1);

  const table = await db.query(
    `select 1 from pg_tables where schemaname = 'app' and tablename = 'kyc_applications'`,
  );
  check("live.table_exists", table.rows.length === 1);

  companyId = (
    await db.query(
      `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
         values (app.platform_company_id(), 'KYC Test Co', 'KYC Test Co', false, '{}'::jsonb) returning id`,
    )
  ).rows[0].id;

  const makeFileRecord = (name, mime, extension, category) =>
    db
      .query(
        `insert into app.file_records (
           id, company_id, category, storage_provider, provider_object_id,
           original_name, sanitized_name, mime_type, extension, byte_size,
           encryption_ciphertext_sha256, plaintext_hmac, encryption_nonce_b64,
           encryption_tag_b64, encryption_key_version, upload_state, uploaded_by, uploaded_at
         )
         values (
           app.uuid_v7(), $1, $5, 'supabase_storage', 'test-' || app.uuid_v7()::text,
           $2, $2, $3, $4, 1024, repeat('a', 64), repeat('b', 64),
           'bm9uY2U=', 'dGFn=', 1, 'clean', $6, clock_timestamp()
         ) returning id`,
        [companyId, name, mime, extension, category, OWNER],
      )
      .then((res) => res.rows[0].id);

  frontFileId = await makeFileRecord("id_front.jpg", "image/jpeg", ".jpg", "kyc");
  backFileId = await makeFileRecord("id_back.jpg", "image/jpeg", ".jpg", "kyc");
  nonKycFileId = await makeFileRecord("logo.png", "image/png", ".png", "branding");

  const ownerContext = tenant.makeTenantContext({
    companyId,
    userId: OWNER,
    role: "owner",
    correlationId: randomUUID(),
  });
  const superAdminContext = tenant.makeTenantContext({
    companyId: tenant.PLATFORM_COMPANY_ID,
    userId: SUPER_ADMIN,
    role: "super_admin",
    correlationId: randomUUID(),
  });
  const superAdmin2Context = tenant.makeTenantContext({
    companyId: tenant.PLATFORM_COMPANY_ID,
    userId: SUPER_ADMIN_2,
    role: "super_admin",
    correlationId: randomUUID(),
  });

  const submitInput = {
    businessType: "llc",
    riskLevel: "medium",
    documents: { id_front: frontFileId, id_back: backFileId },
    details: {
      registrationNumber: REGISTRATION_NUMBER,
      registeredAddress: "123 Verification Road, Test City",
      directors: [{ name: "Dana Test", role: "Director" }],
    },
  };

  const submitted = await kyc.submitKycApplication(ownerContext, submitInput);
  applicationId = submitted.id;
  check("live.submit_pending", submitted.status === "pending" && submitted.id.length > 0);

  const rawDetails = (
    await db.query(`select details from app.kyc_applications where id = $1`, [applicationId])
  ).rows[0].details;
  check(
    "live.details_are_ciphertext",
    Buffer.isBuffer(rawDetails) && rawDetails.includes(MARKER) === false,
  );

  const readBack = await kyc.getKycApplication(ownerContext);
  check(
    "live.read_decrypt_roundtrip",
    readBack !== null &&
      readBack.details.registrationNumber === REGISTRATION_NUMBER &&
      readBack.details.directors?.[0]?.name === "Dana Test" &&
      readBack.documents.id_front === frontFileId &&
      readBack.documents.id_back === backFileId,
    JSON.stringify(readBack?.details?.registrationNumber),
  );

  const queue = await kyc.listPendingKycApplications(superAdminContext);
  check(
    "live.review_queue",
    queue.length === 1 &&
      queue[0].id === applicationId &&
      queue[0].companyName === "KYC Test Co" &&
      queue[0].status === "pending",
    JSON.stringify(queue.map((q) => q.status)),
  );

  const reviewView = await kyc.getKycApplicationForReview(superAdminContext, applicationId);
  check(
    "live.review_view",
    reviewView.details.registrationNumber === REGISTRATION_NUMBER &&
      reviewView.companyName === "KYC Test Co" &&
      reviewView.documentFiles.length === 2 &&
      reviewView.documentFiles.every((f) => f.uploadState === "clean"),
    JSON.stringify(reviewView.documentFiles.map((f) => f.kind)),
  );

  const inReview = await kyc.startKycReview(superAdminContext, applicationId, {
    note: "Documents legible.",
  });
  check(
    "live.start_review",
    inReview.status === "under_review" && inReview.reviewNote === "Documents legible.",
  );

  let inReviewThrew = false;
  try {
    await kyc.submitKycApplication(ownerContext, submitInput);
  } catch {
    inReviewThrew = true;
  }
  check("live.resubmit_blocked_in_review", inReviewThrew);

  const { commandId } = await kyc.proposeKycDecision(superAdminContext, applicationId, {
    decision: "approved",
  });
  check("live.propose_decision", commandId.length > 0);

  await commands.finalConfirmCommand(superAdmin2Context, commandId);
  const approved = await kyc.executeKycDecision(superAdminContext, commandId);
  check(
    "live.decide_approved",
    approved.status === "approved" &&
      approved.validUntil !== null &&
      approved.decidedAt !== null &&
      approved.decisionCommandId === commandId,
    JSON.stringify({ status: approved.status, validUntil: approved.validUntil }),
  );

  const statusAfter = await kyc.getKycStatus(ownerContext);
  check(
    "live.feature_gating_verified",
    statusAfter.status === "approved" &&
      statusAfter.verified === true &&
      statusAfter.validUntil !== null,
    JSON.stringify(statusAfter),
  );

  let verifiedThrew = false;
  try {
    await kyc.submitKycApplication(ownerContext, submitInput);
  } catch {
    verifiedThrew = true;
  }
  check("live.resubmit_blocked_verified", verifiedThrew);

  const screened = await kyc.setKycSanctionsStatus(superAdminContext, applicationId, "cleared");
  check("live.sanctions_hook", screened.sanctionsStatus === "cleared");

  const previewGuard = await db.query(`select category from app.file_records where id = $1`, [
    nonKycFileId,
  ]);
  let nonKycThrew = false;
  try {
    await kyc.downloadKycDocument(superAdminContext, nonKycFileId);
  } catch {
    nonKycThrew = true;
  }
  check(
    "live.doc_preview_category_guard",
    nonKycThrew && previewGuard.rows[0]?.category === "branding",
  );

  await db.query(
    `update app.kyc_applications set valid_until = clock_timestamp() - interval '1 day' where id = $1`,
    [applicationId],
  );
  const expiredCount = await kyc.expireKycApplications(superAdminContext);
  const afterExpire = (
    await db.query(`select status from app.kyc_applications where id = $1`, [applicationId])
  ).rows[0];
  const statusAfterExpire = await kyc.getKycStatus(ownerContext);
  check(
    "live.expire",
    expiredCount >= 1 && afterExpire.status === "expired" && statusAfterExpire.verified === false,
    JSON.stringify({ expiredCount, status: afterExpire.status }),
  );
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  if (companyId) {
    for (const id of [frontFileId, backFileId, nonKycFileId]) {
      if (id) {
        await db.query(`delete from app.file_records where id = $1`, [id]).catch(() => {});
      }
    }
    await db
      .query(`delete from app.kyc_applications where company_id = $1`, [companyId])
      .catch(() => {});
    await db
      .query(`delete from app.notifications where company_id = $1`, [companyId])
      .catch(() => {});
    await db
      .query(`delete from app.audit_events where company_id = $1`, [companyId])
      .catch(() => {});
    await db.query(`delete from app.companies where id = $1`, [companyId]).catch(() => {});
  }
  if (db) {
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
