// path: lib/db/repositories/auth-attempts.ts
import "server-only";

import { z } from "zod";

import {
  type AuthFactor,
  authFactorSchema,
  type AuthOutcome,
  authOutcomeSchema,
} from "@/lib/auth/schemas";
import { pgQuery } from "@/lib/db/pg";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { genericUuidSchema } from "@/lib/validation/zod-helpers";

/**
 * Authentication-attempt repository (insert path). Every login, recovery,
 * and password verification writes one evidence row keyed by the HMAC
 * subject hash; the user id stays null until the subject resolves. Lockout
 * evaluation and attempt reads are owned by Substep C, which extends this
 * module without changing the evidence contract.
 */
export const recordAttemptInputSchema = z.strictObject({
  subjectHash: z.string().regex(/^[0-9a-f]{64}$/),
  userId: genericUuidSchema.nullable(),
  factor: authFactorSchema,
  outcome: authOutcomeSchema,
  failureReasonCode: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,60}$/)
    .nullable(),
  lockedAfter: z.boolean(),
  ip: z.string().max(64).nullable(),
  userAgentHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
});
export type RecordAttemptInput = z.infer<typeof recordAttemptInputSchema>;

export type { AuthFactor, AuthOutcome };

/** Appends one attempt-evidence row. Never throws for unknown subjects. */
export async function recordAuthAttempt(input: RecordAttemptInput): Promise<void> {
  const validated = recordAttemptInputSchema.parse(input);
  await pgQuery(
    `insert into app.auth_attempts (
       company_id, subject_hash, user_id, factor, outcome,
       failure_reason_code, locked_after, ip_address, user_agent_hash
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)`,
    [
      PLATFORM_COMPANY_ID,
      validated.subjectHash,
      validated.userId,
      validated.factor,
      validated.outcome,
      validated.failureReasonCode,
      validated.lockedAfter,
      validated.ip,
      validated.userAgentHash,
    ],
  );
}
