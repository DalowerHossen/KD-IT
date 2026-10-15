// path: scripts/acceptance/step-03b/offline.mjs
// Step 03 substep B offline acceptance: auth flow module exports, shared
// schema round-trips, audit vocabulary, profile status machine, session
// repository surface, route and page artifacts, navigation registration,
// proxy guard, migration pairing, and the dependency record. Runs without
// a database; non-destructive and idempotent by design.

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

const signup = await import("../../../lib/auth/flows/signup.ts");
const login = await import("../../../lib/auth/flows/login.ts");
const recovery = await import("../../../lib/auth/flows/recovery.ts");
const passwords = await import("../../../lib/auth/flows/passwords.ts");
const sessionsFlow = await import("../../../lib/auth/flows/sessions.ts");
const sessionLib = await import("../../../lib/auth/session.ts");
const serverAuth = await import("../../../lib/auth/server-auth.ts");
const audit = await import("../../../lib/auth/audit.ts");
const schemas = await import("../../../lib/auth/schemas.ts");
const profilesRepo = await import("../../../lib/db/repositories/profiles.ts");
const sessionsRepo = await import("../../../lib/db/repositories/auth-sessions.ts");
const proxySource = readFileSync(new URL("../../../proxy.ts", import.meta.url), "utf8");
const navSource = readFileSync(new URL("../../../config/nav-map.ts", import.meta.url), "utf8");
const upSource = readFileSync(
  new URL("../../../supabase/migrations/010_auth_lifecycle.up.sql", import.meta.url),
  "utf8",
);
const downSource = readFileSync(
  new URL("../../../supabase/migrations/010_auth_lifecycle.down.sql", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// Flow surfaces: every B behavior is exported for routes and later steps.
// ---------------------------------------------------------------------------
check(
  "flows.signup_exports",
  typeof signup.signupWithPassword === "function" &&
    typeof signup.resendVerificationEmail === "function",
);
check(
  "flows.login_exports",
  typeof login.loginWithPassword === "function" &&
    typeof login.establishSessionMirror === "function",
);
check(
  "flows.recovery_exports",
  typeof recovery.requestPasswordRecovery === "function" &&
    typeof recovery.completePasswordRecovery === "function" &&
    typeof recovery.assertPasswordNotReused === "function",
);
check("flows.passwords_exports", typeof passwords.changePassword === "function");
check(
  "flows.sessions_exports",
  typeof sessionsFlow.listSessions === "function" &&
    typeof sessionsFlow.revokeSession === "function" &&
    typeof sessionsFlow.logoutCurrentSession === "function" &&
    typeof sessionsFlow.logoutAllSessions === "function",
);
check(
  "session.resolve_surface",
  typeof sessionLib.resolveSession === "function" &&
    typeof sessionLib.resolveSessionForRoute === "function" &&
    typeof sessionLib.assertProfileActiveForSession === "function",
);
check(
  "server_auth.surface",
  typeof serverAuth.createRouteHandlerClient === "function" &&
    typeof serverAuth.requireAuthUser === "function" &&
    typeof serverAuth.exchangeCodeForSession === "function" &&
    typeof serverAuth.verifyEmailLink === "function" &&
    typeof serverAuth.signOutCurrentSession === "function" &&
    typeof serverAuth.signOutAllSessions === "function" &&
    typeof serverAuth.refreshTokenFingerprint === "function",
);

// ---------------------------------------------------------------------------
// Audit vocabulary: the full lifecycle set is registered.
// ---------------------------------------------------------------------------
const expectedActions = [
  "auth.signup.completed",
  "auth.verification.resent",
  "auth.verification.completed",
  "auth.login.succeeded",
  "auth.login.failed",
  "auth.session.revoked",
  "auth.session.expired",
  "auth.session.risk",
  "auth.device.registered",
  "auth.recovery.requested",
  "auth.recovery.completed",
  "auth.password.changed",
  "auth.account.activated",
];
check(
  "audit.lifecycle_vocabulary",
  expectedActions.every((action) =>
    Object.values(audit.AUTH_LIFECYCLE_AUDIT_ACTIONS).includes(action),
  ),
  expectedActions.length.toString(),
);
check("audit.lifecycle_helper", typeof audit.auditAuthLifecycle === "function");

// ---------------------------------------------------------------------------
// Profile status machine: the approval-aware transitions are the registry.
// ---------------------------------------------------------------------------
const t = profilesRepo.PROFILE_STATUS_TRANSITIONS;
check(
  "profile.machine_states",
  Object.keys(t).sort().join(",") ===
    ["active", "deactivated", "pending_approval", "pending_verification", "suspended"]
      .sort()
      .join(","),
);
check(
  "profile.machine_flow",
  t.pending_verification.includes("pending_approval") &&
    t.pending_approval.includes("active") &&
    t.active.includes("suspended") &&
    t.suspended.includes("active") &&
    t.deactivated.length === 0 &&
    !t.pending_verification.includes("active"),
);
check("profile.transition_export", typeof profilesRepo.transitionProfileStatus === "function");

// ---------------------------------------------------------------------------
// Session repository surface: envelope and mirror operations.
// ---------------------------------------------------------------------------
check(
  "sessions_repo.surface",
  typeof sessionsRepo.issueSession === "function" &&
    typeof sessionsRepo.getSessionByFingerprint === "function" &&
    typeof sessionsRepo.touchSessionActivity === "function" &&
    typeof sessionsRepo.revokeSessionById === "function" &&
    typeof sessionsRepo.revokeAllUserSessions === "function" &&
    typeof sessionsRepo.listUserSessions === "function",
);

// ---------------------------------------------------------------------------
// Shared schemas: request shapes round-trip and reject invalid payloads.
// ---------------------------------------------------------------------------
check(
  "schemas.login_roundtrip",
  schemas.loginInputSchema.safeParse({ email: "a@b.co", password: "x" }).success &&
    !schemas.loginInputSchema.safeParse({ email: "a@b.co" }).success,
);
check(
  "schemas.logout_roundtrip",
  schemas.logoutInputSchema.safeParse({ scope: "all" }).success &&
    !schemas.logoutInputSchema.safeParse({ scope: "nope" }).success,
);
check(
  "schemas.callback_roundtrip",
  schemas.authCallbackQuerySchema.safeParse({
    token_hash: "abc123",
    type: "recovery",
  }).success &&
    !schemas.authCallbackQuerySchema.safeParse({ token_hash: "abc123" }).success &&
    !schemas.authCallbackQuerySchema.safeParse({ code: "abc", token_hash: "abc123" }).success,
);
check(
  "schemas.password_roundtrip",
  schemas.passwordChangeInputSchema.safeParse({
    currentPassword: "old-password-1",
    newPassword: "Correct1Horse!Battery",
  }).success &&
    schemas.passwordUpdateInputSchema.safeParse({ password: "Correct1Horse!Battery" }).success,
);

// ---------------------------------------------------------------------------
// API routes: all eleven endpoints exist with the right method and runtime.
// ---------------------------------------------------------------------------
const ROUTES = [
  { path: "app/api/auth/signup/route.ts", method: "POST" },
  { path: "app/api/auth/verify/resend/route.ts", method: "POST" },
  { path: "app/api/auth/login/route.ts", method: "POST" },
  { path: "app/api/auth/callback/route.ts", method: "GET" },
  { path: "app/api/auth/logout/route.ts", method: "POST" },
  { path: "app/api/auth/sessions/route.ts", method: "GET" },
  { path: "app/api/auth/sessions/revoke/route.ts", method: "POST" },
  { path: "app/api/auth/me/route.ts", method: "GET" },
  { path: "app/api/auth/recovery/request/route.ts", method: "POST" },
  { path: "app/api/auth/recovery/confirm/route.ts", method: "POST" },
  { path: "app/api/auth/password/change/route.ts", method: "POST" },
];
let routesOk = ROUTES.length === 11;
for (const route of ROUTES) {
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
check("routes.all_eleven", routesOk);

// ---------------------------------------------------------------------------
// Pages: the six B surfaces exist and are metadata-complete.
// ---------------------------------------------------------------------------
const PAGES = [
  "app/(auth)/login/page.tsx",
  "app/(auth)/signup/page.tsx",
  "app/(auth)/forgot-password/page.tsx",
  "app/(auth)/reset-password/page.tsx",
  "app/(auth)/verify-email/page.tsx",
  "app/(dashboard)/account/page.tsx",
];
let pagesOk = true;
for (const page of PAGES) {
  try {
    const source = readFileSync(new URL(`../../../${page}`, import.meta.url), "utf8");
    if (!source.includes("export const metadata")) {
      pagesOk = false;
    }
  } catch {
    pagesOk = false;
  }
}
check("pages.six_registered", pagesOk);

// ---------------------------------------------------------------------------
// Navigation: every B route is in the map with a stable section.
// ---------------------------------------------------------------------------
const authPaths = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];
function navEntrySection(path) {
  const entryPattern = new RegExp(
    `path: "${path.replace("/", "\\/")}"[\\s\\S]{0,220}?section: "(\\w+)"`,
  );
  const match = navSource.match(entryPattern);
  return match === null ? null : match[1];
}
check(
  "nav.b_routes_registered",
  authPaths.every((path) => navEntrySection(path) === "auth") &&
    navEntrySection("/account") === "dashboard",
);

// ---------------------------------------------------------------------------
// Proxy: session refresh plus the fail-closed account guard.
// ---------------------------------------------------------------------------
check(
  "proxy.account_guard",
  // The account surface (and, from substep D, the 2FA/security surfaces)
  // fail closed to sign-in whenever no provider user resolves.
  proxySource.includes('["/account", "/mfa", "/security"]') &&
    proxySource.includes('loginUrl.pathname = "/login"') &&
    proxySource.includes("createServerClient"),
);
check(
  "proxy.matcher_unchanged",
  proxySource.includes(
    "(?!api|_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|design-tokens.json)",
  ),
);

// ---------------------------------------------------------------------------
// Migration 010: envelope extension, password history, approval status.
// ---------------------------------------------------------------------------
check(
  "migration010.up_objects",
  upSource.includes("create table app.password_history") &&
    upSource.includes("create unique index idx_auth_sessions_user_token") &&
    upSource.includes("create unique index idx_auth_devices_user_key") &&
    upSource.includes("'pending_approval'") &&
    upSource.includes("enable row level security") &&
    upSource.includes("force row level security"),
);
check(
  "migration010.down_reverses",
  downSource.includes("drop table if exists app.password_history") &&
    downSource.includes("drop index if exists app.idx_auth_sessions_user_token") &&
    downSource.includes("drop index if exists app.idx_auth_devices_user_key") &&
    downSource.includes("drop column if exists refresh_token_ciphertext"),
);

// ---------------------------------------------------------------------------
// Shared-shell repairs that Substep B surfaces depend on.
// ---------------------------------------------------------------------------
const buttonSource = readFileSync(
  new URL("../../../components/ui/button.tsx", import.meta.url),
  "utf8",
);
const appShellSource = readFileSync(
  new URL("../../../components/layout/app-shell.tsx", import.meta.url),
  "utf8",
);
const dashboardLayoutSource = readFileSync(
  new URL("../../../app/(dashboard)/layout.tsx", import.meta.url),
  "utf8",
);
const adminLayoutSource = readFileSync(
  new URL("../../../app/(admin)/layout.tsx", import.meta.url),
  "utf8",
);
// Radix Slot needs exactly one child: the spinner must never join the
// asChild children array.
// The asChild branch must hand Slot exactly `children` (never a spinner
// fragment), because Radix Slot merges a single child. Whitespace-tolerant so
// Prettier's line-wrapping cannot break the pin.
check(
  "button.aschild_single_child",
  /const slotChild = asChild \?\s*\(\s*children\s*\)\s*:/.test(buttonSource),
);
// Nav icons are functions: they must resolve client-side, never cross the
// server-to-client boundary from the layouts.
check(
  "nav.shell_serializable_boundary",
  dashboardLayoutSource.includes('sectionIds={["dashboard"]}') &&
    !dashboardLayoutSource.includes("getNavSection") &&
    adminLayoutSource.includes('sectionIds={["admin"]}') &&
    !adminLayoutSource.includes("getNavSection") &&
    appShellSource.includes("sectionIds.map((id) => getNavSection(id))") &&
    appShellSource.includes('"use client"'),
);

// ---------------------------------------------------------------------------
// Dependency record: the SSR package pin is documented.
// ---------------------------------------------------------------------------
const depRecord = readFileSync(
  new URL("../../../docs/dependency-records/0004-step-03b-auth.md", import.meta.url),
  "utf8",
);
check("dep_record.ssr_pin", depRecord.includes("@supabase/ssr") && depRecord.includes("0.12.7"));

const passed = checks.length - failures;
process.stdout.write(`\nstep-03b offline: ${passed}/${checks.length} checks passed\n`);
if (failures > 0) {
  process.exit(1);
}
