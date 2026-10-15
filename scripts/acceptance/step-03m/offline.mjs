// path: scripts/acceptance/step-03m/offline.mjs
// Step 03 substep M offline acceptance: tenant custom domains.
// Verifies the domain table (migration 018), the pre-registered
// domain.request/domain.read/domain.verify permissions, the repository/service
// surface, the boundary schemas (domain normalization/validation), and the
// tenant + platform routes. Runs without a database; the live
// request -> list -> verify (token match / mismatch) round-trip is exercised
// by live.mjs when credentials exist.

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

const schemas = await import("../../../lib/auth/schemas.ts");
const domains = await import("../../../lib/company/domains.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig018 = read("../../../supabase/migrations/018_custom_domains.up.sql");
const mig018down = read("../../../supabase/migrations/018_custom_domains.down.sql");
const companyRouteSrc = read("../../../app/api/company/domains/route.ts");
const platformRouteSrc = read("../../../app/api/platform/domains/route.ts");
const verifyRouteSrc = read("../../../app/api/platform/domains/verify/route.ts");
const permissionsSrc = read("../../../lib/auth/permissions.ts");
const domainsModuleSrc = read("../../../lib/company/domains.ts");

// ---------------------------------------------------------------------------
// Storage: migration 018 custom domains.
// ---------------------------------------------------------------------------
check(
  "migration018.domains_table",
  mig018.includes("create table app.custom_domains (") &&
    mig018.includes("domain text not null check (char_length(btrim(domain)) between 4 and 253)") &&
    mig018.includes(
      "status text not null default 'pending' check (status in ('pending', 'verified', 'rejected'))",
    ) &&
    mig018.includes(
      "verification_token text not null check (char_length(btrim(verification_token)) between 16 and 64)",
    ),
);
check(
  "migration018.contract_and_scope",
  mig018.includes("id uuid primary key default app.uuid_v7()") &&
    mig018.includes("company_id uuid not null references app.companies (id) on delete restrict") &&
    mig018.includes("version integer not null default 1") &&
    mig018.includes("verified_at timestamptz null"),
);
check(
  "migration018.rls_grants_triggers",
  mig018.includes("enable row level security") &&
    mig018.includes("force row level security") &&
    mig018.includes("grant select, insert, update, delete on app.custom_domains to service_role") &&
    mig018.includes("create unique index idx_custom_domains_domain") &&
    mig018.includes("execute function app.touch_updated_at()") &&
    mig018.includes("execute function app.guard_optimistic_version()"),
);
check("migration018.rollback", mig018down.includes("drop table if exists app.custom_domains"));

// ---------------------------------------------------------------------------
// Pre-registered permissions (reuse, not new).
// ---------------------------------------------------------------------------
check(
  "domains.permissions_registered",
  permissionsSrc.includes('"domain.read"') &&
    permissionsSrc.includes('"domain.request"') &&
    permissionsSrc.includes('"domain.verify"') &&
    permissionsSrc.includes('"Verify custom domain ownership."'),
);

// ---------------------------------------------------------------------------
// Module surface.
// ---------------------------------------------------------------------------
check(
  "module.functions",
  typeof domains.requestDomain === "function" &&
    typeof domains.listDomains === "function" &&
    typeof domains.listPendingDomains === "function" &&
    typeof domains.verifyDomain === "function",
);
check(
  "module.scoping",
  domainsModuleSrc.includes("requireTenantContext(context)") &&
    domainsModuleSrc.includes("requirePlatformContext(context)") &&
    domainsModuleSrc.includes('requirePermission(context, "domain.request")') &&
    domainsModuleSrc.includes('requirePermission(context, "domain.verify")'),
);

// ---------------------------------------------------------------------------
// Boundary schemas.
// ---------------------------------------------------------------------------
const normalized = schemas.domainRequestSchema.parse({ domain: "  Billing.Example.COM  " });
check("schema.domain_normalized", normalized.domain === "billing.example.com", normalized.domain);
check(
  "schema.domain_rejects_invalid",
  schemas.domainRequestSchema.safeParse({ domain: "bad..domain" }).success === false &&
    schemas.domainRequestSchema.safeParse({ domain: "nodots" }).success === false &&
    schemas.domainRequestSchema.safeParse({ domain: "-lead.com" }).success === false,
);
check(
  "schema.verify_requires_fields",
  schemas.domainVerifySchema.safeParse({ domainId: "not-a-uuid" }).success === false &&
    schemas.domainVerifySchema.safeParse({ domainId: "01800000-0000-7000-8000-000000000001" })
      .success === false,
);

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------
check(
  "routes.tenant",
  companyRouteSrc.includes("listDomains") && companyRouteSrc.includes("requestDomain"),
);
check("routes.platform_list", platformRouteSrc.includes("listPendingDomains"));
check("routes.platform_verify", verifyRouteSrc.includes("verifyDomain"));

process.stdout.write(`\nstep-03m offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
