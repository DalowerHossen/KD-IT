// path: lib/logging/logger.ts
import "server-only";

import { redactContext } from "@/lib/logging/redaction";

/** Structured log levels ordered by severity. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export interface LoggerBindings {
  readonly service: string;
  readonly environment?: string;
  readonly version?: string;
  readonly correlationId?: string;
}

export type LogContext = Record<string, unknown>;

function resolveMinimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  if (configured !== undefined && (LOG_LEVELS as readonly string[]).includes(configured)) {
    return configured as LogLevel;
  }
  return "info";
}

/**
 * Structured JSON logger. Writes one redacted JSON line per event to stdout
 * (debug/info) or stderr (warn/error). Application code never writes to the
 * runtime console directly; it always goes through this logger.
 */
export class Logger {
  private readonly bindings: Record<string, unknown>;

  constructor(bindings: Record<string, unknown>) {
    this.bindings = redactContext(bindings);
  }

  child(extra: Record<string, unknown>): Logger {
    return new Logger({ ...this.bindings, ...extra });
  }

  withCorrelation(correlationId: string): Logger {
    return this.child({ correlationId });
  }

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[resolveMinimumLevel()]) {
      return;
    }
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...(context === undefined ? {} : redactContext(context)),
    };
    const line = `${JSON.stringify(entry)}\n`;
    if (level === "warn" || level === "error") {
      process.stderr.write(line);
      return;
    }
    process.stdout.write(line);
  }
}

export function createLogger(bindings: LoggerBindings): Logger {
  return new Logger({
    service: bindings.service,
    environment: bindings.environment ?? process.env.NODE_ENV ?? "development",
    ...(bindings.version === undefined ? {} : { version: bindings.version }),
    ...(bindings.correlationId === undefined ? {} : { correlationId: bindings.correlationId }),
  });
}

export const rootLogger: Logger = createLogger({ service: "kd-solution-it" });
