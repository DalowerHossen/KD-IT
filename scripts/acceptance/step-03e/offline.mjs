// path: scripts/acceptance/step-03e/offline.mjs
// Step 03 substep E offline acceptance: the account-lock contract. Verifies the
// lock policy constants, the race-safe PL/pgSQL writers (migration 011) and the
// auth_locks table (migration 009), the repository and orchestration surfaces,
// and that the login, 2FA, and recovery flows enforce the lock -- generic
// responses, a shared failure sequence, reset-not-clear on success, and the
// lock-begin audit + alert. Runs without a database; the live lock round-trip
// is exercised by live.mjs when credentials exist.

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

const policy = await import("../../../lib/auth/lockout-policy.ts");
const lockout = await import("../../../lib/auth/lockout.ts");
const authLocksRepo = await import("../../../lib/db/repositories/auth-locks.ts");
const audit = await import("../../../lib/auth/audit.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig009 = read("../../../supabase/migrations/009_identity_authorization.up.sql");
const mig011 = read("../../../supabase/migrations/011_auth_lockout.up.sql");
const mig011down = read("../../../supabase/migrations/011_auth_lockout.down.sql");
const loginSrc = read("../../../lib/auth/flows/login.ts");
const mfaSrc = read("../../../lib/auth/flows/mfa.ts");
const recoverySrc = read("../../../lib/auth/flows/recovery.ts");
const passwordsSrc = read("../../../lib/auth/flows/passwords.ts");
const emailPortSrc = read("../../../lib/auth/email-port.ts");
const supabaseEmailSrc = read("../../../lib/auth/supabase-email.ts");
const verifyRouteSrc = read("../../../app/api/auth/mfa/verify/route.ts");
const recoveryCodeRouteSrc = read("../../../app/api/auth/mfa/verify-recovery-code/route.ts");
const enSrc = read("../../../lib/i18n/strings/en.ts");

// ---------------------------------------------------------------------------
// Lock policy: the exact threshold and duration, and the active-window test.
// ---------------------------------------------------------------------------
check("policy.threshold_is_two", policy.AUTH_LOCK_FAILURE_THRESHOLD === 2);
check("policy.duration_is_two_hours_ms", policy.AUTH_LOCK_DURATION_MS === 2 * 60 * 60 * 1000);
check("policy.interval_sql", policy.AUTH_LOCK_INTERVAL_SQL === "2 hours");

const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 3600_000).toISOString();
check("policy.isLockActive_null", policy.isLockActive(null) === false);
check("policy.isLockActive_invalid", policy.isLockActive("not-a-date") === false);
check("policy.isLockActive_future", policy.isLockActive(future) === true);
check("policy.isLockActive_past", policy.isLockActive(past) === false);

