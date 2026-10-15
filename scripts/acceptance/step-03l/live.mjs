// path: scripts/acceptance/step-03l/live.mjs
// Step 03 substep L live acceptance: verifies the tenant profile and invoice
// settings data plane against a real database for a throwaway workspace. Reads
// back defaults, writes (insert), reads back the update, performs a second
// optimistic update, rejects a stale expectedVersion, and rejects an over-100
// tax rate. Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
// KD_DATABASE_URL; skips cleanly when absent. Test rows are cleaned up (the
// throwaway company itself is left in place because its audit events are
// append-only, matching the other live suites).

import { randomUUID } from "node:crypto";
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

const profileModule = await import("../../../lib/company/profile.ts");
const invoiceModule = await import("../../../lib/company/invoice-settings.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");

const OPERATOR = "22222222-2222-2222-2222-222222222222";
const profilePayload = {
  tagline: "Test tagline",
  logoUrl: null,
  website: null,
  contactName: "KD Team",
  contactEmail: "hello@kd.example",
  addressLine1: "123 Test Street",
  city: "Dhaka",
  region: "Dhaka Division",
  postalCode: "1207",
  country: "Bangladesh",
  timezone: "Asia/Dhaka",
  locale: "en",
};
const invoicePayload = {
  invoiceNumberPrefix: "INV",
  issueFromName: "KD Solution",
  issueFromEmail: "billing@kd.example",
  logoUrl: null,
  taxRate: "5.0000",
  paymentInstructions: "Bank transfer",
  terms: "Net 30",
  footer: "Thank you",
  defaultDueDays: 45,
};

let db;
let companyId;
let context;
try {
  db = await connect();
  check("live.db_reachable", (await db.query("select 1 as ok")).rows[0]?.ok === 1);

  const tables = await db.query(
    `select tablename from pg_tables
      where schemaname = 'app' and tablename in ('company_profiles', 'company_invoice_settings')`,
  );
  check("live.tables_exist", tables.rows.length === 2);

  companyId = (
    await db.query(
      `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
         values (app.platform_company_id(), 'J Profile Co', 'J Profile', false, '{}') returning id`,
    )
  ).rows[0].id;
  context = tenant.makeTenantContext({
    companyId,
    userId: OPERATOR,
    role: "owner",
    correlationId: randomUUID(),
  });
  // The company itself cannot be deleted while its (append-only) audit events
  // exist; its settings rows are removed below.
  db.query(`delete from app.company_invoice_settings where company_id = $1`, [companyId]).catch(
    () => {},
  );
  db.query(`delete from app.company_profiles where company_id = $1`, [companyId]).catch(() => {});

  const defaultsProfile = await profileModule.getCompanyProfile(context);
  check(
    "live.profile_defaults",
    defaultsProfile.displayName === "J Profile" &&
      defaultsProfile.legalName === "J Profile Co" &&
      defaultsProfile.timezone === "UTC" &&
      defaultsProfile.locale === "en" &&
      defaultsProfile.version === null,
    JSON.stringify(defaultsProfile),
  );

  const createdProfile = await profileModule.updateCompanyProfile(context, profilePayload);
  check(
    "live.profile_insert",
    createdProfile.tagline === "Test tagline" &&
      createdProfile.city === "Dhaka" &&
      createdProfile.version === 1,
    JSON.stringify({ tagline: createdProfile.tagline, version: createdProfile.version }),
  );

  const rereadProfile = await profileModule.getCompanyProfile(context);
  check(
    "live.profile_persists",
    rereadProfile.tagline === "Test tagline" && rereadProfile.version === 1,
  );

  const secondProfile = await profileModule.updateCompanyProfile(context, {
    ...profilePayload,
    tagline: "Updated tagline",
  });
  check("live.profile_update_bumps_version", secondProfile.version === 2);

  let staleThrew = false;
  try {
    await profileModule.updateCompanyProfile(context, { ...profilePayload, expectedVersion: 1 });
  } catch {
    staleThrew = true;
  }
  check("live.profile_stale_version_rejected", staleThrew);

  const defaultsInvoice = await invoiceModule.getInvoiceSettings(context);
  check(
    "live.invoice_defaults",
    defaultsInvoice.taxRate === "0.0000" &&
      defaultsInvoice.defaultDueDays === 30 &&
      defaultsInvoice.version === null,
    JSON.stringify(defaultsInvoice),
  );

  const createdInvoice = await invoiceModule.updateInvoiceSettings(context, invoicePayload);
  check(
    "live.invoice_insert",
    createdInvoice.taxRate === "5.0000" &&
      createdInvoice.invoiceNumberPrefix === "INV" &&
      createdInvoice.defaultDueDays === 45 &&
      createdInvoice.version === 1,
    JSON.stringify({ taxRate: createdInvoice.taxRate, version: createdInvoice.version }),
  );

  const rereadInvoice = await invoiceModule.getInvoiceSettings(context);
  check(
    "live.invoice_persists",
    rereadInvoice.taxRate === "5.0000" && rereadInvoice.issueFromName === "KD Solution",
  );

  let taxTooHighThrew = false;
  try {
    await invoiceModule.updateInvoiceSettings(context, { ...invoicePayload, taxRate: "150.0000" });
  } catch {
    taxTooHighThrew = true;
  }
  check("live.invoice_taxrate_over_100_rejected", taxTooHighThrew);
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  if (companyId) {
    await db
      .query(`delete from app.company_invoice_settings where company_id = $1`, [companyId])
      .catch(() => {});
    await db
      .query(`delete from app.company_profiles where company_id = $1`, [companyId])
      .catch(() => {});
  }
  if (db) {
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
