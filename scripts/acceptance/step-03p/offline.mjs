// path: scripts/acceptance/step-03p/offline.mjs
// Step 03 substep P offline acceptance: the settings UI.
// Verifies the seven settings pages (hub + profile, invoice, domains, backups,
// kyc, notifications) exist and render their client components; the settings
// components + shared field helpers exist and reuse the auth-client fetch
// envelope (getAuth/postAuth + groupIssuesByField) with loading/error/empty
// states; the `settings` i18n section is complete; every settings route is
// registered in the navigation map (hub visible, sub-routes for breadcrumbs);
// and the new tenant file-upload route is wired to the Step 02 storage
// pipeline (same-origin guard, working context, category schema, encrypted
// upload, size cap). Runs without a database; the live files-upload +
// settings-read smoke is exercised by live.mjs when credentials exist.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const checks = [];
let failures = 0;

function check(id, outcome, detail) {
  checks.push({ id, outcome });
  if (outcome !== true) {
    failures += 1;
  }
  process.stdout.write(
    `${outcome === true ? "PASS" : "FAIL"} ${id}${detail === undefined ? "" : `: ${detail}`}\n`,
  );
}

function tryRead(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pages: each exists and renders its client component.
// ---------------------------------------------------------------------------
const PAGES = [
  ["app/(dashboard)/settings/page.tsx", "SettingsIndex"],
  ["app/(dashboard)/settings/profile/page.tsx", "ProfileForm"],
  ["app/(dashboard)/settings/invoice/page.tsx", "InvoiceSettingsForm"],
  ["app/(dashboard)/settings/domains/page.tsx", "DomainsPanel"],
  ["app/(dashboard)/settings/backups/page.tsx", "BackupsPanel"],
  ["app/(dashboard)/settings/kyc/page.tsx", "KycPanel"],
  ["app/(dashboard)/settings/notifications/page.tsx", "NotificationsPanel"],
];
for (const [file, component] of PAGES) {
  const src = tryRead(file);
  check(
    `page.${component}`,
    src !== null && src.includes(component) && src.includes("metadata: Metadata"),
  );
}

// ---------------------------------------------------------------------------
// Components: exist + reuse the auth-client fetch envelope with states.
// ---------------------------------------------------------------------------
const FORMS = [
  "components/settings/profile-form.tsx",
  "components/settings/invoice-settings-form.tsx",
];
const PANELS = [
  "components/settings/domains-panel.tsx",
  "components/settings/backups-panel.tsx",
  "components/settings/kyc-panel.tsx",
  "components/settings/notifications-panel.tsx",
];
const SHARED = ["components/settings/field.tsx", "components/settings/settings-index.tsx"];

for (const file of [...FORMS, ...PANELS]) {
  const src = tryRead(file);
  const isForm = FORMS.includes(file);
  const usesAuth =
    src !== null &&
    src.includes(`from "@/components/auth/auth-client"`) &&
    src.includes("getAuth<") &&
    src.includes("AuthRequestError");
  const hasStates = src !== null && src.includes('role="status"') && src.includes('role="alert"');
  const usesMutate = isForm && src.includes("postAuth<") && src.includes("groupIssuesByField");
  check(`component.${path.basename(file)}`, usesAuth && hasStates && (!isForm || usesMutate));
}
for (const file of SHARED) {
  check(`component.${path.basename(file)}`, tryRead(file) !== null);
}

// The settings components carry the client directive.
const clientDirectives = [...FORMS, ...PANELS].every((file) =>
  /^"use client";$/m.test(tryRead(file) ?? ""),
);
check("components.use_client", clientDirectives);

// ---------------------------------------------------------------------------
// i18n: the `settings` section is complete.
// ---------------------------------------------------------------------------
const i18n = tryRead("lib/i18n/strings/en.ts") ?? "";
const settingsSection = i18n.match(/settings: \{[\s\S]*?\n  \},/)?.[0] ?? "";
const requiredSettingKeys = [
  "index:",
  "common:",
  "profile:",
  "invoice:",
  "domains:",
  "backups:",
  "kyc:",
  "notifications:",
  "businessTypes:",
  "riskLevels:",
];
check("i18n.settings_section", i18n.includes("settings: {"));
for (const key of requiredSettingKeys) {
  check(`i18n.settings.${key.replace(/[:]/g, "")}`, settingsSection.includes(key));
}
check(
  "i18n.settings.business_types",
  settingsSection.includes("sole_proprietorship") &&
    settingsSection.includes("partnership") &&
    settingsSection.includes("llc") &&
    settingsSection.includes("corporation") &&
    settingsSection.includes("non_profit") &&
    settingsSection.includes("other"),
);
check(
  "i18n.settings.risk_levels",
  settingsSection.includes("low") &&
    settingsSection.includes("medium") &&
    settingsSection.includes("high"),
);
check(
  "i18n.settings.no_non_ascii",
  [...settingsSection].every((ch) => ch.charCodeAt(0) < 0x80),
);

// ---------------------------------------------------------------------------
// Navigation: every settings route is registered (hub visible, subs for palette/breadcrumbs).
// ---------------------------------------------------------------------------
const navMap = tryRead("config/nav-map.ts") ?? "";
const navPaths = [
  "/settings",
  "/settings/profile",
  "/settings/invoice",
  "/settings/domains",
  "/settings/backups",
  "/settings/kyc",
  "/settings/notifications",
];
for (const p of navPaths) {
  check(`nav.${p.replace(/\//g, "_") || "root"}`, navMap.includes(`path: "${p}"`));
}
const hubVisible = /path: "\/settings",[\s\S]*?showInNav: true/.test(navMap);
const subHidden = navPaths
  .slice(1)
  .every((p) => new RegExp(`path: "${p}",[\\s\\S]*?showInNav: false`).test(navMap));
check("nav.hub_visible", hubVisible);
check("nav.subs_hidden", subHidden);

// ---------------------------------------------------------------------------
// Tenant file-upload route: wired to the Step 02 storage pipeline.
// ---------------------------------------------------------------------------
const filesRoute = tryRead("app/api/company/files/route.ts") ?? "";
check("files_route.exists", filesRoute.length > 0);
check(
  "files_route.guard",
  filesRoute.includes("assertSameOrigin") && filesRoute.includes("workingContextForRoute"),
);
check(
  "files_route.validation",
  filesRoute.includes("fileCategorySchema") && filesRoute.includes("instanceof File"),
);
check(
  "files_route.storage",
  filesRoute.includes("uploadEncryptedFile") &&
    filesRoute.includes("declaredMime") &&
    filesRoute.includes("originalFilename"),
);
check(
  "files_route.size_cap",
  filesRoute.includes("MAX_UPLOAD_BYTES") && filesRoute.includes("ValidationError"),
);
check("files_route.status", filesRoute.includes("status: 201"));

process.stdout.write(`\nstep-03p offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
