// path: scripts/acceptance/step-03n/offline.mjs
// Step 03 substep N offline acceptance: encrypted backup requests.
// Verifies the backup_requests table (migration 019), the pre-registered
// backup.request/backup.read permissions and the "backups" entitlement (on the
// Professional plan), the repository/service surface (request, list, download,
// worker fulfil/expire), the Step 02 envelope crypto + SHA-256 usage, and the
// routes. Runs without a database; the live request -> fulfil (encrypt) ->
// download (decrypt round-trip) -> expiry round-trip is exercised by live.mjs
// when the database and encryption credentials exist.

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

const backups = await import("../../../lib/company/backups.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig019 = read("../../../supabase/migrations/019_backup_requests.up.sql");
const mig019down = read("../../../supabase/migrations/019_backup_requests.down.sql");
const mig014 = read("../../../supabase/migrations/014_plans_entitlements.up.sql");
const routeSrc = read("../../../app/api/company/backups/route.ts");
const downloadRouteSrc = read("../../../app/api/company/backups/[requestId]/download/route.ts");
const permissionsSrc = read("../../../lib/auth/permissions.ts");
const backupsModuleSrc = read("../../../lib/company/backups.ts");

// ---------------------------------------------------------------------------
// Storage: migration 019 backup requests.
// ---------------------------------------------------------------------------
check(
  "migration019.table",
  mig019.includes("create table app.backup_requests (") &&
    mig019.includes(
      "status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'expired'))",
    ) &&
    mig019.includes("artifact bytea null") &&
    mig019.includes("artifact_sha256 text null") &&
    mig019.includes("artifact_size_bytes bigint null"),
);
check(
  "migration019.contract_and_scope",
  mig019.includes("id uuid primary key default app.uuid_v7()") &&
    mig019.includes("company_id uuid not null references app.companies (id) on delete restrict") &&
    mig019.includes("version integer not null default 1") &&
    mig019.includes("requested_by uuid not null") &&
    mig019.includes("expires_at timestamptz null"),
);
check(
  "migration019.rls_grants_triggers",
  mig019.includes("enable row level security") &&
    mig019.includes("force row level security") &&
    mig019.includes(
      "grant select, insert, update, delete on app.backup_requests to service_role",
    ) &&
    mig019.includes("execute function app.touch_updated_at()") &&
    mig019.includes("execute function app.guard_optimistic_version()"),
);
check("migration019.rollback", mig019down.includes("drop table if exists app.backup_requests"));

// ---------------------------------------------------------------------------
// Reuse: pre-registered permissions + the "backups" entitlement.
// ---------------------------------------------------------------------------
check(
  "backups.permissions_registered",
  permissionsSrc.includes('"backup.request"') && permissionsSrc.includes('"backup.read"'),
);
check("backups.entitlement_registered", mig014.includes('"backups"'));

// ---------------------------------------------------------------------------
// Module surface + scoping + crypto.
// ---------------------------------------------------------------------------
check(
  "module.functions",
  typeof backups.requestBackup === "function" &&
    typeof backups.listBackups === "function" &&
    typeof backups.downloadBackup === "function" &&
    typeof backups.fulfilBackupRequest === "function" &&
    typeof backups.expireBackups === "function",
);
check(
  "module.scoping",
  backupsModuleSrc.includes("requireTenantContext(context)") &&
    backupsModuleSrc.includes("requirePlatformContext(context)") &&
    backupsModuleSrc.includes('requirePermission(context, "backup.request")') &&
    backupsModuleSrc.includes('requirePermission(context, "backup.read")') &&
    backupsModuleSrc.includes('requireEntitlement(context, "backups")'),
);
check(
  "module.crypto",
  backupsModuleSrc.includes("encryptData(") &&
    backupsModuleSrc.includes("decryptData(") &&
    backupsModuleSrc.includes("sha256Hex(") &&
    backupsModuleSrc.includes("getEncryptionKeyVersion()") &&
    backupsModuleSrc.includes('category: "backup"'),
);

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------
check(
  "routes.list_and_request",
  routeSrc.includes("listBackups") && routeSrc.includes("requestBackup"),
);
check(
  "routes.download",
  downloadRouteSrc.includes("downloadBackup") &&
    downloadRouteSrc.includes("await params") &&
    downloadRouteSrc.includes("uuidV7Schema"),
);

process.stdout.write(`\nstep-03n offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
