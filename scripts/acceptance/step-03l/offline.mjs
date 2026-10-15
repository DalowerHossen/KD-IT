// path: scripts/acceptance/step-03l/offline.mjs
// Step 03 substep L offline acceptance: tenant profile and invoice settings.
// Verifies the two settings tables (migration 017), the pre-registered
// company.profile.*/company.settings.update permissions, the repository/service
// surface, the boundary schemas (required fields, trimming, canonical tax rate),
// the optimistic-version guard, and the routes. Runs without a database; the
// live read/update/optimistic round-trip is exercised by live.mjs when
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

const schemas = await import("../../../lib/auth/schemas.ts");
const profile = await import("../../../lib/company/profile.ts");
const invoice = await import("../../../lib/company/invoice-settings.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig017 = read("../../../supabase/migrations/017_tenant_settings.up.sql");
const mig017down = read("../../../supabase/migrations/017_tenant_settings.down.sql");
const profileRouteSrc = read("../../../app/api/company/profile/route.ts");
const invoiceRouteSrc = read("../../../app/api/company/invoice-settings/route.ts");
const profileModuleSrc = read("../../../lib/company/profile.ts");
const invoiceModuleSrc = read("../../../lib/company/invoice-settings.ts");
const permissionsSrc = read("../../../lib/auth/permissions.ts");

// ---------------------------------------------------------------------------
// Storage: migration 017 settings tables.
// ---------------------------------------------------------------------------
check(
  "migration017.profile_table",
  mig017.includes("create table app.company_profiles (") &&
    mig017.includes("tagline text null") &&
    mig017.includes("timezone text not null default 'UTC'") &&
    mig017.includes("locale text not null default 'en'"),
);
check(
  "migration017.invoice_table",
  mig017.includes("create table app.company_invoice_settings (") &&
    mig017.includes(
      "tax_rate numeric(18,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100)",
    ) &&
    mig017.includes(
      "default_due_days integer not null default 30 check (default_due_days between 1 and 365)",
    ),
);
check(
  "migration017.contract_rls_triggers",
  (
    mig017.match(/company_id uuid not null references app.companies \(id\) on delete restrict/g) ||
    []
  ).length >= 2 &&
    (mig017.match(/enable row level security/g) || []).length >= 2 &&
    (mig017.match(/force row level security/g) || []).length >= 2 &&
    (mig017.match(/execute function app.guard_optimistic_version\(\)/g) || []).length >= 2 &&
    (
      mig017.match(
        /grant select, insert, update, delete on app\.(company_profiles|company_invoice_settings) to service_role/g,
      ) || []
    ).length >= 2,
);
check(
  "migration017.rollback",
  mig017down.includes("drop table if exists app.company_profiles") &&
    mig017down.includes("drop table if exists app.company_invoice_settings"),
);

// ---------------------------------------------------------------------------
// Pre-registered permissions (reuse, not new) held by the owner.
// ---------------------------------------------------------------------------
check(
  "settings.permissions_registered",
  permissionsSrc.includes('"company.profile.read"') &&
    permissionsSrc.includes('"company.profile.update"') &&
    permissionsSrc.includes('"company.settings.update"') &&
    permissionsSrc.includes('"company.profile.read",') &&
    permissionsSrc.includes('"company.settings.update",'),
);

// ---------------------------------------------------------------------------
// Module surface.
// ---------------------------------------------------------------------------
check(
  "module.profile_functions",
  typeof profile.getCompanyProfile === "function" &&
    typeof profile.updateCompanyProfile === "function",
);
check(
  "module.invoice_functions",
  typeof invoice.getInvoiceSettings === "function" &&
    typeof invoice.updateInvoiceSettings === "function",
);
check(
  "module.optimistic_guard",
  profileModuleSrc.includes("version = $2") && invoiceModuleSrc.includes("version = $2"),
);
check(
  "invoice.taxrate_guard",
  invoiceModuleSrc.includes("usdToDecimal(v.taxRate).gt(100)") &&
    mig017.includes("tax_rate <= 100"),
);

// ---------------------------------------------------------------------------
// Boundary schemas.
// ---------------------------------------------------------------------------
const profileFull = {
  tagline: "  hello  ",
  logoUrl: null,
  website: null,
  contactName: null,
  contactEmail: null,
  addressLine1: null,
  city: "Dhaka",
  region: null,
  postalCode: null,
  country: null,
  timezone: "Asia/Dhaka",
  locale: "en",
};
const parsedProfile = schemas.companyProfileUpdateSchema.parse(profileFull);
check(
  "schema.profile_trims_and_reads",
  parsedProfile.tagline === "hello" && parsedProfile.timezone === "Asia/Dhaka",
);
const missingTimezone = { ...profileFull };
delete missingTimezone.timezone;
check(
  "schema.profile_requires_timezone",
  schemas.companyProfileUpdateSchema.safeParse(missingTimezone).success === false,
);

const invoiceFull = {
  invoiceNumberPrefix: "INV",
  issueFromName: "KD Solution",
  issueFromEmail: null,
  logoUrl: null,
  taxRate: "5",
  paymentInstructions: null,
  terms: null,
  footer: null,
  defaultDueDays: 45,
};
const parsedInvoice = schemas.invoiceSettingsUpdateSchema.parse(invoiceFull);
check(
  "schema.invoice_taxrate_canonical",
  parsedInvoice.taxRate === "5.0000" && parsedInvoice.invoiceNumberPrefix === "INV",
);
const missingDays = { ...invoiceFull };
delete missingDays.defaultDueDays;
check(
  "schema.invoice_requires_duedays",
  schemas.invoiceSettingsUpdateSchema.safeParse(missingDays).success === false,
);

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------
check(
  "routes.profile",
  profileRouteSrc.includes("getCompanyProfile") && profileRouteSrc.includes("updateCompanyProfile"),
);
check(
  "routes.invoice",
  invoiceRouteSrc.includes("getInvoiceSettings") &&
    invoiceRouteSrc.includes("updateInvoiceSettings"),
);

process.stdout.write(`\nstep-03l offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
