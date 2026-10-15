// path: scripts/acceptance/step-03d/offline.mjs
// Step 03 substep D offline acceptance: pure assurance/step-up policy logic,
// MFA and OAuth schema round-trips, flow and route surfaces, page and
// navigation registration, and audit vocabulary. Runs without a database;
// the live MFA/OAuth flow is exercised by live-db.mjs when credentials exist.

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

const policy = await import("../../../lib/auth/mfa-policy.ts");
const schemas = await import("../../../lib/auth/schemas.ts");
const mfaFlow = await import("../../../lib/auth/flows/mfa.ts");
const stepUp = await import("../../../lib/auth/step-up.ts");
const audit = await import("../../../lib/auth/audit.ts");
const navSource = readFileSync(new URL("../../../config/nav-map.ts", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Pure assurance policy: which roles require a second factor.
// ---------------------------------------------------------------------------
const ra = policy.requiredAssuranceLevel;
check("policy.nonstaff_require_aal2", ra({ role: "owner", tenantEnforces2FA: false }) === "aal2");
check("policy.super_admin_aal2", ra({ role: "super_admin", tenantEnforces2FA: false }) === "aal2");
check("policy.ceo_aal2", ra({ role: "ceo", tenantEnforces2FA: false }) === "aal2");
check("policy.admin_staff_aal2", ra({ role: "admin_staff", tenantEnforces2FA: false }) === "aal2");
check("policy.staff_not_enforced_aal1", ra({ role: "staff", tenantEnforces2FA: false }) === "aal1");
check("policy.staff_enforced_aal2", ra({ role: "staff", tenantEnforces2FA: true }) === "aal2");
check(
  "policy.role_set_strictest_wins",
  policy.requiredAssuranceForRoles(["staff", "owner"], false) === "aal2" &&
    policy.requiredAssuranceForRoles(["staff"], false) === "aal1" &&
    policy.requiredAssuranceForRoles(["staff"], true) === "aal2" &&
    policy.requiredAssuranceForRoles([], false) === "aal1",
);
check(
  "policy.satisfaction",
  policy.assuranceSatisfies("aal2", "aal2") === true &&
    policy.assuranceSatisfies("aal2", "aal1") === true &&
    policy.assuranceSatisfies("aal1", "aal2") === false &&
    policy.assuranceSatisfies("aal1", "aal1") === true &&
    policy.assuranceSatisfies(null, "aal1") === false,
);

// ---------------------------------------------------------------------------
// Step-up (fresh reauthentication) policy.
// ---------------------------------------------------------------------------
const stepUpRequired = policy.stepUpRequired;
check(
  "stepup.noncritical_never",
  stepUpRequired({
    role: "owner",
    isCriticalAction: false,
    lastAal2VerifiedAt: null,
    now: 1_000_000,
    ttlMinutes: 15,
  }) === false,
);
check(
  "stepup.critical_no_prior",
  stepUpRequired({
    role: "owner",
    isCriticalAction: true,
    lastAal2VerifiedAt: null,
    now: 1_000_000,
    ttlMinutes: 15,
  }) === true,
);
check(
  "stepup.critical_fresh",
  stepUpRequired({
    role: "owner",
    isCriticalAction: true,
    lastAal2VerifiedAt: 1_000_000 - 60,
    now: 1_000_000,
    ttlMinutes: 15,
  }) === false,
);
check(
  "stepup.critical_stale",
  stepUpRequired({
    role: "owner",
    isCriticalAction: true,
    lastAal2VerifiedAt: 1_000_000 - 16 * 60,
    now: 1_000_000,
    ttlMinutes: 15,
  }) === true,
);
check(
  "stepup.ttl_clamp",
  policy.clampStepUpTtlMinutes(0) === 1 &&
    policy.clampStepUpTtlMinutes(9999) === 60 &&
    policy.clampStepUpTtlMinutes(10) === 10 &&
    policy.clampStepUpTtlMinutes(NaN) === 15,
);
check(
  "stepup.critical_set",
  policy.isCriticalAction("mfa.unenroll") === true &&
    policy.isCriticalAction("approval.l3.decide") === true &&
    policy.isCriticalAction("password.change") === true &&
    policy.isCriticalAction("team.read") === false,
);
check(
  "stepup.amr_extraction",
  policy.lastAal2VerifiedAtFromAmr([
    { method: "password", timestamp: 100 },
    { method: "mfa/totp", timestamp: 500 },
  ]) === 500 &&
    policy.lastAal2VerifiedAtFromAmr(["password", "mfa/totp"]) === null &&
    policy.lastAal2VerifiedAtFromAmr(null) === null &&
    policy.lastAal2VerifiedAtFromAmr([{ method: "password", timestamp: 100 }]) === null,
);

// ---------------------------------------------------------------------------
// MFA / OAuth schema round-trips.
// ---------------------------------------------------------------------------
const UUID4 = "00000000-0000-4000-8000-000000000002";
check(
  "schemas.mfa_enroll_roundtrip",
  schemas.mfaEnrollRequestSchema.safeParse({ factorType: "totp" }).success &&
    !schemas.mfaEnrollRequestSchema.safeParse({ factorType: "sms" }).success,
);
check(
  "schemas.mfa_verify_roundtrip",
  schemas.mfaVerifyRequestSchema.safeParse({
    factorId: UUID4,
    challengeId: "0123456789abcdef",
    code: "123456",
  }).success &&
    !schemas.mfaVerifyRequestSchema.safeParse({ factorId: UUID4, challengeId: "x", code: "1" })
      .success,
);
check(
  "schemas.mfa_code_rejects_uppercase_spaces",
  schemas.mfaCodeSchema.safeParse("123456").success &&
    !schemas.mfaCodeSchema.safeParse("12 3456").success,
);
check(
  "schemas.oauth_roundtrip",
  schemas.oauthSignInRequestSchema.safeParse({ provider: "google" }).success &&
    !schemas.oauthSignInRequestSchema.safeParse({ provider: "myspace" }).success &&
    schemas.oauthLinkRequestSchema.safeParse({ provider: "github" }).success,
);
check(
  "schemas.reauth_roundtrip",
  schemas.reauthRequestSchema.safeParse({ actionId: "mfa.unenroll" }).success &&
    !schemas.reauthRequestSchema.safeParse({}).success,
);

// ---------------------------------------------------------------------------
// Flow + step-up surfaces.
// ---------------------------------------------------------------------------
check(
  "mfa_flow.surface",
  typeof mfaFlow.readAssurance === "function" &&
    typeof mfaFlow.listMfaFactors === "function" &&
    typeof mfaFlow.getMfaStatus === "function" &&
    typeof mfaFlow.enrollTotp === "function" &&
    typeof mfaFlow.challengeFactor === "function" &&
    typeof mfaFlow.verifyFactor === "function" &&
    typeof mfaFlow.verifyRecoveryCode === "function" &&
    typeof mfaFlow.generateRecoveryCodes === "function" &&
    typeof mfaFlow.getRecoveryCodesStatus === "function" &&
    typeof mfaFlow.unenrollFactor === "function" &&
    typeof mfaFlow.readTenantEnforce2FA === "function",
);
check("stepup.surface", typeof stepUp.requireFreshReauthentication === "function");

// ---------------------------------------------------------------------------
// Audit vocabulary.
// ---------------------------------------------------------------------------
const A = audit.AUTH_LIFECYCLE_AUDIT_ACTIONS;
check(
  "audit.mfa_vocabulary",
  A.mfaEnrolled === "auth.mfa.enrolled" &&
    A.mfaUnenrolled === "auth.mfa.unenrolled" &&
    A.mfaChallengeIssued === "auth.mfa.challenge_issued" &&
    A.mfaVerified === "auth.mfa.verified" &&
    A.mfaVerificationFailed === "auth.mfa.verification_failed" &&
    A.mfaRecoveryCodesGenerated === "auth.mfa.recovery_codes_generated" &&
    A.mfaRecoveryCodeUsed === "auth.mfa.recovery_code_used" &&
    A.mfaAssuranceDenied === "auth.mfa.assurance_denied" &&
    A.stepUpRequired === "auth.step_up.required" &&
    A.oauthSigninInitiated === "auth.oauth.signin_initiated" &&
    A.oauthIdentityLinked === "auth.oauth.identity_linked",
);

// ---------------------------------------------------------------------------
// Routes: ten new API endpoints with the right method and runtime.
// ---------------------------------------------------------------------------
const D_ROUTES = [
  { path: "app/api/auth/mfa/status/route.ts", method: "GET" },
  { path: "app/api/auth/mfa/enroll/route.ts", method: "POST" },
  { path: "app/api/auth/mfa/challenge/route.ts", method: "POST" },
  { path: "app/api/auth/mfa/verify/route.ts", method: "POST" },
  { path: "app/api/auth/mfa/verify-recovery-code/route.ts", method: "POST" },
  { path: "app/api/auth/mfa/unenroll/route.ts", method: "POST" },
  { path: "app/api/auth/mfa/recovery-codes/route.ts", method: "GET" },
  { path: "app/api/auth/mfa/recovery-codes/generate/route.ts", method: "POST" },
  { path: "app/api/auth/oauth/signin/route.ts", method: "POST" },
  { path: "app/api/auth/oauth/link/route.ts", method: "POST" },
  { path: "app/api/auth/reauth/check/route.ts", method: "GET" },
];
let routesOk = D_ROUTES.length === 11;
for (const route of D_ROUTES) {
  try {
    const source = readFileSync(new URL(`../../../${route.path}`, import.meta.url), "utf8");
    if (!source.includes(`export async function ${route.method}(`)) {
      routesOk = false;
    }
    if (!source.includes('export const dynamic = "force-dynamic";')) {
      routesOk = false;
    }
    if (!source.includes('export const runtime = "nodejs";')) {
      routesOk = false;
    }
  } catch {
    routesOk = false;
  }
}
check("routes.eleven_d_endpoints", routesOk);

// ---------------------------------------------------------------------------
// Pages + navigation + proxy guard.
// ---------------------------------------------------------------------------
function fileHas(rel, needle) {
  try {
    return readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8").includes(needle);
  } catch {
    return false;
  }
}
check(
  "pages.mfa_registered",
  fileHas("app/(auth)/mfa/verify/page.tsx", "export const metadata") &&
    fileHas("app/(auth)/mfa/setup/page.tsx", "export const metadata") &&
    fileHas("app/(dashboard)/security/mfa/page.tsx", "export const metadata"),
);
check(
  "nav.mfa_settings_registered",
  navSource.includes('path: "/security/mfa"') && navSource.includes("strings.mfa.title"),
);
check("proxy.guarded_mfa", fileHas("proxy.ts", '"/account", "/mfa", "/security"'));

const passed = checks.length - failures;
process.stdout.write(`\nstep-03d offline: ${passed}/${checks.length} checks passed\n`);
if (failures > 0) {
  process.exit(1);
}
