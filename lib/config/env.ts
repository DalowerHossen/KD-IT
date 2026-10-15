// path: lib/config/env.ts
import "server-only";

import { z } from "zod";

import { ConfigurationError } from "@/lib/errors/app-errors";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional(),
);

const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * AES-256-GCM master key material encoded as base64 for exactly 32 bytes.
 * Values are validated structurally here and never logged.
 */
const masterKeySchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .min(1)
    .refine((candidate) => {
      try {
        return Buffer.from(candidate, "base64").length === 32;
      } catch {
        return false;
      }
    }, "KD_ENCRYPTION_MASTER_KEY must be base64 for exactly 32 bytes")
    .optional(),
);

const keyVersionSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? value : parsed;
}, z.number().int().min(1).max(2147483647).optional());

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SENTRY_DSN: optionalUrl,
    CSP_REPORT_URI: optionalUrl,
    KD_DATA_PLANE_ENABLED: z.enum(["true", "false"]).optional(),
    SUPABASE_URL: optionalUrl,
    SUPABASE_ANON_KEY: optionalNonEmpty,
    SUPABASE_SERVICE_ROLE_KEY: optionalNonEmpty,
    KD_DATABASE_URL: optionalNonEmpty,
    KD_ENCRYPTION_MASTER_KEY: masterKeySchema,
    KD_ENCRYPTION_KEY_VERSION: keyVersionSchema,
    // Substep G: network and abuse protection.
    KD_TURNSTILE_SECRET: optionalNonEmpty,
    KD_TURNSTILE_ENFORCED: z.enum(["true", "false"]).optional(),
    KD_NETWORK_RISK_ENFORCED: z.enum(["true", "false"]).optional(),
    // Substep H: universal SMTP email.
    KD_EMAIL_PROVIDER: z.enum(["supabase", "smtp"]).optional(),
    KD_EMAIL_FROM: optionalNonEmpty,
    KD_RESEND_API_KEY: optionalNonEmpty,
    KD_RESEND_BASE_URL: optionalUrl,
    KD_SMTP_HOST: optionalNonEmpty,
    KD_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    KD_SMTP_SECURE: z.enum(["true", "false"]).optional(),
    KD_SMTP_USERNAME: optionalNonEmpty,
    KD_SMTP_PASSWORD: z.string().optional(),
  })
  .superRefine((env, context) => {
    const requireAll = (keys: readonly (keyof typeof env)[], reason: string): void => {
      for (const key of keys) {
        if (env[key] === undefined) {
          context.addIssue({
            code: "custom",
            path: [String(key)],
            message: `${String(key)} is required ${reason}`,
          });
        }
      }
    };

    const supabaseKeys = [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ] as const;
    const encryptionKeys = ["KD_ENCRYPTION_MASTER_KEY", "KD_ENCRYPTION_KEY_VERSION"] as const;

    const anySet = (keys: readonly (keyof typeof env)[]): boolean =>
      keys.some((key) => env[key] !== undefined);

    if (anySet(supabaseKeys)) {
      requireAll(supabaseKeys, "when any Supabase variable is configured");
    }
    if (anySet(encryptionKeys)) {
      requireAll(encryptionKeys, "when any encryption variable is configured");
    }
    if (env.NODE_ENV === "production" && env.KD_DATA_PLANE_ENABLED === "true") {
      requireAll(
        [...supabaseKeys, "KD_DATABASE_URL", ...encryptionKeys] as const,
        "when the data plane is enabled in production",
      );
    }
  });

/**
 * Production deployments that enable the data plane (KD_DATA_PLANE_ENABLED=true)
 * are hard-validated at boot by the superRefine above. Deployments that
 * serve foundation surfaces only remain bootable; every Step 02 service
 * additionally validates its own configuration at use-time and fails closed.
 */
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

function writeBootLog(level: "info" | "error", message: string, issues?: readonly string[]): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "kd-solution-it",
    message,
    ...(issues ? { issues } : {}),
  });
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

/**
 * Validates the process environment with Zod at server boot. Missing or
 * malformed configuration fails fast and closed: the process never starts
 * with an unsafe configuration. Variable values are never logged; only
 * variable names and rule descriptions appear in diagnostics.
 */
export function validateServerEnvOnBoot(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    writeBootLog("error", "environment.validation_failed", issues);
    throw new ConfigurationError(
      `Invalid environment configuration. Fix the reported variables and restart.`,
      { details: { issues } },
    );
  }
  cachedServerEnv = parsed.data;
  writeBootLog("info", "environment.validated");
  return parsed.data;
}

/** Returns the validated server environment, validating lazily if needed. */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv !== null) {
    return cachedServerEnv;
  }
  return validateServerEnvOnBoot();
}

/**
 * Returns the decoded encryption master key for the active key version.
 * Separated from the schema so the raw material is opened exactly once per
 * process and never serialized into logs or error payloads.
 */
export function getEncryptionMasterKeyMaterial(): Buffer {
  const env = getServerEnv();
  if (env.KD_ENCRYPTION_MASTER_KEY === undefined || env.KD_ENCRYPTION_KEY_VERSION === undefined) {
    throw new ConfigurationError(
      "Encryption is not configured. Set KD_ENCRYPTION_MASTER_KEY and KD_ENCRYPTION_KEY_VERSION.",
    );
  }
  return Buffer.from(env.KD_ENCRYPTION_MASTER_KEY, "base64");
}

/** Returns the configured encryption key version or fails closed. */
export function getEncryptionKeyVersion(): number {
  const env = getServerEnv();
  if (env.KD_ENCRYPTION_KEY_VERSION === undefined) {
    throw new ConfigurationError("KD_ENCRYPTION_KEY_VERSION is not configured.");
  }
  return env.KD_ENCRYPTION_KEY_VERSION;
}
