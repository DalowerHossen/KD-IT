// path: instrumentation.ts

/**
 * Server startup hook. The Node.js runtime validates the environment with
 * Zod before serving traffic and fails fast when configuration is invalid,
 * so the process never runs with unsafe settings.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateServerEnvOnBoot } = await import("@/lib/config/env");
    validateServerEnvOnBoot();
  }
}
