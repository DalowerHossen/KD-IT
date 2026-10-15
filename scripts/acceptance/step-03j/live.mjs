// path: scripts/acceptance/step-03j/live.mjs
// Step 03 substep J live acceptance: verifies the notification inbox
// round-trip (create -> list -> unread count -> mark read) and the
// entitlement-gated email copy: a Professional-plan workspace (which holds the
// "notifications" entitlement) enqueues an email for a notification, while a
// Starter-plan workspace (which does not) does not. Requires SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, and KD_DATABASE_URL; skips cleanly when absent.
// All test rows use throwaway identifiers and are cleaned up.

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
process.env.KD_RESEND_API_KEY = process.env.KD_RESEND_API_KEY ?? "live-test-resend-key";

const runnerPath = pathToFileURL(path.join(ROOT, "scripts/db/lib/runner.mjs")).href;
const { connect } = await import(runnerPath);

const repository = await import("../../../lib/notifications/repository.ts");
const service = await import("../../../lib/notifications/service.ts");
const plans = await import("../../../lib/company/plans.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");

const PLATFORM = tenant.PLATFORM_COMPANY_ID;
const recipient = randomUUID();
const proEmail = `j-pro-${Date.now()}@example.com`;
const stEmail = `j-st-${Date.now()}@example.com`;
const cleanup = [];

let db;
try {
  db = await connect();
  check("live.db_reachable", (await db.query("select 1 as ok")).rows[0]?.ok === 1);

  const table = await db.query(
    `select 1 from pg_tables where schemaname = 'app' and tablename = 'notifications'`,
  );
  check("live.table_exists", table.rows.length === 1);

  // Inbox round-trip on the platform company.
  const ctx = tenant.makeTenantContext({
    companyId: PLATFORM,
    userId: recipient,
    role: "staff",
    correlationId: randomUUID(),
  });
  await repository.createNotification(ctx, {
    userId: recipient,
    type: "workspace.ready",
    title: "Inbox check",
    body: "A test notification.",
  });
  cleanup.push(
    db.query(`delete from app.notifications where user_id = $1`, [recipient]).catch(() => {}),
  );
  const list = await repository.listNotifications(ctx, 50);
  check(
    "live.inbox_created",
    list.length === 1 && list[0].title === "Inbox check" && list[0].read_at === null,
  );
  check("live.unread_count", (await repository.unreadCount(ctx)) === 1);
  await repository.markNotificationRead(ctx, list[0].id);
  check("live.read_decrements", (await repository.unreadCount(ctx)) === 0);

  // Entitlement-gated email copy.
  const catalog = await plans.listPlans();
  const professional = catalog.find((p) => p.name === "Professional");
  const starter = catalog.find((p) => p.name === "Starter");
  check("live.plans_present", professional !== undefined && starter !== undefined);

  const proCompany = (
    await db.query(
      `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
         values (app.platform_company_id(), 'J Pro Co', 'J Pro', false, $1::jsonb) returning id`,
      [JSON.stringify({ plan_id: professional.id })],
    )
  ).rows[0].id;
  const stCompany = (
    await db.query(
      `insert into app.companies (company_id, legal_name, display_name, is_platform, settings)
         values (app.platform_company_id(), 'J St Co', 'J St', false, $1::jsonb) returning id`,
      [JSON.stringify({ plan_id: starter.id })],
    )
  ).rows[0].id;
  cleanup.push(
    db
      .query(
        `delete from app.outbox_events where topic = 'email.send' and payload->>'to' in ($1, $2)`,
        [proEmail, stEmail],
      )
      .catch(() => {}),
    db
      .query(`delete from app.email_deliveries where to_address in ($1, $2)`, [proEmail, stEmail])
      .catch(() => {}),
    db
      .query(`delete from app.companies where id in ($1, $2)`, [proCompany, stCompany])
      .catch(() => {}),
  );

  const proCtx = tenant.makeTenantContext({
    companyId: proCompany,
    userId: recipient,
    role: "owner",
    correlationId: randomUUID(),
  });
  await service.notify(proCtx, {
    userId: recipient,
    type: "workspace.ready",
    title: "Pro workspace",
    body: "Professional plan notification.",
    emailTo: proEmail,
  });
  const proEmailCount = await db.query(
    `select count(*)::int as n from app.outbox_events where topic = 'email.send' and payload->>'to' = $1`,
    [proEmail],
  );
  check("live.entitled_email_sent", proEmailCount.rows[0]?.n === 1);

  const stCtx = tenant.makeTenantContext({
    companyId: stCompany,
    userId: recipient,
    role: "owner",
    correlationId: randomUUID(),
  });
  await service.notify(stCtx, {
    userId: recipient,
    type: "workspace.ready",
    title: "Starter workspace",
    body: "Starter plan notification.",
    emailTo: stEmail,
  });
  const stEmailCount = await db.query(
    `select count(*)::int as n from app.outbox_events where topic = 'email.send' and payload->>'to' = $1`,
    [stEmail],
  );
  check("live.unentitled_email_suppressed", stEmailCount.rows[0]?.n === 0);
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const task of cleanup) {
    await task;
  }
  if (db) {
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
