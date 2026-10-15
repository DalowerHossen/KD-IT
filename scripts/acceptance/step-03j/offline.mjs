// path: scripts/acceptance/step-03j/offline.mjs
// Step 03 substep J offline acceptance: the in-app notification inbox.
// Verifies the notification table (migration 015), the repository surface,
// the service (in-app create + entitlement-gated email copy through the
// Substep H pipeline), the notification email template (rendered), the
// inbox routes, and the wiring into the membership invite and company
// onboarding. Runs without a database; the live inbox round-trip is exercised
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

const repository = await import("../../../lib/notifications/repository.ts");
const service = await import("../../../lib/notifications/service.ts");
const templates = await import("../../../lib/email/templates/registry.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const mig015 = read("../../../supabase/migrations/015_notifications.up.sql");
const mig015down = read("../../../supabase/migrations/015_notifications.down.sql");
const listRouteSrc = read("../../../app/api/notifications/route.ts");
const markReadRouteSrc = read("../../../app/api/notifications/mark-read/route.ts");
const membershipsSrc = read("../../../lib/db/repositories/memberships.ts");
const onboardingSrc = read("../../../lib/company/onboarding.ts");
const serviceSrc = read("../../../lib/notifications/service.ts");

// ---------------------------------------------------------------------------
// Storage: migration 015 notification inbox.
// ---------------------------------------------------------------------------
check(
  "migration015.notifications_table",
  mig015.includes("create table app.notifications (") &&
    mig015.includes("user_id uuid not null") &&
    /type text not null check \(type in/.test(mig015) &&
    mig015.includes("read_at timestamptz null") &&
    mig015.includes("related_id uuid null"),
);
check(
  "migration015.contract_and_scope",
  mig015.includes("id uuid primary key default app.uuid_v7()") &&
    mig015.includes("company_id uuid not null references app.companies (id) on delete restrict") &&
    mig015.includes("version integer not null default 1"),
);
check(
  "migration015.rls_grants_triggers",
  mig015.includes("enable row level security") &&
    mig015.includes("force row level security") &&
    mig015.includes("grant select, insert, update, delete on app.notifications to service_role") &&
    mig015.includes("execute function app.touch_updated_at()") &&
    mig015.includes("execute function app.guard_optimistic_version()"),
);
check("migration015.rollback", mig015down.includes("drop table if exists app.notifications"));

// ---------------------------------------------------------------------------
// Repository surface.
// ---------------------------------------------------------------------------
check(
  "repo.functions",
  typeof repository.createNotification === "function" &&
    typeof repository.listNotifications === "function" &&
    typeof repository.markNotificationRead === "function" &&
    typeof repository.unreadCount === "function",
);
check(
  "repo.types",
  ["membership.invited", "membership.role_changed", "workspace.ready", "security.alert"].every(
    (t) => repository.notificationTypeSchema.options.includes(t),
  ),
);

// ---------------------------------------------------------------------------
// Service: in-app create + entitlement-gated email copy.
// ---------------------------------------------------------------------------
check(
  "service.functions",
  typeof service.notify === "function" &&
    typeof service.notifyBestEffort === "function" &&
    typeof service.notifyInvitee === "function" &&
    typeof service.notifyWorkspaceReady === "function",
);
check(
  "service.entitlement_gated_email",
  serviceSrc.includes("entitlementsForCompany") &&
    serviceSrc.includes('"notifications"') &&
    serviceSrc.includes("sendTemplatedEmail") &&
    serviceSrc.includes("TEMPLATE_IDS.notification"),
);
check(
  "service.best_effort",
  serviceSrc.includes("try {") && serviceSrc.includes("rootLogger.warn"),
);

// ---------------------------------------------------------------------------
// Notification email template (rendered).
// ---------------------------------------------------------------------------
const rendered = templates.renderTemplate(templates.TEMPLATE_IDS.notification, {
  toAddress: "owner@example.com",
  title: "You have been invited to a workspace",
  body: "You were invited to join.",
});
check(
  "template.notification_renders",
  rendered.subject === "You have been invited to a workspace" &&
    rendered.text.includes("You were invited to join.") &&
    rendered.html.includes("<html") &&
    rendered.html.includes("</html>"),
);

// ---------------------------------------------------------------------------
// Routes, schemas, and flow wiring.
// ---------------------------------------------------------------------------
check(
  "routes.inbox",
  listRouteSrc.includes("listNotifications") &&
    listRouteSrc.includes("unreadCount") &&
    markReadRouteSrc.includes("markNotificationRead"),
);
check(
  "invite.wired",
  membershipsSrc.includes("notifyInvitee") &&
    membershipsSrc.includes("Substep J: the invitee is notified in-app"),
);
check(
  "onboarding.wired",
  onboardingSrc.includes("notifyWorkspaceReady") && onboardingSrc.includes("makeTenantContext"),
);

process.stdout.write(`\nstep-03j offline: ${checks.length - failures}/${checks.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
