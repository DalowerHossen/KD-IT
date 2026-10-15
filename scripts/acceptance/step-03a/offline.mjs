// path: scripts/acceptance/step-03a/offline.mjs
// Step 03 substep A offline acceptance: role registry integrity, permission
// registry integrity and inheritance, shared schema strictness, typed error
// non-enumeration, route-contract evaluation, approval-kind registration,
// and auth subject hashing. Runs without a database; non-destructive and
// idempotent by design.

import { randomBytes } from "node:crypto";

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
process.env.KD_ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
process.env.KD_ENCRYPTION_KEY_VERSION = "1";

const roles = await import("../../../lib/auth/roles.ts");
const permissions = await import("../../../lib/auth/permissions.ts");
const schemas = await import("../../../lib/auth/schemas.ts");
const authErrors = await import("../../../lib/auth/errors.ts");
const routeAccess = await import("../../../lib/auth/route-access.ts");
const commands = await import("../../../lib/commands/types.ts");
const routeMetadata = await import("../../../lib/navigation/route-metadata.ts");
const subjectHash = await import("../../../lib/auth/subject-hash.ts");
const appErrors = await import("../../../lib/errors/app-errors.ts");

// ---------------------------------------------------------------------------
// Roles: exactly five, ordered, partitioned, single-sourced.
// ---------------------------------------------------------------------------
check("roles.count_five", roles.AUTH_ROLES.length === 5, roles.AUTH_ROLES.join(","));

const expectedOrder = ["super_admin", "ceo", "admin_staff", "owner", "staff"];
check(
  "roles.exact_order",
  expectedOrder.every((role, index) => roles.AUTH_ROLES[index] === role),
);

check(
  "roles.rank_monotonic",
  expectedOrder.every(
    (role, index) => index === 0 || roles.roleRank(expectedOrder[index - 1]) < roles.roleRank(role),
  ),
);

check(
  "roles.scope_partition",
  roles.PLATFORM_SCOPE_ROLES.length === 3 &&
    roles.TENANT_SCOPE_ROLES.length === 2 &&
    expectedOrder.every(
      (role) =>
        (roles.isPlatformRole(role) || roles.isTenantRole(role)) &&
        !(roles.isPlatformRole(role) && roles.isTenantRole(role)),
    ),
);

check(
  "roles.single_source",
  routeMetadata.ROLE_ORDER === roles.AUTH_ROLES && commands.PLATFORM_ROLES === roles.AUTH_ROLES,
  "navigation and command registries share the canonical role tuple",
);

check(
  "roles.bundles_seven",
  roles.ADMIN_STAFF_BUNDLES.length === 7 &&
    roles.ADMIN_STAFF_BUNDLES.every((bundle) => {
      const code = permissions.bundleGrantCode(bundle);
      return permissions.PERMISSION_CODES.includes(code);
    }),
);

// ---------------------------------------------------------------------------
// Permissions: registry integrity, inheritance, isolation, expansion.
// ---------------------------------------------------------------------------
const SQL_PERMISSION_SHAPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$/;

check("perms.count", permissions.PERMISSION_CODES.length === 51);

check(
  "perms.unique",
  new Set(permissions.PERMISSION_CODES).size === permissions.PERMISSION_CODES.length,
);

check(
  "perms.shape_matches_sql_check",
  permissions.PERMISSION_CODES.every((code) => SQL_PERMISSION_SHAPE.test(code)),
);

check(
  "perms.metadata_complete",
  permissions.PERMISSION_CODES.every((code) => {
    const meta = permissions.permissionMetadata(code);
    return (
      (meta.scope === "platform" || meta.scope === "tenant") && meta.description.trim().length > 0
    );
  }),
);

check(
  "perms.role_coverage",
  expectedOrder.every((role) => permissions.resolveRolePermissions(role).length > 0),
);

const staffPerms = permissions.resolveRolePermissions("staff");
const ownerPerms = permissions.resolveRolePermissions("owner");
const adminPerms = permissions.resolveRolePermissions("admin_staff");
const ceoPerms = permissions.resolveRolePermissions("ceo");
const superPerms = permissions.resolveRolePermissions("super_admin");

check(
  "perms.owner_inherits_staff",
  staffPerms.every((code) => ownerPerms.includes(code)),
);

check(
  "perms.ceo_inherits_admin_base",
  adminPerms.every((code) => ceoPerms.includes(code)),
);

check(
  "perms.super_admin_inherits_ceo",
  ceoPerms.every((code) => superPerms.includes(code)),
);

check(
  "perms.cross_scope_owner",
  ["approval.l3.decide", "security.account.unlock", "kyc.decide"].every(
    (code) => !ownerPerms.includes(code),
  ),
);

check(
  "perms.cross_scope_admin_staff",
  ["team.invite", "company.profile.update", "kyc.review"].every(
    (code) => !adminPerms.includes(code),
  ),
);

check(
  "perms.staff_least_privilege",
  ["team.invite", "company.settings.update", "smtp.tenant.manage"].every(
    (code) => !staffPerms.includes(code),
  ),
);

