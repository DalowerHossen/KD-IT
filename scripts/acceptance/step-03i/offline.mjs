// path: scripts/acceptance/step-03i/offline.mjs
// Step 03 substep I offline acceptance: tenant provisioning (company onboarding
// + plans & entitlements). Verifies the plan catalog (migration 014, seeded
// plans, USD numeric price, entitlement array, platform scope), the plans
// repository, the server-side entitlement engine (platform-exempt), the
// approval-gated company onboarding flow (propose + atomic execute), the
// platform routes, the command kind gating, and the entitlement guard wired
// into member invites. Runs without a database; the live provisioning
// round-trip is exercised by live.mjs when credentials exist.

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

const plans = await import("../../../lib/company/plans.ts");
const entitlements = await import("../../../lib/company/entitlements.ts");
const onboarding = await import("../../../lib/company/onboarding.ts");
const schemas = await import("../../../lib/auth/schemas.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig014 = read("../../../supabase/migrations/014_plans_entitlements.up.sql");
const mig014down = read("../../../supabase/migrations/014_plans_entitlements.down.sql");
const createRouteSrc = read("../../../app/api/platform/companies/create/route.ts");
const executeRouteSrc = read("../../../app/api/platform/companies/execute/route.ts");
const plansRouteSrc = read("../../../app/api/platform/plans/route.ts");
const commandsTypesSrc = read("../../../lib/commands/types.ts");
const membershipsSrc = read("../../../lib/db/repositories/memberships.ts");

// ---------------------------------------------------------------------------
// Storage: migration 014 plan catalog.
// ---------------------------------------------------------------------------
check(
  "migration014.plans_table",
  mig014.includes("create table app.plans (") &&
    mig014.includes("price numeric(18,4) not null check (price >= 0)") &&
    mig014.includes("billing_period text not null check (billing_period in ('month', 'year'))") &&
    mig014.includes("max_members integer not null check (max_members >= 1)") &&
    mig014.includes("entitlements jsonb not null default '[]'::jsonb") &&
    mig014.includes("jsonb_typeof(entitlements) = 'array'"),
);
check(
  "migration014.platform_scope",
  mig014.includes("constraint plans_platform_scope check (company_id = app.platform_company_id())"),
);
check(
  "migration014.seeded_plans",
  mig014.includes("'Starter'") &&
    mig014.includes("'Professional'") &&
    mig014.includes('"notifications"') &&
    mig014.includes('"backups"'),
);
check(
  "migration014.rls_grants_triggers",
  mig014.includes("enable row level security") &&
    mig014.includes("force row level security") &&
    mig014.includes("grant select, insert, update, delete on app.plans to service_role") &&
    mig014.includes("execute function app.touch_updated_at()") &&
    mig014.includes("execute function app.guard_optimistic_version()"),
);
check("migration014.rollback", mig014down.includes("drop table if exists app.plans"));

// ---------------------------------------------------------------------------
// Plans repository: canonical decimal price validation.
// ---------------------------------------------------------------------------
check(
  "plans.price_validation",
  plans.createPlanInputSchema.safeParse({
    name: "Test",
    price: "49.00",
    billingPeriod: "month",
    storageQuotaBytes: 1024,
    maxMembers: 5,
    entitlements: ["team"],
  }).success === true &&
    plans.createPlanInputSchema.safeParse({
      name: "Test",
      price: "49.00001",
      billingPeriod: "month",
      storageQuotaBytes: 1024,
      maxMembers: 5,
      entitlements: ["team"],
    }).success === false &&
    plans.createPlanInputSchema.safeParse({
      name: "Test",
      price: "-1",
      billingPeriod: "month",
      storageQuotaBytes: 1024,
      maxMembers: 5,
      entitlements: ["team"],
    }).success === false,
);
check(
  "plans.repo_functions",
  typeof plans.listPlans === "function" &&
    typeof plans.getPlan === "function" &&
    typeof plans.createPlan === "function",
);

// ---------------------------------------------------------------------------
// Entitlement engine: the server-side guard surface.
// ---------------------------------------------------------------------------
check(
  "entitlements.gate_functions",
  typeof entitlements.requireEntitlement === "function" &&
    typeof entitlements.planForCompany === "function" &&
    typeof entitlements.entitlementsForCompany === "function" &&
    typeof entitlements.maxMembersForCompany === "function" &&
    typeof entitlements.assertMemberCapacity === "function",
);
check(
  "entitlements.platform_exempt",
  read("../../../lib/company/entitlements.ts").includes("PLATFORM_COMPANY_ID"),
);

// ---------------------------------------------------------------------------
// Company onboarding: propose + atomic execute, command-gated.
// ---------------------------------------------------------------------------
check(
  "onboarding.flow_functions",
  typeof onboarding.proposeCompanyCreation === "function" &&
    typeof onboarding.executeCompanyCreation === "function",
);
check(
  "onboarding.command_gating",
  commandsTypesSrc.includes('"admin.company.create"') &&
    commandsTypesSrc.includes('"admin.company.create": ["super_admin", "ceo"]'),
);
check(
  "onboarding.atomic_execute",
  read("../../../lib/company/onboarding.ts").includes("withPgTransaction") &&
    read("../../../lib/company/onboarding.ts").includes("assertApprovedCommandFor") &&
    read("../../../lib/company/onboarding.ts").includes("executeCommand"),
);
const onboardingSrc = read("../../../lib/company/onboarding.ts");
check(
  "onboarding.owner_binding",
  onboardingSrc.includes("app.profiles") &&
    onboardingSrc.includes("'owner', 'active'") &&
    onboardingSrc.includes("activated_at"),
);

// ---------------------------------------------------------------------------
// Routes, schemas, and the invite-flow entitlement guard.
// ---------------------------------------------------------------------------
check(
  "routes.company_provisioning",
  createRouteSrc.includes("proposeCompanyCreation") &&
    executeRouteSrc.includes("executeCompanyCreation") &&
    executeRouteSrc.includes('command.status !== "approved"') &&
    plansRouteSrc.includes("listPlans") &&
    plansRouteSrc.includes("createPlan"),
);
check(
  "schemas.company_create",
  typeof schemas.companyCreateInputSchema === "object" &&
    typeof schemas.executeCompanyCommandRequestSchema === "object" &&
    schemas.companyCreateInputSchema.safeParse({
      legalName: "Acme Ltd",
      displayName: "Acme",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
    }).success === true,
);
check(
  "invite.entitlement_guard_wired",
  membershipsSrc.includes("assertMemberCapacity") &&
    membershipsSrc.includes("Substep I: server-side entitlement guard"),
);

process.stdout.write(`\nstep-03i offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
