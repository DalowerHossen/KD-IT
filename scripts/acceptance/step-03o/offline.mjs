// path: scripts/acceptance/step-03o/offline.mjs
// Step 03 substep O offline acceptance: KYC upload and review.
// Verifies the kyc_applications table + notification-type extension (migration
// 020), the pre-registered kyc.* permissions and command kinds, the service
// surface (submit, read, review queue, review, resubmission, document preview,
// approval-gated decision, expiry, reminders, sanctions hook, feature gating),
// the Step 02 envelope + storage reuse, the shared envelope wire-format, the
// submit abuse guard, the schemas, and the routes. Runs without a database;
// the live submit -> review -> decide (encrypt/decrypt round-trip) -> expiry
// flow is exercised by live.mjs when the database + encryption exist.

import { readFileSync } from "node:fs";

const checks = [];
let failures = 0;

function check(id, outcome, detail) {
  checks.push({ id, outcome });
  if (outcome !== true) {
    failures += 1;
  }
  process.stdout.write(
    `${outcome === true ? "PASS" : "FAIL"} ${id}${detail === undefined ? "" : `: ${detail}`}\n`,
  );
}

process.env.NODE_ENV = "test";

const kyc = await import("../../../lib/company/kyc.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig020 = read("../../../supabase/migrations/020_kyc_applications.up.sql");
const mig020down = read("../../../supabase/migrations/020_kyc_applications.down.sql");
const permissionsSrc = read("../../../lib/auth/permissions.ts");
const commandTypesSrc = read("../../../lib/commands/types.ts");
const kycModuleSrc = read("../../../lib/company/kyc.ts");
const backupsModuleSrc = read("../../../lib/company/backups.ts");
const envelopeFormatSrc = read("../../../lib/crypto/envelope-format.ts");
const schemasSrc = read("../../../lib/auth/schemas.ts");
const submitRouteSrc = read("../../../app/api/company/kyc/route.ts");
const queueRouteSrc = read("../../../app/api/platform/kyc/route.ts");
const reviewRouteSrc = read("../../../app/api/platform/kyc/[applicationId]/route.ts");
const startReviewRouteSrc = read("../../../app/api/platform/kyc/[applicationId]/review/route.ts");
const resubmissionRouteSrc = read(
  "../../../app/api/platform/kyc/[applicationId]/resubmission/route.ts",
);
const decisionRouteSrc = read("../../../app/api/platform/kyc/[applicationId]/decision/route.ts");
const executeRouteSrc = read("../../../app/api/platform/kyc/decision/execute/route.ts");
const docRouteSrc = read(
  "../../../app/api/platform/kyc/[applicationId]/documents/[fileId]/route.ts",
);

// ---------------------------------------------------------------------------
// Storage: migration 020 KYC applications + notification vocabulary.
// ---------------------------------------------------------------------------
check(
  "migration020.table",
  mig020.includes("create table app.kyc_applications (") &&
    mig020.includes(
      "status text not null default 'pending' check (status in ('pending', 'under_review', 'approved', 'rejected', 'expired'))",
    ) &&
    mig020.includes("details bytea not null") &&
    mig020.includes("details_sha256 text not null check (char_length(details_sha256) = 64)") &&
    mig020.includes("documents jsonb not null default '{}'::jsonb") &&
    mig020.includes(
      "risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high'))",
    ),
);
check(
  "migration020.contract_and_scope",
  mig020.includes("id uuid primary key default app.uuid_v7()") &&
    mig020.includes("company_id uuid not null references app.companies (id) on delete restrict") &&
    mig020.includes("version integer not null default 1") &&
    mig020.includes("submitted_by uuid not null") &&
    mig020.includes("valid_until timestamptz null") &&
    mig020.includes(
      "sanctions_status text not null default 'unscreened' check (sanctions_status in ('unscreened', 'cleared', 'flagged'))",
    ),
);
check(
  "migration020.rls_grants_triggers",
  mig020.includes("enable row level security") &&
    mig020.includes("force row level security") &&
    mig020.includes(
      "grant select, insert, update, delete on app.kyc_applications to service_role",
    ) &&
    mig020.includes("execute function app.touch_updated_at()") &&
    mig020.includes("execute function app.guard_optimistic_version()"),
);
check(
  "migration020.notification_types",
  mig020.includes("'kyc.approved'") &&
    mig020.includes("'kyc.rejected'") &&
    mig020.includes("'kyc.submission_requested'") &&
    mig020.includes("'kyc.expiring'") &&
    mig020.includes("'kyc.expired'"),
);
check("migration020.rollback", mig020down.includes("drop table if exists app.kyc_applications"));

// ---------------------------------------------------------------------------
// Reuse: pre-registered permissions + command kinds.
// ---------------------------------------------------------------------------
check(
  "kyc.permissions_registered",
  permissionsSrc.includes('"kyc.own.submit"') &&
    permissionsSrc.includes('"kyc.own.read"') &&
    permissionsSrc.includes('"kyc.review"') &&
    permissionsSrc.includes('"kyc.admin.read"') &&
    permissionsSrc.includes('"kyc.decide"'),
);
check(
  "kyc.command_kinds_registered",
  commandTypesSrc.includes('"kyc.application.submit"') &&
    commandTypesSrc.includes('"kyc.review.submit"') &&
    commandTypesSrc.includes('"kyc.decision.finalize"'),
);

// ---------------------------------------------------------------------------
// Module surface.
// ---------------------------------------------------------------------------
check(
  "module.functions",
  typeof kyc.submitKycApplication === "function" &&
    typeof kyc.getKycApplication === "function" &&
    typeof kyc.listPendingKycApplications === "function" &&
    typeof kyc.getKycApplicationForReview === "function" &&
    typeof kyc.startKycReview === "function" &&
    typeof kyc.requestKycResubmission === "function" &&
    typeof kyc.downloadKycDocument === "function" &&
    typeof kyc.proposeKycDecision === "function" &&
    typeof kyc.executeKycDecision === "function" &&
    typeof kyc.expireKycApplications === "function" &&
    typeof kyc.remindExpiringKycApplications === "function" &&
    typeof kyc.setKycSanctionsStatus === "function" &&
    typeof kyc.getKycStatus === "function",
);
check(
  "module.scoping",
  kycModuleSrc.includes("requireTenantContext(context)") &&
    kycModuleSrc.includes("requirePlatformContext(context)") &&
    kycModuleSrc.includes('requirePermission(context, "kyc.own.submit")') &&
    kycModuleSrc.includes('requirePermission(context, "kyc.own.read")') &&
    kycModuleSrc.includes('requirePermission(context, "kyc.review")') &&
    kycModuleSrc.includes('requirePermission(context, "kyc.admin.read")') &&
    kycModuleSrc.includes('requirePermission(context, "kyc.decide")'),
);
check(
  "module.command_engine",
  kycModuleSrc.includes("proposeAndAudit(") &&
    kycModuleSrc.includes("assertApprovedCommandFor(") &&
    kycModuleSrc.includes("executeCommand(") &&
    kycModuleSrc.includes('DECISION_KIND = "kyc.decision.finalize"'),
);
check(
  "module.crypto_and_storage",
  kycModuleSrc.includes("encryptData(") &&
    kycModuleSrc.includes("decryptData(") &&
    kycModuleSrc.includes("sha256Hex(") &&
    kycModuleSrc.includes("getEncryptionKeyVersion()") &&
    kycModuleSrc.includes('category: "kyc"') &&
    kycModuleSrc.includes("serializeEnvelope(") &&
    kycModuleSrc.includes("deserializeEnvelope(") &&
    kycModuleSrc.includes("getFileRecord(") &&
    kycModuleSrc.includes("downloadDecryptedFile("),
);
check("module.feature_gating", kycModuleSrc.includes("export async function getKycStatus("));

// ---------------------------------------------------------------------------
// Shared envelope wire format (DRY with backups).
// ---------------------------------------------------------------------------
check(
  "envelope_format.shared",
  envelopeFormatSrc.includes("export function serializeEnvelope(") &&
    envelopeFormatSrc.includes("export function deserializeEnvelope(") &&
    envelopeFormatSrc.includes("writeUInt32BE"),
);
check(
  "backups.use_shared_format",
  backupsModuleSrc.includes('from "@/lib/crypto/envelope-format"') &&
    !backupsModuleSrc.includes("function serializeEnvelope("),
);

// ---------------------------------------------------------------------------
// Submit abuse guard (rate limit + network risk).
// ---------------------------------------------------------------------------
check(
  "submit.abuse_guard",
  submitRouteSrc.includes("enforceAbuseProtection(") &&
    submitRouteSrc.includes('ipScopes: ["kycSubmitPerIp"]') &&
    submitRouteSrc.includes('accountScopes: ["kycSubmitPerAccount"]'),
);

// ---------------------------------------------------------------------------
// Schemas.
// ---------------------------------------------------------------------------
check(
  "schemas.kyc",
  schemasSrc.includes("kycSubmitInputSchema") &&
    schemasSrc.includes("kycDocumentsSchema") &&
    schemasSrc.includes("kycDetailsSchema") &&
    schemasSrc.includes("kycDecisionInputSchema") &&
    schemasSrc.includes("kycDecisionPayloadSchema") &&
    schemasSrc.includes("kycExecuteDecisionSchema") &&
    schemasSrc.includes("id_front: uuidV7Schema") &&
    schemasSrc.includes("id_back: uuidV7Schema"),
);

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------
check(
  "routes.tenant",
  submitRouteSrc.includes("getKycApplication") && submitRouteSrc.includes("submitKycApplication"),
);
check("routes.platform_queue", queueRouteSrc.includes("listPendingKycApplications"));
check("routes.platform_get", reviewRouteSrc.includes("getKycApplicationForReview"));
check("routes.start_review", startReviewRouteSrc.includes("startKycReview"));
check("routes.resubmission", resubmissionRouteSrc.includes("requestKycResubmission"));
check("routes.decide", decisionRouteSrc.includes("proposeKycDecision"));
check("routes.execute_decision", executeRouteSrc.includes("executeKycDecision"));
check("routes.doc_preview", docRouteSrc.includes("downloadKycDocument"));

process.stdout.write(`\nstep-03o offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