check(
  "perms.bundle_expansion",
  (() => {
    const expanded = permissions.expandBundlePermissions(["bundle.kyc_reviewer"]);
    const empty = permissions.expandBundlePermissions(["bundle.content_manager"]);
    return (
      expanded.length === 2 &&
      expanded.includes("kyc.review") &&
      expanded.includes("kyc.admin.read") &&
      empty.length === 0
    );
  })(),
);

check(
  "perms.subject_resolution",
  (() => {
    const input = {
      role: "staff",
      explicitGrants: ["team.invite", "bundle.fraud_analyst"],
    };
    const first = permissions.resolveSubjectPermissions(input);
    const second = permissions.resolveSubjectPermissions(input);
    return (
      first.includes("team.invite") &&
      first.includes("security.timeline.read") &&
      first.length === second.length &&
      first.every((code, index) => code === second[index])
    );
  })(),
);

check(
  "perms.schema_roundtrip",
  permissions.permissionSchema.safeParse("team.invite").success &&
    !permissions.permissionSchema.safeParse("team.destroy").success &&
    !permissions.permissionSchema.safeParse("").success &&
    !permissions.permissionSchema.safeParse(42).success,
);

check(
  "perms.smtp_test_shared",
  ["owner", "ceo", "super_admin"].every((role) =>
    permissions.resolveRolePermissions(role).includes("smtp.test"),
  ),
);

check(
  "perms.no_wildcards",
  permissions.PERMISSION_CODES.every((code) => !code.includes("*") && !code.includes(":")),
);

// ---------------------------------------------------------------------------
// Schemas: strict shared contracts on both boundaries.
// ---------------------------------------------------------------------------
const SAMPLE_V7 = "01930000-0000-7000-8000-000000000001";
const SAMPLE_V7_B = "01930000-0000-7000-8000-000000000002";
const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

check(
  "schemas.grant_input_valid",
  schemas.grantPermissionInputSchema.safeParse({
    companyId: SAMPLE_V7,
    subjectUserId: SAMPLE_V7_B,
    permission: "team.invite",
    commandId: SAMPLE_V7,
    validUntil: FUTURE,
    reason: "Cover support rotation.",
  }).success,
);

check(
  "schemas.grant_input_strict",
  !schemas.grantPermissionInputSchema.safeParse({
    companyId: SAMPLE_V7,
    subjectUserId: SAMPLE_V7_B,
    permission: "team.invite",
    commandId: SAMPLE_V7,
    isSuperuser: true,
  }).success &&
    !schemas.grantPermissionInputSchema.safeParse({
      companyId: "not-a-uuid",
      subjectUserId: SAMPLE_V7_B,
      permission: "team.invite",
      commandId: SAMPLE_V7,
    }).success &&
    !schemas.grantPermissionInputSchema.safeParse({
      companyId: SAMPLE_V7,
      subjectUserId: SAMPLE_V7_B,
      permission: "team.destroy",
      commandId: SAMPLE_V7,
    }).success,
);

check(
  "schemas.assign_role_roundtrip",
  schemas.assignRoleInputSchema.safeParse({
    companyId: SAMPLE_V7,
    subjectUserId: SAMPLE_V7_B,
    role: "staff",
    commandId: SAMPLE_V7,
    expectedVersion: 3,
  }).success &&
    !schemas.assignRoleInputSchema.safeParse({
      companyId: SAMPLE_V7,
      subjectUserId: SAMPLE_V7_B,
      role: "accountant",
      commandId: SAMPLE_V7,
      expectedVersion: 3,
    }).success,
);

check(
  "schemas.row_rejects_unknown",
  !schemas.profileRowSchema.safeParse({
    id: SAMPLE_V7,
    company_id: SAMPLE_V7,
    created_at: FUTURE,
    updated_at: FUTURE,
    deleted_at: null,
    version: 1,
    user_id: SAMPLE_V7_B,
    display_name: "Ada",
    status: "active",
    status_reason: null,
    deactivated_at: null,
    nickname: "root",
  }).success,
);

check(
  "schemas.factor_outcome_enums",
  schemas.authFactorSchema.safeParse("totp").success &&
    !schemas.authFactorSchema.safeParse("sms").success &&
    schemas.authOutcomeSchema.safeParse("failure").success &&
    !schemas.authOutcomeSchema.safeParse("locked").success,
);

// ---------------------------------------------------------------------------
// Errors: typed, generic, non-enumerating.
// ---------------------------------------------------------------------------
const LEAK_MARKERS = [
  "super_admin",
  "ceo",
  "admin_staff",
  "owner",
  "staff",
  "team.invite",
  "exists",
  "@",
  "permission `",
];
const errorInstances = [
  new authErrors.AuthenticationRequiredError(),
  new authErrors.AuthorizationError(),
  new authErrors.ApprovalRequiredError(),
  new authErrors.StepUpRequiredError(),
];

check(
  "errors.generic_and_typed",
  errorInstances.every(
    (error) =>
      error instanceof appErrors.AppError &&
      LEAK_MARKERS.every((marker) => !error.toPublicMessage().includes(marker)),
  ),
);

