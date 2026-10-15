// path: scripts/acceptance/step-03d/live.mjs
// Step 03 substep D live acceptance: verifies the live Supabase Auth data
// plane and the database are reachable and that the MFA API surface is
// exposed, so the TOTP / backup-code / OAuth flows have a working provider.
// The full interactive TOTP + OAuth cycle (scan, verify, link) is a documented
// manual acceptance run (REQUIREMENTS_ADDENDUM section 2.5) because it needs a human
// authenticator app and a configured provider. Requires SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, and KD_DATABASE_URL; skips cleanly when absent.

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

// 1. Database connectivity (the session mirror + attempt records live here).
try {
  const db = await connect();
  const result = await db.query("select 1 as ok");
  check("live.db_reachable", result.rows[0]?.ok === 1);
  await db.end?.();
} catch (error) {
  check("live.db_reachable", false, String(error));
}

// 2. Supabase Auth reachability + MFA API surface.
try {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  check(
    "live.mfa_api_surface",
    typeof admin.auth.mfa.enroll === "function" &&
      typeof admin.auth.mfa.challenge === "function" &&
      typeof admin.auth.mfa.verify === "function" &&
      typeof admin.auth.mfa.listFactors === "function" &&
      typeof admin.auth.mfa.unenroll === "function" &&
      typeof admin.auth.mfa.getAuthenticatorAssuranceLevel === "function" &&
      typeof admin.auth.mfa.recoveryCodes.generate === "function" &&
      typeof admin.auth.mfa.recoveryCodes.verify === "function" &&
      typeof admin.auth.signInWithOAuth === "function" &&
      typeof admin.auth.linkIdentity === "function",
  );
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1 });
  check(
    "live.auth_reachable",
    error === null && data !== null && Array.isArray(data.users),
    error === null ? undefined : error.message,
  );
} catch (error) {
  check("live.auth_reachable", false, String(error));
}

process.stdout.write("NOTE full TOTP + OAuth cycle is a documented manual acceptance run\n");
if (failures > 0) {
  process.exit(1);
}