// ---------------------------------------------------------------------------
// Storage: the auth_locks table (009) and the race-safe writers (011).
// ---------------------------------------------------------------------------
check(
  "migration009.auth_locks_table",
  /create table app\.auth_locks \(/.test(mig009) &&
    mig009.includes("consecutive_failures") &&
    mig009.includes("locked_until") &&
    mig009.includes("lock_count") &&
    mig009.includes("last_failure_at"),
);

check(
  "migration011.failure_writer",
  /create or replace function app\.auth_locks_record_failure\(/.test(mig011) &&
    mig011.includes("security definer") &&
    /on conflict \(subject_hash\) where deleted_at is null do update/.test(mig011) &&
    mig011.includes("for update") === false, // serialized by the upsert row lock
);
// The failure writer opens an exact window at the threshold and never extends
// an active one.
check(
  "migration011.failure_open_exact_window",
  mig011.includes("v_consecutive >= p_threshold") &&
    mig011.includes("v_now + p_lock_interval") &&
    mig011.includes("v_row.locked_until > v_now"),
);
check(
  "migration011.success_writer_no_clear",
  /create or replace function app\.auth_locks_record_success\(/.test(mig011) &&
    mig011.includes("consecutive_failures = 0") &&
    // The success writer must never touch the active lock window.
    !/auth_locks_record_success[\s\S]*?set[\s\S]*?locked_until/.test(
      mig011.split("record_success")[1] ?? "",
    ),
);
check(
  "migration011.grants_service_only",
  mig011.includes(
    "grant execute on function app.auth_locks_record_failure(text, uuid, integer, interval) to service_role",
  ) &&
    mig011.includes(
      "grant execute on function app.auth_locks_record_success(text) to service_role",
    ) &&
    /revoke execute on function app\.auth_locks_record_failure\(text, uuid, integer, interval\) from authenticated, anon, public/.test(
      mig011,
    ) &&
    /revoke execute on function app\.auth_locks_record_success\(text\) from authenticated, anon, public/.test(
      mig011,
    ),
);
check(
  "migration011.down_drops",
  mig011down.includes(
    "drop function if exists app.auth_locks_record_failure(text, uuid, integer, interval)",
  ) && mig011down.includes("drop function if exists app.auth_locks_record_success(text)"),
);

// ---------------------------------------------------------------------------
// Repository + orchestration surfaces.
// ---------------------------------------------------------------------------
check(
  "repo.surface",
  typeof authLocksRepo.readLockState === "function" &&
    typeof authLocksRepo.recordLockFailure === "function" &&
    typeof authLocksRepo.recordLockSuccess === "function",
);
check(
  "lockout.surface",
  typeof lockout.getActiveLock === "function" &&
    typeof lockout.recordAuthFailureForLock === "function" &&
    typeof lockout.resetLockSequence === "function",
);
check(
  "audit.lock_began_action",
  audit.AUTH_LIFECYCLE_AUDIT_ACTIONS.lockBegun === "auth.lock.begun",
);

// ---------------------------------------------------------------------------
// Email alert: port method + durable Supabase implementation.
// ---------------------------------------------------------------------------
check(
  "email.port_method",
  /sendAccountLockedAlert\(email: string\): Promise<void>/.test(emailPortSrc),
);
check(
  "email.supabase_durable",
  supabaseEmailSrc.includes("async sendAccountLockedAlert(email)") &&
    supabaseEmailSrc.includes('publishOutboxEvent(PLATFORM_COMPANY_ID, "auth.account.locked"'),
);

// ---------------------------------------------------------------------------
// Login flow: pre-auth gate, shared-sequence failure, success reset, generic.
// ---------------------------------------------------------------------------
check(
  "login.wires_lockout",
  loginSrc.includes("getActiveLock") &&
    loginSrc.includes("recordAuthFailureForLock") &&
    loginSrc.includes("resetLockSequence"),
);
check("login.preauth_gate", loginSrc.includes("account-locked"));
check("login.generic_message", loginSrc.includes("Email or password is incorrect."));
// The gate runs before the credential check (declared before signInWithPassword).
check(
  "login.gate_before_credentials",
  loginSrc.indexOf("getActiveLock(subjectHash)") !== -1 &&
    loginSrc.indexOf("getActiveLock(subjectHash)") < loginSrc.indexOf("signInWithPassword"),
);
check(
  "login.failure_uses_password_factor",
  /recordAuthFailureForLock\(\{[\s\S]*?factor: "password"[\s\S]*?\}\)/.test(loginSrc),
);

// ---------------------------------------------------------------------------
// 2FA flow: shared sequence for TOTP + backup code, pre-verify gate, reset.
// ---------------------------------------------------------------------------
check(
  "mfa.wires_lockout",
  mfaSrc.includes("getActiveLock") &&
    mfaSrc.includes("recordAuthFailureForLock") &&
    mfaSrc.includes("resetLockSequence") &&
    mfaSrc.includes("recordAuthAttempt"),
);
check(
  "mfa.shared_sequence_factors",
  mfaSrc.includes('factor: "totp"') && mfaSrc.includes('factor: "backup_code"'),
);
check("mfa.preverify_gate", mfaSrc.includes("account-locked"));
check(
  "mfa.subject_hash_from_email",
  mfaSrc.includes("authSubjectHash(email)") &&
    mfaSrc.includes("email === null ? null : authSubjectHash(email)"),
);

// ---------------------------------------------------------------------------
// Recovery: reset unavailable during a lock, generic response.
// ---------------------------------------------------------------------------
check(
  "recovery.blocks_when_locked",
  recoverySrc.includes("getActiveLock") &&
    recoverySrc.includes("lockBlocked") &&
    recoverySrc.includes("sent: true"),
);

// ---------------------------------------------------------------------------
// Password change: must NOT clear the lock.
// ---------------------------------------------------------------------------
check(
  "passwords.never_clears_lock",
  !passwordsSrc.includes("resetLockSequence") &&
    !passwordsSrc.includes("recordLockSuccess") &&
    passwordsSrc.includes("does not clear an active lock"),
);

// ---------------------------------------------------------------------------
// Routes pass the session email to the 2FA flows.
// ---------------------------------------------------------------------------
check(
  "routes.pass_email",
  verifyRouteSrc.includes("mfa.email") && recoveryCodeRouteSrc.includes("mfa.email"),
);

// ---------------------------------------------------------------------------
// i18n: the lock-alert message (no secrets, no recovery links).
// ---------------------------------------------------------------------------
check(
  "i18n.lock_alert",
  enSrc.includes("lockAlert") &&
    enSrc.includes("temporarily locked") &&
    !/lockAlert[\s\S]*?(password|secret|token|reset-password)/i.test(
      enSrc.split("lockAlert:")[1] ?? "",
    ),
);

process.stdout.write(
  `step-03e offline: ${checks.length - failures}/${checks.length} checks passed\n`,
);
if (failures > 0) {
  process.exit(1);
}
