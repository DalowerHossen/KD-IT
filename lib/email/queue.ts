// path: lib/email/queue.ts
import "server-only";

import { z } from "zod";

import { UNKNOWN_AUTH_SUBJECT_ID } from "@/lib/auth/audit";
import { withPgTransaction, pgQuery } from "@/lib/db/pg";
import {
  publishOutboxRow,
  claimOutboxBatch,
  markOutboxPublished,
  rescheduleOutbox,
  newCorrelationId,
} from "@/lib/db/repositories/outbox";
import type { TenantContext } from "@/lib/db/tenant-context";
import { makeTenantContext } from "@/lib/db/tenant-context";
import type { EmailAdapter } from "@/lib/email/adapters/base";
import { getEmailAdapter } from "@/lib/email/adapters/registry";
import type { EmailMessage } from "@/lib/email/types";
import {
  createQueuedDelivery,
  isSuppressed,
  markDeliveryBounced,
  markDeliveryDelivered,
  markDeliveryFailed,
  markDeliverySending,
  markDeliverySuppressed,
} from "@/lib/email/deliverability";
import { resolveEmailRoute } from "@/lib/email/routing";

const EMAIL_TOPIC = "email.send";
const MAX_ATTEMPTS = 5;

const uuidV7 = z.string().min(1).max(64);
const emailOutboxPayloadSchema = z.object({
  deliveryId: uuidV7,
  to: z.string(),
  from: z.string(),
  subject: z.string(),
  text: z.string(),
  html: z.string(),
  templateId: z.string(),
  provider: z.string(),
});

export interface EnqueueResult {
  readonly queued: boolean;
  readonly deliveryId: string | null;
  readonly reason?: "suppressed";
}

/**
 * Substep H - enqueue an email on the transactional outbox. A suppressed
 * recipient records a suppressed delivery and is not queued. Otherwise a
 * deliverability record and an outbox event are written atomically.
 */
export async function enqueueEmail(
  context: TenantContext,
  message: EmailMessage,
): Promise<EnqueueResult> {
  if (await isSuppressed(context.companyId, message.to)) {
    const deliveryId = await createQueuedDelivery(context.companyId, {
      to: message.to,
      from: message.from,
      subject: message.subject,
      provider: "suppressed",
    });
    await markDeliverySuppressed(deliveryId);
    return { queued: false, deliveryId, reason: "suppressed" };
  }
  const deliveryId = await withPgTransaction(async (client) => {
    const inserted = await client.query(
      `insert into app.email_deliveries (company_id, to_address, from_address, subject, provider, status)
         values ($1, $2, $3, $4, 'pending', 'queued') returning id`,
      [context.companyId, message.to, message.from, message.subject],
    );
    const id = (inserted.rows[0] as { id: string }).id;
    await publishOutboxRow(client, context.companyId, EMAIL_TOPIC, {
      deliveryId: id,
      to: message.to,
      from: message.from,
      subject: message.subject,
      text: message.text,
      html: message.html,
      templateId: message.templateId,
      provider: "pending",
    });
    return id;
  });
  return { queued: true, deliveryId };
}

export interface ProcessEmailOptions {
  readonly worker?: string;
  readonly limit?: number;
  /** Test seam: inject an adapter instead of the registry. */
  readonly adapter?: EmailAdapter;
}

export interface ProcessedEmail {
  readonly deliveryId: string;
  readonly outcome: "delivered" | "bounced" | "suppressed" | "retry" | "failed" | "no-route";
}

/**
 * Substep H - the email worker. Claims outbox events, resolves the route and
 * credential, dispatches through the adapter, and records the outcome.
 * Permanent bounces stop; transient failures retry with backoff until
 * attempts are exhausted; missing routes and suppressed recipients stop.
 */
export async function processEmailQueue(
  options: ProcessEmailOptions = {},
): Promise<ProcessedEmail[]> {
  const worker = options.worker ?? "email-worker";
  const batch = await claimOutboxBatch({ worker, limit: options.limit ?? 25 });
  const results: ProcessedEmail[] = [];
  for (const event of batch) {
    const payload = emailOutboxPayloadSchema.safeParse(event.payload);
    if (!payload.success) {
      await markOutboxPublished(event.id);
      continue;
    }
    const p = payload.data;
    const context = makeTenantContext({
      companyId: event.company_id,
      userId: UNKNOWN_AUTH_SUBJECT_ID,
      role: "staff",
      correlationId: event.correlation_id ?? newCorrelationId(),
    });
    try {
      if (await isSuppressed(event.company_id, p.to)) {
        await markDeliverySuppressed(p.deliveryId);
        await markOutboxPublished(event.id);
        results.push({ deliveryId: p.deliveryId, outcome: "suppressed" });
        continue;
      }
      const route = await resolveEmailRoute(context);
      if (route === null) {
        await markDeliveryFailed(
          p.deliveryId,
          event.attempts,
          "no email route or credential configured",
        );
        await markOutboxPublished(event.id);
        results.push({ deliveryId: p.deliveryId, outcome: "no-route" });
        continue;
      }
      const adapter = options.adapter ?? getEmailAdapter(route.provider);
      const message: EmailMessage = {
        to: p.to,
        from: route.fromAddress,
        subject: p.subject,
        text: p.text,
        html: p.html,
        templateId: p.templateId,
      };
      await markDeliverySending(p.deliveryId, route.provider);
      const result = await adapter.send(message, route.credential);
      if (result.delivered) {
        await markDeliveryDelivered(p.deliveryId, result.messageId ?? null);
        await markOutboxPublished(event.id);
        results.push({ deliveryId: p.deliveryId, outcome: "delivered" });
      } else if (result.bounced) {
        await markDeliveryBounced(
          p.deliveryId,
          result.bounceCategory ?? "unknown",
          result.detail ?? "bounce",
        );
        await markOutboxPublished(event.id);
        results.push({ deliveryId: p.deliveryId, outcome: "bounced" });
      } else {
        await handleTransient(
          event.id,
          p.deliveryId,
          event.attempts,
          result.detail ?? "transient failure",
        );
        results.push({
          deliveryId: p.deliveryId,
          outcome: event.attempts >= MAX_ATTEMPTS ? "failed" : "retry",
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 200) : "email worker error";
      await handleTransient(event.id, p.deliveryId, event.attempts, detail);
      results.push({
        deliveryId: p.deliveryId,
        outcome: event.attempts >= MAX_ATTEMPTS ? "failed" : "retry",
      });
    }
  }
  return results;
}

async function handleTransient(
  outboxEventId: string,
  deliveryId: string,
  attempts: number,
  detail: string,
): Promise<void> {
  if (attempts >= MAX_ATTEMPTS) {
    await markDeliveryFailed(deliveryId, attempts, "retries exhausted");
    await markOutboxPublished(outboxEventId);
    return;
  }
  await markDeliveryFailed(deliveryId, attempts, detail);
  await rescheduleOutbox(outboxEventId, detail, backoffSeconds(attempts));
}

function backoffSeconds(attempts: number): number {
  return Math.min(300, 30 * 2 ** Math.max(attempts - 1, 0));
}

/** Convenience for tests and the worker: count of pending email events. */
export async function pendingEmailCount(): Promise<number> {
  const result = await pgQuery(
    `select count(*)::int as n from app.outbox_events
      where topic = $1 and published_at is null and deleted_at is null`,
    [EMAIL_TOPIC],
  );
  return (result.rows[0] as { n: number }).n;
}
