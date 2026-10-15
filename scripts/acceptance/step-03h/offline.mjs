// path: scripts/acceptance/step-03h/offline.mjs
// Step 03 substep H offline acceptance: the universal SMTP email system.
// Verifies the email delivery tables (migration 013), the adapter registry
// (Resend default + the universal raw-SMTP adapter), the provider types, the
// complete English templates (rendered and placeholder-free), the
// environment-driven port selection, the SMTP auth-email port binding, the
// super-admin connection-verification route, the env bindings, the audit
// actions, and the queue entry points. Runs without a database; the live
// delivery/bounce/suppression round-trip is exercised by live.mjs when
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

const registry = await import("../../../lib/email/adapters/registry.ts");
const templates = await import("../../../lib/email/templates/registry.ts");
const types = await import("../../../lib/email/types.ts");
const routing = await import("../../../lib/email/routing.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig013 = read("../../../supabase/migrations/013_email_delivery.up.sql");
const mig013down = read("../../../supabase/migrations/013_email_delivery.down.sql");
const baseSrc = read("../../../lib/email/adapters/base.ts");
const resendSrc = read("../../../lib/email/adapters/resend.ts");
const smtpSrc = read("../../../lib/email/adapters/smtp.ts");
const routingSrc = read("../../../lib/email/routing.ts");
const queueSrc = read("../../../lib/email/queue.ts");
const portSrc = read("../../../lib/auth/smtp-email-port.ts");
const emailPortSrc = read("../../../lib/auth/email-port.ts");
const verifyRouteSrc = read("../../../app/api/platform/email/verify/route.ts");
const envSrc = read("../../../lib/config/env.ts");
const auditSrc = read("../../../lib/auth/audit.ts");
const credentialsSrc = read("../../../lib/email/credentials.ts");

// ---------------------------------------------------------------------------
// Storage: migration 013 tables, RLS, grants, triggers.
// ---------------------------------------------------------------------------
const countOf = (haystack, needle) => haystack.split(needle).length - 1;
check(
  "migration013.credentials_table",
  mig013.includes("create table app.email_credentials (") &&
    mig013.includes("credentials_ciphertext bytea not null") &&
    mig013.includes("credentials_nonce bytea not null") &&
    mig013.includes("credentials_tag bytea not null") &&
    mig013.includes("credentials_key_version integer not null") &&
    mig013.includes("verified boolean not null default false"),
);
check(
  "migration013.deliveries_table",
  mig013.includes("create table app.email_deliveries (") &&
    mig013.includes("status text not null default 'queued' check (status in") &&
    mig013.includes("bounce_category") &&
    mig013.includes("provider_message_id") &&
    mig013.includes("attempts integer not null default 0"),
);
check(
  "migration013.suppressions_table",
  mig013.includes("create table app.email_suppressions (") &&
    mig013.includes("reason text not null check (reason in") &&
    mig013.includes("address text not null"),
);
const contractCols = [
  "id uuid primary key default app.uuid_v7()",
  "company_id uuid not null references app.companies (id) on delete restrict",
  "created_at timestamptz not null default clock_timestamp()",
  "updated_at timestamptz not null default clock_timestamp()",
  "deleted_at timestamptz null",
  "version integer not null default 1",
];
check(
  "migration013.column_contract",
  contractCols.every((col) => countOf(mig013, col) >= 3),
);
check(
  "migration013.rls_and_grants",
  (mig013.match(/enable row level security/g) ?? []).length >= 3 &&
    (mig013.match(/force row level security/g) ?? []).length >= 3 &&
    (mig013.match(/grant select, insert, update, delete on app\.email_/g) ?? []).length >= 3,
);
check(
  "migration013.triggers",
  (mig013.match(/execute function app\.touch_updated_at\(\)/g) ?? []).length >= 3 &&
    (mig013.match(/execute function app\.guard_optimistic_version\(\)/g) ?? []).length >= 3,
);
check(
  "migration013.rollback",
  /drop table if exists app\.email_credentials/.test(mig013down) &&
    /drop table if exists app\.email_deliveries/.test(mig013down) &&
    /drop table if exists app\.email_suppressions/.test(mig013down),
);

// ---------------------------------------------------------------------------
// Adapters: the universal contract, Resend (default), raw SMTP, registry.
// ---------------------------------------------------------------------------
check(
  "adapters.base_interface",
  baseSrc.includes("interface EmailAdapter") &&
    baseSrc.includes("send(message: EmailMessage, credential: EmailCredential)") &&
    baseSrc.includes("verifyConnection(credential: EmailCredential)"),
);
check(
  "adapters.resend_default",
  resendSrc.includes('name: "resend"') && resendSrc.includes("/emails"),
);
check(
  "adapters.smtp_universal",
  smtpSrc.includes('name: "smtp"') &&
    smtpSrc.includes("AUTH LOGIN") &&
    smtpSrc.includes("STARTTLS") &&
    smtpSrc.includes("dotStuff"),
);
const resendAdapter = registry.getEmailAdapter("resend");
const smtpAdapter = registry.getEmailAdapter("smtp");
check(
  "adapters.registry",
  resendAdapter.name === "resend" &&
    smtpAdapter.name === "smtp" &&
    registry.EMAIL_PROVIDERS.includes("resend") &&
    registry.EMAIL_PROVIDERS.includes("smtp"),
);

// ---------------------------------------------------------------------------
// Types: lifecycle statuses, bounce categories, suppression reasons.
// ---------------------------------------------------------------------------
check(
  "types.delivery_status",
  ["queued", "sending", "delivered", "bounced", "failed", "suppressed"].every((s) =>
    types.deliveryStatusSchema.options.includes(s),
  ),
);
check(
  "types.bounce_and_suppression",
  types.bounceCategorySchema.options.includes("permanent") &&
    types.suppressionReasonSchema.options.includes("permanent_bounce"),
);

// ---------------------------------------------------------------------------
// Templates: complete English, rendered, well-formed, placeholder-free.
// ---------------------------------------------------------------------------
const confirmation = templates.renderTemplate(templates.TEMPLATE_IDS.authConfirmation, {
  toAddress: "owner@example.com",
  displayName: "Jordan",
  link: "https://kd-solution.it/api/auth/callback?next=%2F",
});
const recovery = templates.renderTemplate(templates.TEMPLATE_IDS.authRecovery, {
  toAddress: "owner@example.com",
  link: "https://kd-solution.it/api/auth/callback?next=%2Freset-password",
});
const locked = templates.renderTemplate(templates.TEMPLATE_IDS.accountLocked, {
  toAddress: "owner@example.com",
});

check(
  "templates.confirmation_renders",
  /confirm/i.test(confirmation.subject) &&
    confirmation.text.includes("Jordan") &&
    confirmation.html.includes("<html") &&
    confirmation.html.includes("kd-solution.it"),
);
check(
  "templates.recovery_renders",
  /reset/i.test(recovery.subject) &&
    recovery.html.includes("<html") &&
    recovery.html.includes("</html>"),
);
check(
  "templates.locked_renders",
  /security notice/i.test(locked.subject) &&
    locked.html.includes("<html") &&
    locked.html.includes("</html>"),
);
const allRendered = [confirmation, recovery, locked].map((t) => `${t.subject} ${t.text} ${t.html}`);
check(
  "templates.english_no_placeholders",
  allRendered.every((blob) => !/\{\{|\bTODO\b|lorem ipsum|placeholder/i.test(blob)) &&
    allRendered.every((blob) => blob.trim().length > 200),
);

// ---------------------------------------------------------------------------
// Routing: environment-driven port selection.
// ---------------------------------------------------------------------------
const savedProvider = process.env.KD_EMAIL_PROVIDER;
delete process.env.KD_EMAIL_PROVIDER;
const defaultPort = routing.selectedAuthEmailPortName();
process.env.KD_EMAIL_PROVIDER = "smtp";
const smtpPort = routing.selectedAuthEmailPortName();
if (savedProvider === undefined) delete process.env.KD_EMAIL_PROVIDER;
else process.env.KD_EMAIL_PROVIDER = savedProvider;
check("routing.port_selection", defaultPort === "supabase" && smtpPort === "smtp");
check(
  "routing.fallback_chain",
  routingSrc.includes("getConfigurationValue") &&
    routingSrc.includes("getEmailCredential") &&
    routingSrc.includes("envEmailCredential"),
);

// ---------------------------------------------------------------------------
// Port binding, route, env, audit, queue.
// ---------------------------------------------------------------------------
check(
  "port.smtp_binding",
  portSrc.includes('name: "smtp"') &&
    portSrc.includes("sendTemplatedEmail") &&
    portSrc.includes("TEMPLATE_IDS.accountLocked"),
);
check(
  "port.flip_env_driven",
  emailPortSrc.includes("selectedAuthEmailPortName") && emailPortSrc.includes("smtpAuthEmailPort"),
);
check(
  "route.verify_super_admin",
  verifyRouteSrc.includes('context.role !== "super_admin"') &&
    verifyRouteSrc.includes("verifyConnection") &&
    verifyRouteSrc.includes("saveEmailCredential"),
);
check(
  "env.email_vars",
  envSrc.includes("KD_EMAIL_PROVIDER") &&
    envSrc.includes("KD_RESEND_API_KEY") &&
    envSrc.includes("KD_SMTP_HOST"),
);
check(
  "audit.email_actions",
  auditSrc.includes("emailDelivered") &&
    auditSrc.includes("emailBounced") &&
    auditSrc.includes("emailProviderVerified"),
);
check(
  "queue.entry_points",
  queueSrc.includes("export async function enqueueEmail") &&
    queueSrc.includes("export async function processEmailQueue") &&
    queueSrc.includes("claimOutboxBatch"),
);
check(
  "credentials.encrypted_storage",
  credentialsSrc.includes("encryptData") && credentialsSrc.includes("decryptData"),
);

process.stdout.write(`\nstep-03h offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
