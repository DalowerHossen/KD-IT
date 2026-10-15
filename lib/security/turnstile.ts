// path: lib/security/turnstile.ts
import "server-only";

import { z } from "zod";

/**
 * Substep G - Cloudflare Turnstile verification. A server-side verifier for
 * the managed-captcha token a browser solves before a sensitive action.
 *
 * Verification is config-driven and fail-closed: when Turnstile is enforced
 * but the token cannot be validated (missing token, provider error, network
 * failure), the action is denied. When it is not enforced (the default, e.g.
 * in this sandbox with no provider configured), verification is a no-op so the
 * flows remain usable. The verifier never echoes the token or IP in errors.
 */

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileConfig {
  readonly enforced: boolean;
  readonly secretKey: string | null;
  readonly siteverifyUrl: string;
  readonly timeoutMs: number;
}

const turnstileConfigSchema = z.object({
  enforced: z.boolean(),
  secretKey: z.string().nullable(),
  siteverifyUrl: z.string(),
  timeoutMs: z.number().int().min(100).max(10_000),
});
export type ParsedTurnstileConfig = z.infer<typeof turnstileConfigSchema>;

let explicitConfig: TurnstileConfig | null = null;
let envConfigCache: TurnstileConfig | null = null;

/** Builds the Turnstile config from KD_TURNSTILE_* env (validated, cached). */
function buildEnvConfig(): TurnstileConfig {
  const secretKey = process.env.KD_TURNSTILE_SECRET;
  return turnstileConfigSchema.parse({
    enforced: process.env.KD_TURNSTILE_ENFORCED === "true",
    secretKey: secretKey !== undefined && secretKey.trim() !== "" ? secretKey : null,
    siteverifyUrl: TURNSTILE_SITEVERIFY_URL,
    timeoutMs: 5_000,
  });
}

/** Overrides the active configuration (env binding or tests). */
export function setTurnstileConfig(config: TurnstileConfig): void {
  explicitConfig = turnstileConfigSchema.parse(config);
  envConfigCache = null;
}

/** The active Turnstile configuration (env-derived when not explicitly set). */
export function getTurnstileConfig(): TurnstileConfig {
  if (explicitConfig) return explicitConfig;
  if (envConfigCache === null) envConfigCache = buildEnvConfig();
  return envConfigCache;
}

export interface TurnstileVerification {
  readonly valid: boolean;
  /** True when enforcement is off and no token was required. */
  readonly skipped: boolean;
  readonly success: boolean;
}

/**
 * Verifies a Turnstile token against the provider. When enforcement is off
 * this is a no-op that always passes. When on, a missing or invalid token, or
 * any provider/network error, fails closed.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  ipAddress: string | null,
  config: TurnstileConfig = getTurnstileConfig(),
): Promise<TurnstileVerification> {
  if (!config.enforced) {
    return { valid: true, skipped: true, success: true };
  }
  if (token === null || token === undefined || token.trim() === "") {
    return { valid: false, skipped: false, success: false };
  }
  if (config.secretKey === null) {
    // Enforced but unconfigured: fail closed rather than silently pass.
    return { valid: false, skipped: false, success: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const body = new URLSearchParams({
      secret: config.secretKey,
      response: token,
    });
    if (ipAddress !== null) {
      body.set("remoteip", ipAddress);
    }
    const response = await fetch(config.siteverifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { valid: false, skipped: false, success: false };
    }
    const data = (await response.json()) as { success?: boolean };
    const success = data.success === true;
    return { valid: success, skipped: false, success };
  } catch {
    // Network or parse failure: fail closed.
    return { valid: false, skipped: false, success: false };
  } finally {
    clearTimeout(timer);
  }
}
