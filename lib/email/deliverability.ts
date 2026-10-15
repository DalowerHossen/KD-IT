// path: lib/email/deliverability.ts
import "server-only";

import { z } from "zod";

import { pgQuery } from "@/lib/db/pg";
import type { BounceCategory, DeliveryStatus, SuppressionReason } from "@/lib/email/types";

/**
 * Substep H - deliverability records and suppression. One row per send tracks
 * the lifecycle (queued -> sending -> delivered | bounced | failed |
 * suppressed); a permanent bounce records a suppression so the address is
 * never dispatched to again. Suppression checks are cheap and run before
 * dispatch.
 */

const deliveryColumns =
  "id, company_id, to_address, from_address, subject, provider, status, bounce_category, provider_message_id, attempts, last_error, sent_at, delivered_at, bounced_at";

const deliveryRowSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  to_address: z.string(),
  from_address: z.string(),
  subject: z.string(),
  provider: z.string(),
  status: z.enum(["queued", "sending", "delivered", "bounced", "failed", "suppressed"]),
  bounce_category: z.enum(["permanent", "temporary", "unknown"]).nullable(),
  provider_message_id: z.string().nullable(),
  attempts: z.number().int(),
  last_error: z.string().nullable(),
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  bounced_at: z.string().nullable(),
});
export type DeliveryRow = z.infer<typeof deliveryRowSchema>;

export async function getDelivery(deliveryId: string): Promise<DeliveryRow | null> {
  const result = await pgQuery(
    `select ${deliveryColumns} from app.email_deliveries where id = $1`,
    [deliveryId],
  );
  const row = result.rows[0];
  return row === undefined ? null : deliveryRowSchema.parse(row);
}

/** Creates a queued deliverability record (provider set to pending) and returns its id. */
export async function createQueuedDelivery(
  companyId: string,
  input: {
    readonly to: string;
    readonly from: string;
    readonly subject: string;
    readonly provider: string;
  },
): Promise<string> {
  const result = await pgQuery(
    `insert into app.email_deliveries (company_id, to_address, from_address, subject, provider, status)
       values ($1, $2, $3, $4, $5, 'queued') returning id`,
    [companyId, input.to, input.from, input.subject, input.provider],
  );
  return (result.rows[0] as { id: string }).id;
}

export async function markDeliverySending(deliveryId: string, provider: string): Promise<void> {
  await pgQuery(
    `update app.email_deliveries set status = 'sending', provider = $2, sent_at = clock_timestamp()
      where id = $1 and status in ('queued', 'failed')`,
    [deliveryId, provider],
  );
}

export async function markDeliveryDelivered(
  deliveryId: string,
  messageId: string | null,
): Promise<void> {
  await pgQuery(
    `update app.email_deliveries set status = 'delivered', delivered_at = clock_timestamp(),
        provider_message_id = coalesce($2, provider_message_id)
      where id = $1`,
    [deliveryId, messageId],
  );
}

export async function markDeliveryFailed(
  deliveryId: string,
  attempts: number,
  error: string,
): Promise<void> {
  await pgQuery(
    `update app.email_deliveries set status = 'failed', attempts = $2, last_error = left($3, 500)
      where id = $1`,
    [deliveryId, attempts, error],
  );
}

/** Marks a delivery suppressed (recipient is on the suppression list). */
export async function markDeliverySuppressed(deliveryId: string): Promise<void> {
  await pgQuery(`update app.email_deliveries set status = 'suppressed' where id = $1`, [
    deliveryId,
  ]);
}

/**
 * Records a bounce. A permanent bounce also records a suppression so the
 * address is not mailed again.
 */
export async function markDeliveryBounced(
  deliveryId: string,
  category: BounceCategory,
  source: string,
): Promise<void> {
  await pgQuery(
    `update app.email_deliveries
        set status = 'bounced', bounce_category = $2, bounced_at = clock_timestamp(),
            last_error = left($3, 500)
      where id = $1`,
    [deliveryId, category, source],
  );
  if (category === "permanent") {
    const row = await pgQuery(`select company_id from app.email_deliveries where id = $1`, [
      deliveryId,
    ]);
    const companyId = (row.rows[0] as { company_id: string } | undefined)?.company_id;
    const toAddress = (row.rows[0] as { to_address: string } | undefined)?.to_address;
    if (companyId !== undefined && toAddress !== undefined) {
      await addSuppression(companyId, toAddress, "permanent_bounce", "smtp-bounce");
    }
  }
}

/** True when the address is currently suppressed for the company. */
export async function isSuppressed(companyId: string, address: string): Promise<boolean> {
  const normalized = address.toLowerCase().trim();
  const result = await pgQuery(
    `select 1 from app.email_suppressions
      where company_id = $1 and address = $2 and deleted_at is null and removed_at is null`,
    [companyId, normalized],
  );
  return result.rows.length > 0;
}

/** Records a suppression; idempotent per (company, address) when active. */
export async function addSuppression(
  companyId: string,
  address: string,
  reason: SuppressionReason,
  source: string,
): Promise<void> {
  const normalized = address.toLowerCase().trim();
  await pgQuery(
    `insert into app.email_suppressions (company_id, address, reason, source)
       values ($1, $2, $3, $4)
     on conflict (company_id, address)
     where deleted_at is null do nothing`,
    [companyId, normalized, reason, source],
  );
}

export type { DeliveryStatus };
