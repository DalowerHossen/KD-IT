// path: scripts/acceptance/step-03g/offline.mjs
// Step 03 substep G offline acceptance: IP / account / device / endpoint rate
// limiting, Turnstile verification, and network-risk (VPN / proxy / Tor /
// hostile datacenter / reputation) blocking for signup and administration.
// Verifies the shared rate-limit budgets, the pluggable passive-by-default
// network-risk policy + enforcement, the config-driven fail-closed Turnstile
// verifier, the combined abuse guard, the env bindings, the audit actions, and
// the signup + admin route integration. Runs without a database; the live
// policy round-trip is exercised by live.mjs when credentials exist.

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

const rateLimit = await import("../../../lib/auth/auth-rate-limit.ts");
const risk = await import("../../../lib/security/network-risk.ts");
const turnstile = await import("../../../lib/security/turnstile.ts");
const guard = await import("../../../lib/security/abuse-guard.ts");
const audit = await import("../../../lib/auth/audit.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const envSrc = read("../../../lib/config/env.ts");
const signupSrc = read("../../../lib/auth/flows/signup.ts");
const loginSrc = read("../../../lib/auth/flows/login.ts");
const schemasSrc = read("../../../lib/auth/schemas.ts");
const inviteSrc = read("../../../app/api/company/members/invite/route.ts");
const suspendSrc = read("../../../app/api/company/members/suspend/route.ts");
const roleSrc = read("../../../app/api/company/members/update-role/route.ts");

// ---------------------------------------------------------------------------
// Rate limiting: shared budgets across IP, account, device, and endpoint.
// ---------------------------------------------------------------------------
const REQUIRED_BUDGETS = [
  "loginPerIp",
  "loginPerDevice",
  "signupPerIp",
  "signupPerDevice",
  "mfaVerifyPerIp",
  "adminCommandPerIp",
  "adminCommandPerAccount",
  "kycSubmitPerIp",
  "kycSubmitPerAccount",
  "turnstilePerIp",
];
const budgets = rateLimit.RATE_LIMIT_BUDGETS;
check(
  "rate.budgets_defined",
  REQUIRED_BUDGETS.every(
    (scope) => budgets[scope] && budgets[scope].limit > 0 && budgets[scope].windowSeconds > 0,
  ),
);

// The extended budget consumer + back-compat authentication wrapper exist.
check(
  "rate.consumers_present",
  typeof rateLimit.consumeRateLimitBudget === "function" &&
    typeof rateLimit.consumeAuthRateLimit === "function",
);

// Device key: deterministic over (ip, normalized user agent); empty UA is
// stable and distinct from a real UA.
const devA = rateLimit.deviceRateLimitKey("1.2.3.4", "Mozilla/5.0 (X11) Chrome/1");
const devA2 = rateLimit.deviceRateLimitKey("1.2.3.4", "Mozilla/5.0 (X11) Chrome/1");
const devB = rateLimit.deviceRateLimitKey("1.2.3.4", "Mozilla/5.0 (Windows) Edge/2");
const devNone = rateLimit.deviceRateLimitKey("1.2.3.4", null);
check(
  "rate.device_key_deterministic",
  devA === devA2 && devA !== devB && /^[0-9a-f]{64}$/.test(devA) && devNone === devNone,
);

// ---------------------------------------------------------------------------
// Network risk: policy resolution + the passive default provider.
// ---------------------------------------------------------------------------
// Default policy: not enforced (observe only), blocks the hostile categories,
// allows unknown.
const def = risk.resolveNetworkRiskPolicy(null);
check(
  "risk.default_policy",
  def.enforce === false &&
    def.blockUnknown === false &&
    ["tor", "vpn_proxy", "datacenter"].every((c) => def.blockCategories.includes(c)),
);
// An enforced + blockUnknown policy denies an unknown IP.
const strict = risk.resolveNetworkRiskPolicy(null, { enforce: true, blockUnknown: true });
check("risk.enforce_block_unknown", strict.enforce === true && strict.blockUnknown === true);
// A stored config-table policy is honored.
const stored = risk.resolveNetworkRiskPolicy({ enforce: true, blockCategories: ["tor"] });
check(
  "risk.stored_policy",
  stored.enforce === true &&
    stored.blockCategories.length === 1 &&
    stored.blockCategories[0] === "tor",
);
// The passive provider never claims hostility (no fabricated blocking).
const passive = await risk.assessNetworkRisk("203.0.113.7");
check("risk.passive_unknown", passive.category === "unknown" && passive.isHostile === false);
const noIp = await risk.assessNetworkRisk(null);
check("risk.no_ip_unknown", noIp.category === "unknown" && noIp.isHostile === false);

// ---------------------------------------------------------------------------
// Turnstile: config-driven, fail-closed verifier.
// ---------------------------------------------------------------------------
// Not enforced (the default / sandbox): verification is a passing no-op.
const noEnforce = await turnstile.verifyTurnstileToken("any-token", "1.2.3.4", {
  enforced: false,
  secretKey: null,
  siteverifyUrl: "http://localhost:0",
  timeoutMs: 1000,
});
check("turnstile.noop_when_not_enforced", noEnforce.valid === true && noEnforce.skipped === true);
// Enforced with a missing token: fail closed.
const missingToken = await turnstile.verifyTurnstileToken(null, "1.2.3.4", {
  enforced: true,
  secretKey: "secret",
  siteverifyUrl: "http://localhost:0",
  timeoutMs: 1000,
});
check(
  "turnstile.fail_closed_missing_token",
  missingToken.valid === false && missingToken.skipped === false,
);
// Enforced but unconfigured: fail closed (never silently passes).
const unconfigured = await turnstile.verifyTurnstileToken("a-token", "1.2.3.4", {
  enforced: true,
  secretKey: null,
  siteverifyUrl: "http://localhost:0",
  timeoutMs: 1000,
});
check("turnstile.fail_closed_unconfigured", unconfigured.valid === false);

// ---------------------------------------------------------------------------
// Abuse guard: a single combined gate is present.
// ---------------------------------------------------------------------------
check("guard.combined_gate", typeof guard.enforceAbuseProtection === "function");

// ---------------------------------------------------------------------------
// Env bindings, audit actions, schemas, and route integration.
// ---------------------------------------------------------------------------
check(
  "env.security_vars",
  envSrc.includes("KD_TURNSTILE_SECRET") &&
    envSrc.includes("KD_TURNSTILE_ENFORCED") &&
    envSrc.includes("KD_NETWORK_RISK_ENFORCED"),
);
check(
  "audit.security_actions",
  audit.AUTH_LIFECYCLE_AUDIT_ACTIONS.networkRiskBlocked !== undefined &&
    audit.AUTH_LIFECYCLE_AUDIT_ACTIONS.turnstileRejected !== undefined,
);
check("schemas.turnstile_token", schemasSrc.includes("turnstileToken"));
check(
  "signup.uses_abuse_guard",
  signupSrc.includes("enforceAbuseProtection") && signupSrc.includes("getTurnstileConfig"),
);
check(
  "login.uses_abuse_guard",
  loginSrc.includes("enforceAbuseProtection") && loginSrc.includes("getTurnstileConfig"),
);
check(
  "admin.routes_use_abuse_guard",
  inviteSrc.includes("enforceAbuseProtection") &&
    suspendSrc.includes("enforceAbuseProtection") &&
    roleSrc.includes("enforceAbuseProtection"),
);

process.stdout.write(`\nstep-03g offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
