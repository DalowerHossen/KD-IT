// path: lib/db/repositories/leader.ts
import "server-only";

import { pgQuery } from "@/lib/db/pg";

/**
 * Leader election repository. app.leader_try_acquire acquires or renews a
 * named job lock atomically; scheduled jobs everywhere check leadership
 * through exactly this function so two schedulers never fire the same
 * recurring job concurrently.
 */

export async function tryAcquireJobLeader(
  companyId: string,
  lockName: string,
  holder: string,
  ttlSeconds: number,
): Promise<boolean> {
  const result = await pgQuery("select app.leader_try_acquire($1::uuid, $2, $3, $4) as acquired", [
    companyId,
    lockName,
    holder,
    ttlSeconds,
  ]);
  const row = result.rows[0] as { acquired: boolean } | undefined;
  return row?.acquired === true;
}

export async function releaseJobLeader(
  companyId: string,
  lockName: string,
  holder: string,
): Promise<void> {
  await pgQuery("select app.leader_release($1::uuid, $2, $3)", [companyId, lockName, holder]);
}
