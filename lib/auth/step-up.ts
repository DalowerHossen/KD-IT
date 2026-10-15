// path: lib/auth/step-up.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readAssurance } from "@/lib/auth/flows/mfa";
import {
  STEP_UP_TTL_MINUTES_DEFAULT,
  clampStepUpTtlMinutes,
  isCriticalAction,
  stepUpRequired,
} from "@/lib/auth/mfa-policy";
import { ReauthRequiredError } from "@/lib/errors/app-errors";

/**
 * Fresh-reauthentication gate for critical actions. A critical action is
 * allowed only when the session's last second-factor verification is present
 * and newer than the TTL; otherwise a ReauthRequiredError is raised so the
 * client re-prompts the MFA challenge and the action is retried once the
 * session is fresh again. Non-critical actions pass through untouched. The
 * step-up check reads the JWT's AMR (no extra provider round-trip beyond the
 * local claim read) and is independent of the aal2 session gate.
 */
export async function requireFreshReauthentication(
  client: SupabaseClient,
  actionId: string,
): Promise<void> {
  if (!isCriticalAction(actionId)) {
    return;
  }
  const assurance = await readAssurance(client);
  const ttl = clampStepUpTtlMinutes(STEP_UP_TTL_MINUTES_DEFAULT);
  const now = Math.floor(Date.now() / 1000);
  const required = stepUpRequired({
    role: "staff",
    isCriticalAction: true,
    lastAal2VerifiedAt: assurance.lastAal2VerifiedAt,
    now,
    ttlMinutes: ttl,
  });
  if (required) {
    throw new ReauthRequiredError("Verify your identity again to continue.", {
      actionId,
    });
  }
}
