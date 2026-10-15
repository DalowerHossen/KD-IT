// path: lib/db/repositories/rate-limit.ts
import "server-only";

import { z } from "zod";

import { pgQuery } from "@/lib/db/pg";
import { RateLimitError } from "@/lib/errors/app-errors";

/**
 * Rate-limit repository. The single-write atomic SQL function
 * app.rate_limit_hit check-and-increments inside the database, which makes
 * concurrent callers unable to overshoot a limit.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly current: number;
  readonly limit: number;
  readonly retryAfterSeconds: number;
}

const rateLimitResultSchema = z.object({
  allowed: z.boolean(),
  current: z.number().int().min(0),
  limit: z.number().int().min(1),
  retry_after_seconds: z.number().int().min(-1),
});

export async function rateLimitHit(
  companyId: string,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const result = await pgQuery("select app.rate_limit_hit($1::uuid, $2, $3, $4) as outcome", [
    companyId,
    bucketKey,
    limit,
    windowSeconds,
  ]);
  const row = result.rows[0] as { outcome: unknown } | undefined;
  const parsed = rateLimitResultSchema.parse(row?.outcome);
  return {
    allowed: parsed.allowed,
    current: parsed.current,
    limit: parsed.limit,
    retryAfterSeconds: Math.max(parsed.retry_after_seconds, 0),
  };
}

/** Fails closed with a generic 429 when a bucket budget is exhausted. */
export function requireRateLimitBudget(outcome: RateLimitResult): void {
  if (!outcome.allowed) {
    throw new RateLimitError("Too many attempts. Try again later.", {
      details: { retryAfterSeconds: outcome.retryAfterSeconds },
    });
  }
}
