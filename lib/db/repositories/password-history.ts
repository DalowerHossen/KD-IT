// path: lib/db/repositories/password-history.ts
import "server-only";

import { z } from "zod";

import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { genericUuidSchema } from "@/lib/validation/zod-helpers";

/**
 * Password-history repository. Stores scrypt verifiers of previously used
 * passwords so reuse checks never need a provider round trip. Verifiers
 * never leave the server boundary: this module returns them only to the
 * password-change flow, which compares in constant time and never logs
 * them. Every write keeps the newest five entries per user.
 */
const historyHashSchema = z.string().min(32).max(512);

/** Recent verifiers for a user, newest first. Server boundary only. */
export async function listRecentPasswordHashes(
  userId: string,
  limit = 5,
): Promise<readonly string[]> {
  const validated = genericUuidSchema.parse(userId);
  const result = await pgQuery(
    `select password_hash
     from app.password_history
     where user_id = $1
       and company_id = $2
       and deleted_at is null
     order by created_at desc, id desc
     limit $3`,
    [validated, PLATFORM_COMPANY_ID, Math.max(limit, 1)],
  );
  return result.rows.map((row) =>
    historyHashSchema.parse((row as { password_hash: unknown }).password_hash),
  );
}

/**
 * Records a new verifier and prunes older entries beyond the newest five,
 * atomically. Pruned rows are hard-deleted: history exists only to block
 * reuse, and stale verifiers have no audit value.
 */
export async function recordPasswordHash(userId: string, passwordHash: string): Promise<void> {
  const validatedUser = genericUuidSchema.parse(userId);
  const validatedHash = historyHashSchema.parse(passwordHash);
  await withPgTransaction(async (client) => {
    await client.query(
      `insert into app.password_history (company_id, user_id, password_hash)
       values ($1, $2, $3)`,
      [PLATFORM_COMPANY_ID, validatedUser, validatedHash],
    );
    await client.query(
      `delete from app.password_history
       where user_id = $1
         and company_id = $2
         and id not in (
           select id
           from app.password_history
           where user_id = $1
             and company_id = $2
           order by created_at desc, id desc
           limit 5
         )`,
      [validatedUser, PLATFORM_COMPANY_ID],
    );
  });
}
