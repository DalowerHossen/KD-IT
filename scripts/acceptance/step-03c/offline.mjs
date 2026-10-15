// path: scripts/acceptance/step-03c/offline.mjs
// Step 03 substep C offline acceptance: approval-aware role resolution
// logic, membership schema round-trips, repository and working-context
// surfaces, team route and page artifacts, navigation registration, and
// membership command-kind registration. Runs without a database.

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

const roleResolution = await import("../../../lib/auth/role-resolution.ts");
const schemas = await import("../../../lib/auth/schemas.ts");
const workingContext = await import("../../../lib/auth/working-context.ts");
const membershipsRepo = await import("../../../lib/db/repositories/memberships.ts");
const companiesRepo = await import("../../../lib/db/repositories/companies.ts");
const commands = await import("../../../lib/commands/types.ts");
const navSource = readFileSync(new URL("../../../config/nav-map.ts", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Approval-aware role resolution: the role is conferred ONLY when the
// membership, the company, and the profile are all active.
// ---------------------------------------------------------------------------
const rr = roleResolution.resolveEffectiveRole;

check(
  "role.all_active_confers",
  rr({
    membership: { role: "owner", status: "active" },
    companyStatus: "active",
    profileStatus: "active",
  }) === "owner",
);
check(
  "role.platform_role_confers",
  rr({
    membership: { role: "admin_staff", status: "active" },
    companyStatus: "active",
    profileStatus: "active",
  }) === "admin_staff",
);
check(
  "role.invited_confers_none",
  rr({
    membership: { role: "owner", status: "invited" },
    companyStatus: "active",
    profileStatus: "active",
  }) === null,
);
check(
  "role.suspended_confers_none",
  rr({
    membership: { role: "owner", status: "suspended" },
    companyStatus: "active",
    profileStatus: "active",
  }) === null,
);
check(
  "role.revoked_confers_none",
  rr({
    membership: { role: "owner", status: "revoked" },
    companyStatus: "active",
    profileStatus: "active",
  }) === null,
);
check(
  "role.suspended_company_confers_none",
  rr({
    membership: { role: "owner", status: "active" },
    companyStatus: "suspended",
    profileStatus: "active",
  }) === null,
);
check(
  "role.archived_company_confers_none",
  rr({
    membership: { role: "owner", status: "active" },
    companyStatus: "archived",
    profileStatus: "active",
  }) === null,
);
check(
  "role.missing_company_confers_none",
  rr({
    membership: { role: "owner", status: "active" },
    companyStatus: null,
    profileStatus: "active",
  }) === null,
);
check(
  "role.pending_profile_confers_none",
  rr({
    membership: { role: "owner", status: "active" },
    companyStatus: "active",
    profileStatus: "pending_verification",
  }) === null,
);
check(
  "role.suspended_profile_confers_none",
  rr({
    membership: { role: "owner", status: "active" },
    companyStatus: "active",
    profileStatus: "suspended",
  }) === null,
);
check(
  "role.deactivated_profile_confers_none",
  rr({
    membership: { role: "owner", status: "active" },
    companyStatus: "active",
    profileStatus: "deactivated",
  }) === null,
);
check(
  "role.no_membership_confers_none",
  rr({ membership: null, companyStatus: "active", profileStatus: "active" }) === null,
);

// ---------------------------------------------------------------------------
// Membership schemas: request and execution contracts round-trip.
// ---------------------------------------------------------------------------
const UUID7 = "018f0000-0000-7000-8000-000000000001";
const UUID4 = "00000000-0000-4000-8000-000000000002";
check(
  "schemas.invite_request_roundtrip",
  schemas.inviteMemberRequestSchema.safeParse({
    userId: UUID4,
    role: "owner",
    reason: "Founding member",
  }).success &&
    !schemas.inviteMemberRequestSchema.safeParse({ userId: UUID4, role: "not_a_role" }).success &&
    !schemas.inviteMemberRequestSchema.safeParse({ userId: UUID4 }).success,
);
check(
  "schemas.update_role_request_roundtrip",
  schemas.updateMemberRoleRequestSchema.safeParse({
    membershipId: UUID7,
    role: "staff",
    expectedVersion: 3,
  }).success &&
    !schemas.updateMemberRoleRequestSchema.safeParse({
      membershipId: UUID7,
      role: "staff",
      expectedVersion: 0,
    }).success,
);
check(
  "schemas.suspend_request_roundtrip",
  schemas.suspendMemberRequestSchema.safeParse({
    membershipId: UUID7,
    expectedVersion: 1,
  }).success && !schemas.suspendMemberRequestSchema.safeParse({ membershipId: UUID7 }).success,
);
check(
  "schemas.execute_request_roundtrip",
  schemas.executeMemberCommandRequestSchema.safeParse({ commandId: UUID7 }).success &&
    !schemas.executeMemberCommandRequestSchema.safeParse({}).success,
);

// ---------------------------------------------------------------------------
// Repository + working-context surfaces.
// ---------------------------------------------------------------------------
check(
  "memberships_repo.surface",
  typeof membershipsRepo.listActiveMemberships === "function" &&
    typeof membershipsRepo.getMembership === "function" &&
    typeof membershipsRepo.listCompanyMembers === "function" &&
    typeof membershipsRepo.resolveEffectiveRoleFor === "function" &&
    typeof membershipsRepo.inviteMembership === "function" &&
    typeof membershipsRepo.updateMembershipRole === "function" &&
    typeof membershipsRepo.suspendMembership === "function",
);
check(
  "companies_repo.surface",
  typeof companiesRepo.getCompanyLifecycleStatus === "function" &&
    typeof companiesRepo.getOwnCompany === "function",
);
check(
  "working_context.surface",
  typeof workingContext.resolveWorkingContext === "function" &&
    typeof workingContext.requireWorkingContext === "function" &&
    typeof workingContext.workingContextForRoute === "function" &&
    workingContext.WORKING_COMPANY_HEADER === "x-kd-company",
);

// ---------------------------------------------------------------------------
// Command kinds: the three membership mutations are registered with the role
// matrix (invite is broader than role-change/suspend).
// ---------------------------------------------------------------------------
const INVITE = "admin.membership.invite";
const UPDATE = "admin.membership.update_role";
const SUSPEND = "admin.membership.suspend";
check(
  "commands.kinds_registered",
  commands.COMMAND_KINDS.includes(INVITE) &&
    commands.COMMAND_KINDS.includes(UPDATE) &&
    commands.COMMAND_KINDS.includes(SUSPEND),
);
check(
  "commands.matrix_invite_broader",
  commands.REQUIRED_COMMAND_ROLES[INVITE].includes("admin_staff") &&
    commands.REQUIRED_COMMAND_ROLES[UPDATE].includes("owner") &&
    !commands.REQUIRED_COMMAND_ROLES[UPDATE].includes("admin_staff") &&
    commands.REQUIRED_COMMAND_ROLES[SUSPEND].includes("owner"),
);

// ---------------------------------------------------------------------------
// Team API routes: five endpoints with the right method and runtime.
// ---------------------------------------------------------------------------
const TEAM_ROUTES = [
  { path: "app/api/company/members/route.ts", method: "GET" },
  { path: "app/api/company/members/invite/route.ts", method: "POST" },
  { path: "app/api/company/members/update-role/route.ts", method: "POST" },
  { path: "app/api/company/members/suspend/route.ts", method: "POST" },
  { path: "app/api/company/members/execute/route.ts", method: "POST" },
];
let routesOk = TEAM_ROUTES.length === 5;
for (const route of TEAM_ROUTES) {
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
    if (route.method === "POST" && !source.includes("assertSameOrigin(request)")) {
      routesOk = false;
    }
  } catch {
    routesOk = false;
  }
}
check("routes.five_team_endpoints", routesOk);

// ---------------------------------------------------------------------------
// Page + navigation.
// ---------------------------------------------------------------------------
let pageOk = true;
try {
  const source = readFileSync(
    new URL("../../../app/(dashboard)/team/page.tsx", import.meta.url),
    "utf8",
  );
  pageOk = source.includes("export const metadata");
} catch {
  pageOk = false;
}
check("page.team_registered", pageOk);

function navEntrySection(path) {
  const entryPattern = new RegExp(
    `path: "${path.replace("/", "\\/")}"[\\s\\S]{0,220}?section: "(\\w+)"`,
  );
  const match = navSource.match(entryPattern);
  return match === null ? null : match[1];
}
check("nav.team_registered", navEntrySection("/team") === "dashboard");

const passed = checks.length - failures;
process.stdout.write(`\nstep-03c offline: ${passed}/${checks.length} checks passed\n`);
if (failures > 0) {
  process.exit(1);
}
