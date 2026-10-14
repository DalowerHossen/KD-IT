// path: lib/queue/types.ts
import { z } from "zod";

import { uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * Background queue contract. All schedulable work items in the platform
 * use exactly these kinds so workers, dead-letter dashboards, and audit
 * correlation share a single vocabulary. Later steps extend this list
 * inside this file; new kinds register audit actions alongside them.
 */

export const QUEUE_JOB_KINDS = [
  "storage.purge_provider_object",
  "storage.migration_cycle",
  "file.scan_quarantine",
  "audit.chain_verify",
  "commands.expire_pending",
  "outbox.deliver",
  "rate_limit.sweep",
] as const;
export const queueJobKindSchema = z.enum(QUEUE_JOB_KINDS);
export type QueueJobKind = z.infer<typeof queueJobKindSchema>;

export const queueJobPayloadSchema = z
  .object({
    companyId: uuidV7Schema,
  })
  .and(z.record(z.string(), z.unknown()));
export type QueueJobPayload = z.infer<typeof queueJobPayloadSchema>;

export const storagePurgePayloadSchema = z.object({
  companyId: uuidV7Schema,
  fileId: uuidV7Schema,
  provider: z.enum(["google_drive", "supabase_storage"]),
  providerObjectId: z.string().min(1).max(1024),
});
export type StoragePurgePayload = z.infer<typeof storagePurgePayloadSchema>;

export const scanQuarantinePayloadSchema = z.object({
  companyId: uuidV7Schema,
  fileId: uuidV7Schema,
  detector: z.string().regex(/^[a-z][a-z0-9_.-]{1,60}$/),
});
export type ScanQuarantinePayload = z.infer<typeof scanQuarantinePayloadSchema>;

/** Worker lease defaults shared by all queue consumers. */
export const QUEUE_DEFAULTS = {
  leaseSeconds: 300,
  maxAttempts: 8,
  retryBackoffSeconds: [60, 180, 600, 1800, 3600, 7200, 21_600, 43_200],
} as const;

/** Returns the backoff for a given (1-based) attempt. */
export function backoffSecondsForAttempt(attempt: number): number {
  const table = QUEUE_DEFAULTS.retryBackoffSeconds;
  const index = Math.max(0, Math.min(attempt - 1, table.length - 1));
  return table[index] ?? table[table.length - 1] ?? 60;
}
