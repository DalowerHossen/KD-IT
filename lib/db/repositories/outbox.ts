// path: lib/db/repositories/outbox.ts
import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import type { PgClient } from "@/lib/db/pg";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * Transactional outbox repository. Domain services insert an outbox row in
 * the same transaction as their mutation; workers claim leases and mark
 * deliveries, keeping side effects exactly-once at the database level.
 */

export const OUTBOX_COLUMNS =
  "id, company_id, topic, payload, dedupe_key, correlation_id, occurred_at, published_at, attempts, next_attempt_at, last_error, created_at, updated_at, deleted_at, version";

export const outboxEventRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  topic: z.string(),
  payload: z.record(z.string(), z.unknown()),
  dedupe_key: z.string().nullable(),
  correlation_id: uuidV7Schema.nullable(),
  occurred_at: z.string(),
  published_at: z.string().nullable(),
  attempts: z.number().int().min(0),
  next_attempt_at: z.string(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  version: z.number().int().min(1),
});
export type OutboxEventRow = z.infer<typeof outboxEventRowSchema>;

export async function publishOutboxRow(
  client: PgClient,
  companyId: string,
  topic: string,
  payload: Record<string, unknown>,
  options?: { dedupeKey?: string; correlationId?: string },
): Promise<void> {
  await client.query(
    `insert into app.outbox_events (company_id, topic, payload, dedupe_key, correlation_id)
     values ($1, $2, $3::jsonb, $4, $5)`,
    [
      companyId,
      topic,
      JSON.stringify(payload),
      options?.dedupeKey ?? null,
      options?.correlationId ?? null,
    ],
  );
}

export interface ClaimOutboxOptions {
  readonly worker: string;
  readonly limit?: number;
}

export async function claimOutboxBatch(options: ClaimOutboxOptions): Promise<OutboxEventRow[]> {
  const result = await pgQuery(`select ${OUTBOX_COLUMNS} from app.outbox_claim($1, $2)`, [
    options.worker,
    options.limit ?? 25,
  ]);
  return z.array(outboxEventRowSchema).parse(result.rows);
}

export async function markOutboxPublished(eventId: string): Promise<void> {
  await pgQuery("select app.outbox_mark_published($1::uuid)", [eventId]);
}

export async function rescheduleOutbox(
  eventId: string,
  message: string,
  retryAfterSeconds: number,
): Promise<void> {
  await pgQuery("select app.outbox_reschedule($1::uuid, $2, make_interval(secs => $3))", [
    eventId,
    message,
    Math.max(retryAfterSeconds, 5),
  ]);
}

export function newCorrelationId(): string {
  return randomUUID();
}

export async function publishOutboxEvent(
  companyId: string,
  topic: string,
  payload: Record<string, unknown>,
  options?: { dedupeKey?: string; correlationId?: string },
): Promise<void> {
  await withPgTransaction(async (client) => {
    await publishOutboxRow(client, companyId, topic, payload, options);
  });
}