check(
  "errors.status_codes",
  errorInstances[0].httpStatus === 401 &&
    errorInstances[1].httpStatus === 403 &&
    errorInstances[2].httpStatus === 403 &&
    errorInstances[3].httpStatus === 403,
);

// ---------------------------------------------------------------------------
// Route contracts: explicit role and permission evaluation.
// ---------------------------------------------------------------------------
const publicRoute = {
  path: "/",
  title: "Home",
  description: "Public home.",
  section: "public",
  showInNav: true,
};
const teamRoute = {
  path: "/settings/team",
  title: "Team",
  description: "Team management.",
  section: "dashboard",
  showInNav: true,
  access: { roles: ["owner"], permissions: ["team.invite"] },
};

check(
  "routes.public_open",
  routeAccess.evaluateRouteAccess({ role: null, permissions: [], route: publicRoute }).allowed ===
    true,
);

check(
  "routes.role_exact",
  routeAccess.evaluateRouteAccess({ role: "staff", permissions: [], route: teamRoute }).denial ===
    "role_mismatch" &&
    routeAccess.evaluateRouteAccess({
      role: "owner",
      permissions: ["team.invite"],
      route: teamRoute,
    }).allowed === true,
);

check(
  "routes.permission_gate",
  routeAccess.evaluateRouteAccess({ role: "owner", permissions: [], route: teamRoute }).denial ===
    "permission_missing",
);

check(
  "routes.anonymous_denied",
  routeAccess.evaluateRouteAccess({ role: null, permissions: [], route: teamRoute }).denial ===
    "anonymous",
);

check(
  "routes.filter",
  routeAccess.filterAccessibleRoutes({
    role: "staff",
    permissions: [],
    routes: [publicRoute, teamRoute],
  }).length === 1,
);

// ---------------------------------------------------------------------------
// Approval engine: Step 03 kinds registered with scoped role matrix.
// ---------------------------------------------------------------------------
const SQL_KIND_SHAPE = /^[a-z][a-z0-9_.]{1,80}$/;

// Step 03 substep B extends the registry with auth.account.activate (22 -> 23).
check("commands.step03_count", commands.STEP_03_COMMAND_KINDS.length === 23);

check(
  "commands.step03_registered",
  commands.STEP_03_COMMAND_KINDS.every((kind) => commands.COMMAND_KINDS.includes(kind)),
);

check(
  "commands.matrix_complete",
  commands.COMMAND_KINDS.every((kind) => {
    const entry = commands.REQUIRED_COMMAND_ROLES[kind];
    return (
      Array.isArray(entry) &&
      entry.length > 0 &&
      entry.every((role) => roles.authRoleSchema.safeParse(role).success)
    );
  }),
);

check(
  "commands.matrix_no_extra",
  Object.keys(commands.REQUIRED_COMMAND_ROLES).length === commands.COMMAND_KINDS.length &&
    Object.keys(commands.REQUIRED_COMMAND_ROLES).every((kind) =>
      commands.COMMAND_KINDS.includes(kind),
    ),
);

check(
  "commands.kind_shape_matches_sql",
  commands.COMMAND_KINDS.every((kind) => SQL_KIND_SHAPE.test(kind)),
);

check(
  "commands.step03_roles_scoped",
  (() => {
    const unlock = commands.REQUIRED_COMMAND_ROLES["auth.account.unlock"];
    const submit = commands.REQUIRED_COMMAND_ROLES["kyc.application.submit"];
    return (
      unlock.length === 2 &&
      unlock.includes("super_admin") &&
      unlock.includes("ceo") &&
      submit.length === 1 &&
      submit[0] === "owner"
    );
  })(),
);

check(
  "commands.standing_scope_schema",
  commands.standingGrantScopeSchema.safeParse("team:*").success &&
    !commands.standingGrantScopeSchema.safeParse("Team Roster").success,
);

// ---------------------------------------------------------------------------
// Subject hashing: stable, normalized, invalid-rejecting HMAC identity.
// ---------------------------------------------------------------------------
check(
  "subject.deterministic",
  subjectHash.authSubjectHash("Ada@Example.com") === subjectHash.authSubjectHash("ada@example.com"),
);

check(
  "subject.normalized",
  subjectHash.authSubjectHash("  ADA@EXAMPLE.COM  ") ===
    subjectHash.authSubjectHash("ada@example.com"),
);

check(
  "subject.distinct_hex",
  (() => {
    const first = subjectHash.authSubjectHash("ada@example.com");
    const second = subjectHash.authSubjectHash("bob@example.com");
    return first !== second && /^[0-9a-f]{64}$/.test(first);
  })(),
);

check(
  "subject.rejects_invalid",
  (() => {
    try {
      subjectHash.authSubjectHash("not-an-email");
      return false;
    } catch {
      return true;
    }
  })(),
);

if (failures > 0) {
  process.stdout.write(`step-03a offline: FAILED (${failures} failing checks)\n`);
  process.exit(1);
}
process.stdout.write(`step-03a offline: all ${checks.length} checks passed\n`);
