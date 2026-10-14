// path: lib/config/env.ts
import "server-only";

import { z } from "zod";

import { ConfigurationError } from "@/lib/errors/app-errors";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional(),
);

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SENTRY_DSN: optionalUrl,
  CSP_REPORT_URI: optionalUrl,
});

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
 * with an unsafe configuration. Variable values are never logged.
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
