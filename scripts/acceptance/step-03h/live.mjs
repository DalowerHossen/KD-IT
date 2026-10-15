// path: scripts/acceptance/step-03h/live.mjs
// Step 03 substep H live acceptance: verifies the email delivery tables exist
// and that the delivery pipeline works end-to-end against the database using a
// stub adapter (no real provider needed):
//   - a suppression blocks dispatch (recorded suppressed, not queued);
//   - a queued email is delivered and its outbox event published;
//   - a permanent bounce records a suppression;
//   - a transient failure reschedules the outbox event (not published).
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and KD_DATABASE_URL; skips
// cleanly when absent. All test rows use a throwaway address and are cleaned up.

import { createHash, randomUUID } from "node:crypto";
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

// Resolve the platform credential from environment so the route resolves
// without a stored (encrypted) credential.
process.env.KD_RESEND_API_KEY = process.env.KD_RESEND_API_KEY ?? "live-test-resend-key";
process.env.KD_EMAIL_FROM =
  process.env.KD_EMAIL_FROM ?? "KD Acceptance <acceptance@kd-solution.it>";

const runnerPath = pathToFileURL(path.join(ROOT, "scripts/db/lib/runner.mjs")).href;
const { connect } = await import(runnerPath);

const queue = await import("../../../lib/email/queue.ts");
const deliverability = await import("../../../lib/email/deliverability.ts");
const tenant = await import("../../../lib/db/tenant-context.ts");

const context = tenant.makeTenantContext({
  companyId: tenant.PLATFORM_COMPANY_ID,
  userId: "00000000-00000000-0000-000000000000",
  role: "staff",
  correlationId: randomUUID(),
});

const suffix = createHash("sha256").update(`step03h-${Date.now()}`).digest("hex").slice(0, 12);
const normalAddress = `h-live-${suffix}@example.com`;
const bounceAddress = `h-bounce-${suffix}@example.com`;
const suppressedAddress = `h-suppressed-${suffix}@example.com`;

const stub = (result) => ({
  name: "smtp",
  send: async () => result,
  verifyConnection: async () => {},
});

function message(to) {
  return {
    to,
    from: process.env.KD_EMAIL_FROM,
    subject: "KD live acceptance",
    text: "KD SOLUTION IT live acceptance email.",
    html: "<p>KD SOLUTION IT live acceptance email.</p>",
    templateId: "system.acceptance",
  };
}

let db;
try {
  db = await connect();

  const ping = await db.query("select 1 as ok");
  check("live.db_reachable", ping.rows[0]?.ok === 1);

  const tables = await db.query(
    `select tablename from pg_tables where schemaname = 'app' and tablename in
       ('email_credentials', 'email_deliveries', 'email_suppressions')`,
  );
  check(
    "live.tables_exist",
    tables.rows.length === 3,
    tables.rows.map((r) => r.tablename).join(","),
  );

  // Suppression blocks dispatch: the enqueue records a suppressed delivery and
  // does not queue an outbox event.
  await deliverability.addSuppression(
    tenant.PLATFORM_COMPANY_ID,
    suppressedAddress,
    "manual",
    "live-acceptance",
  );
  const suppressedBefore = await deliverability.isSuppressed(
    tenant.PLATFORM_COMPANY_ID,
    suppressedAddress,
  );
  check("live.suppression_recorded", suppressedBefore === true);
  const suppressedEnqueue = await queue.enqueueEmail(context, message(suppressedAddress));
  check(
    "live.suppression_blocks_dispatch",
    suppressedEnqueue.queued === false && suppressedEnqueue.reason === "suppressed",
  );
  const suppressedDelivery = suppressedEnqueue.deliveryId
    ? await deliverability.getDelivery(suppressedEnqueue.deliveryId)
    : null;
  check("live.suppressed_delivery_recorded", suppressedDelivery?.status === "suppressed");

  // A queued email is delivered through the stub adapter; the outbox event is
  // published.
  const deliveredEnqueue = await queue.enqueueEmail(context, message(normalAddress));
  check("live.enqueue_creates_queued", deliveredEnqueue.queued === true);
  const deliveredResults = await queue.processEmailQueue({
    worker: "h-acceptance",
    adapter: stub({ delivered: true, bounced: false, messageId: "stub-delivered" }),
  });
  const deliveredDelivery = await deliverability.getDelivery(deliveredEnqueue.deliveryId);
  check(
    "live.delivery_delivered",
    deliveredResults.some(
      (r) => r.deliveryId === deliveredEnqueue.deliveryId && r.outcome === "delivered",
    ) &&
      deliveredDelivery?.status === "delivered" &&
      deliveredDelivery?.provider_message_id === "stub-delivered",
  );

  // A permanent bounce records a suppression for the recipient.
  const bouncedEnqueue = await queue.enqueueEmail(context, message(bounceAddress));
  await queue.processEmailQueue({
    worker: "h-acceptance",
    adapter: stub({
      delivered: false,
      bounced: true,
      bounceCategory: "permanent",
      detail: "550 no such user",
    }),
  });
  const bouncedDelivery = await deliverability.getDelivery(bouncedEnqueue.deliveryId);
  const bounceSuppressed = await deliverability.isSuppressed(
    tenant.PLATFORM_COMPANY_ID,
    bounceAddress,
  );
  check(
    "live.bounce_records_suppression",
    bouncedDelivery?.status === "bounced" &&
      bouncedDelivery?.bounce_category === "permanent" &&
      bounceSuppressed === true,
  );

  // A transient failure reschedules the outbox event (not published) and marks
  // the delivery failed.
  const retryEnqueue = await queue.enqueueEmail(context, message(`h-retry-${suffix}@example.com`));
  await queue.processEmailQueue({
    worker: "h-acceptance",
    adapter: stub({ delivered: false, bounced: false, detail: "timeout" }),
  });
  const retryDelivery = await deliverability.getDelivery(retryEnqueue.deliveryId);
  const outboxState = await db.query(
    `select published_at is null as pending, (publish_after > clock_timestamp()) as rescheduled
       from app.outbox_events where id in (
         select o.id from app.outbox_events o where o.topic = 'email.send' and o.payload->>'deliveryId' = $1
       )`,
    [retryEnqueue.deliveryId],
  );
  check(
    "live.transient_reschedules",
    retryDelivery?.status === "failed" &&
      outboxState.rows[0]?.pending === true &&
      outboxState.rows[0]?.rescheduled === true,
  );
} catch (error) {
  check("live.no_unexpected_error", false, error instanceof Error ? error.message : String(error));
} finally {
  if (db) {
    await db
      .query(
        `delete from app.outbox_events where payload->>'to' like $1 or payload->>'deliveryId' in (
           select id::text from app.email_deliveries where to_address like $1)`,
        [`h-%${suffix}@example.com`],
      )
      .catch(() => {});
    await db
      .query(`delete from app.email_deliveries where to_address like $1`, [
        `h-%${suffix}@example.com`,
      ])
      .catch(() => {});
    await db
      .query(`delete from app.email_suppressions where address like $1`, [
        `h-%${suffix}@example.com`,
      ])
      .catch(() => {});
    await db.end().catch(() => {});
  }
}
process.exit(failures === 0 ? 0 : 1);
