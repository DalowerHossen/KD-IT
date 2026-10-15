// path: scripts/acceptance/step-03f/offline.mjs
// Step 03 substep F offline acceptance: the permissioned account unlock.
// Verifies the optimistic-locked, active-only clear writer (migration 012) and
// the unlock evidence columns (migration 009), the unlock flow (step-up gate,
// dual-control command with email-contact evidence + reason, approval-gated
// clear + audit), the command kind/roles, the critical-action registration,
// the API surface, and that the lock clears only after final approval. Runs
// without a database; the live clear round-trip is exercised by live.mjs when
// credentials exist.

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

const flow = await import("../../../lib/auth/flows/unlock.ts");
const authLocksRepo = await import("../../../lib/db/repositories/auth-locks.ts");
const audit = await import("../../../lib/auth/audit.ts");
const policy = await import("../../../lib/auth/mfa-policy.ts");
const commandsTypes = await import("../../../lib/commands/types.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig009 = read("../../../supabase/migrations/009_identity_authorization.up.sql");
const mig012 = read("../../../supabase/migrations/012_account_unlock.up.sql");
const mig012down = read("../../../supabase/migrations/012_account_unlock.down.sql");
const unlockSrc = read("../../../lib/auth/flows/unlock.ts");
const requestRouteSrc = read("../../../app/api/security/account-unlock/request/route.ts");
const executeRouteSrc = read("../../../app/api/security/account-unlock/execute/route.ts");
const actionRouteSrc = read("../../../app/api/commands/action/route.ts");

// ---------------------------------------------------------------------------
// Storage: the clear writer (012) and the unlock evidence columns (009).
// ---------------------------------------------------------------------------
check(
  "migration012.clear_writer",
  /create or replace function app\.auth_locks_clear\(/.test(mig012) &&
    mig012.includes("security definer") &&
    mig012.includes("for update"),
);
// Optimistic locking: the writer refuses a stale expected version.
check(
  "migration012.optimistic_version",
  mig012.includes("v_row.version <> p_expected_version") && /using errcode = '40001'/.test(mig012),
);
// Active-only: it never lifts a window that already expired.
check(
  "migration012.active_only",
  mig012.includes("v_row.locked_until <= v_now") && mig012.includes("'no_active_lock'"),
);
// Records immutable unlock evidence and restarts the sequence.
check(
  "migration012.records_evidence",
  mig012.includes("unlocked_by = p_unlocked_by") &&
    mig012.includes("unlock_command_id = p_command_id") &&
    mig012.includes("unlock_reason = btrim(p_reason)") &&
    mig012.includes("consecutive_failures = 0"),
);
check(
  "migration012.grants_service_only",
  mig012.includes(
    "grant execute on function app.auth_locks_clear(text, uuid, uuid, text, integer) to service_role",
  ) &&
    /revoke execute on function app\.auth_locks_clear\(text, uuid, uuid, text, integer\) from authenticated, anon, public/.test(
      mig012,
    ),
);
check(
  "migration012.down_drops",
  mig012down.includes(
    "drop function if exists app.auth_locks_clear(text, uuid, uuid, text, integer)",
  ),
);
check(
  "migration009.unlock_columns",
  mig009.includes("unlocked_by uuid null") &&
    mig009.includes("unlock_command_id uuid null references app.command_approvals (id)") &&
    mig009.includes("unlock_reason text null"),
);

// ---------------------------------------------------------------------------
// Repository + flow surfaces.
// ---------------------------------------------------------------------------
check("repo.clear_surface", typeof authLocksRepo.clearAccountLock === "function");
check(
  "flow.surface",
  typeof flow.requestAccountUnlock === "function" &&
    typeof flow.executeAccountUnlock === "function",
);

// The request: step-up 2FA gate + dual-control command + email-contact
// evidence + reason.
check(
  "flow.request_stepup_gate",
  unlockSrc.includes('requireFreshReauthentication(client, "auth.account.unlock")'),
);
check(
  "flow.request_dual_control_command",
  /kind: "auth\.account\.unlock"/.test(unlockSrc) &&
    unlockSrc.includes("dualControl: true") &&
    unlockSrc.includes("ownerContactConfirmed: true") &&
    unlockSrc.includes("attestation: input.reason"),
);
// The execution: approval re-verification, the optimistic clear, and audit.
check(
  "flow.execute_approval_gated",
  unlockSrc.includes('assertApprovedCommandFor(context, command.id, "auth.account.unlock")') &&
    unlockSrc.includes("clearAccountLock") &&
    unlockSrc.includes("AUTH_LIFECYCLE_AUDIT_ACTIONS.lockUnlocked"),
);
check(
  "audit.lock_unlocked_action",
  audit.AUTH_LIFECYCLE_AUDIT_ACTIONS.lockUnlocked === "auth.lock.unlocked",
);

// ---------------------------------------------------------------------------
// Command kind + roles, and critical-action (step-up) registration.
// ---------------------------------------------------------------------------
check(
  "command.kind_registered",
  commandsTypes.STEP_03_COMMAND_KINDS.includes("auth.account.unlock") &&
    JSON.stringify(commandsTypes.REQUIRED_COMMAND_ROLES["auth.account.unlock"]) ===
      JSON.stringify(["super_admin", "ceo"]),
);
check("critical.unlock_requires_stepup", policy.isCriticalAction("auth.account.unlock") === true);

// ---------------------------------------------------------------------------
// API surface.
// ---------------------------------------------------------------------------
check(
  "routes.request",
  requestRouteSrc.includes("requestAccountUnlock") &&
    requestRouteSrc.includes("workingContextForRoute") &&
    requestRouteSrc.includes("createRouteHandlerClient"),
);
check(
  "routes.execute_approved_only",
  executeRouteSrc.includes(
    'command.kind !== "auth.account.unlock" || command.status !== "approved"',
  ) &&
    executeRouteSrc.includes("executeAccountUnlock") &&
    executeRouteSrc.includes("executeCommand"),
);
check(
  "routes.chain_driver",
  actionRouteSrc.includes("stepUpCommand") &&
    actionRouteSrc.includes("approveCommandL2") &&
    actionRouteSrc.includes("approveCommandL3") &&
    actionRouteSrc.includes("finalConfirmCommand") &&
    actionRouteSrc.includes("rejectCommand"),
);

process.stdout.write(
  `step-03f offline: ${checks.length - failures}/${checks.length} checks passed\n`,
);
if (failures > 0) {
  process.exit(1);
}
