// path: lib/auth/session-risk.ts
import { createHash } from "node:crypto";

/**
 * Suspicious-session signal assessment. Pure signal detection over the
 * stored session signals and the current request; the session resolver
 * emits audit and outbox events when signals fire. The full risk engine
 * (scoring, step-up challenges, auto-suspend) is owned by Step 15, which
 * extends this hook without replacing it.
 */
export type SessionRiskSignal = "ip-changed" | "user-agent-changed";

export interface SessionRiskInput {
  readonly storedIp: string | null;
  readonly currentIp: string | null;
  readonly storedUserAgentHash: string | null;
  readonly currentUserAgent: string | null;
}

/** SHA-256 hash of a user agent for signal comparison. */
export function hashUserAgentSignal(userAgent: string | null): string | null {
  if (userAgent === null || userAgent.trim() === "") {
    return null;
  }
  return createHash("sha256").update(userAgent, "utf8").digest("hex");
}

/** Signals that fired for this request; empty means no change detected. */
export function assessSessionRisk(input: SessionRiskInput): readonly SessionRiskSignal[] {
  const signals: SessionRiskSignal[] = [];
  if (input.storedIp !== null && input.currentIp !== null && input.storedIp !== input.currentIp) {
    signals.push("ip-changed");
  }
  const currentHash = hashUserAgentSignal(input.currentUserAgent);
  if (
    input.storedUserAgentHash !== null &&
    currentHash !== null &&
    input.storedUserAgentHash !== currentHash
  ) {
    signals.push("user-agent-changed");
  }
  return signals;
}
