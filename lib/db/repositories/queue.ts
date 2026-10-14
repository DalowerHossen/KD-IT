// path: lib/db/repositories/queue.ts
import "server-only";

import { z } from "zod";

import { pgQuery } from "@/lib/db/pg";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * Background queue repository: enqueue, lease-based claim via FOR UPDATE
 * SKIP LOCKED, completion, idempotent retry with exponential backoff, and
 * dead-letter listing.
 */

export const QUEUE_COLUMNS =
  "id, company_id, kind, payload, status, priority, run_at, attempts, max_attempts, locked_by, locked_at, lock_expires_at, last_error, dead_lettered_at, dedupe_key, result, created_at, updated_at, deleted_at, version";

export const queueJobRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  kind: z.string(),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum([
    "queued",
    "claimed",
    "succeeded",
    "failed_retryable",
    "dead_letter",
    "cancelled",
  ]),
  priority: z.number().int(),
  run_at: z.string(),
  attempts: z.number().int().min(0),
  max_attempts: z.number().int().min(1),
  locked_by: z.string().nullable(),
  locked_at: z.string().nullable(),
  lock_expires_at: z.string().nullable(),
  last_error: z.string().nullable(),
  dead_lettered_at: z.string().nullable(),
  dedupe_key: z.string().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  version: z.number().int().min(1),
});
export type QueueJobRow = z.infer<typeof queueJobRowSchema>;

export async function enqueueQueueJob(
  companyId: string,
  kind: string,
  payload: Record<string, unknown>,
  options?: { priority?: number; runAt?: string; maxAttempts?: number; dedupeKey?: string },
): Promise<void> {
  await pgQuery(
    `insert into app.queue_jobs (company_id, kind, payload, priority, run_at, max_attempts, dedupe_key)
     values ($1, $2, $3::jsonb, $4, coalesce($5::timestamptz, clock_timestamp()), $6, $7)
     on conflict (company_id, kind, dedupe_key) where dedupe_key is not null and status in ('queued', 'claimed', 'failed_retryable')
     do nothing`,
    [
      companyId,
      kind,
      JSON.stringify(payload),
      options?.priority ?? 100,
      options?.runAt ?? null,
      options?.maxAttempts ?? 8,
      options?.dedupeKey ?? null,
    ],
  );
}

export async function claimQueueJobs(
  worker: string,
  kinds: readonly string[],
  limit: number,
  leaseSeconds: number,
): Promise<QueueJobRow[]> {
  const result = await pgQuery(
    `select ${QUEUE_COLUMNS} from app.queue_claim($1, $2::text[], $3, $4)`,
    [worker, [...kinds], limit, leaseSeconds],
  );
  return z.array(queueJobRowSchema).parse(result.rows);
}

export async function completeQueueJob(
  worker: string,
  jobId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  await pgQuery("select app.queue_succeed($1::uuid, $2, $3::jsonb)", [
    jobId,
    worker,
    JSON.stringify(result ?? {}),
  ]);
}

/** Idempotent retry: repeats of the same held job return its status again. */
export async function failQueueJob(
  worker: string,
  jobId: string,
  message: string,
  retryAfterSeconds: number,
): Promise<"failed_retryable" | "dead_letter"> {
  const queryResult = await pgQuery(
    "select app.queue_fail($1::uuid, $2, $3, make_interval(secs => $4)) as outcome",
    [jobId, worker, message, Math.max(retryAfterSeconds, 1)],
  );
  const row = queryResult.rows[0] as { outcome: { status: string } } | undefined;
  return row?.outcome.status === "dead_letter" ? "dead_letter" : "failed_retryable";
}

export async function listDeadLetterQueueJobs(
  companyId: string,
  limit: number,
): Promise<QueueJobRow[]> {
  const result = await pgQuery(
    `select ${QUEUE_COLUMNS}
     from app.queue_jobs
     where company_id = $1 and status = 'dead_letter' and deleted_at is null
     order by dead_lettered_at desc
     limit $2`,
    [companyId, limit],
  );
  return z.array(queueJobRowSchema).parse(result.rows);
}
