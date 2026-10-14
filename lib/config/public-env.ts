// path: lib/config/public-env.ts
import { z } from "zod";

const DEVELOPMENT_APP_URL = "http://localhost:3000";

/** Canonical product domain used when no public URL override is configured. */
const PRODUCTION_APP_URL = "https://kdsolutionit.com";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

export interface PublicEnv {
  readonly appUrl: string;
  readonly isProduction: boolean;
}

let cachedPublicEnv: PublicEnv | null = null;

/**
 * Safe access to public (non-secret) environment values. An explicitly set
 * but malformed URL fails closed; an unset value falls back to documented
 * development and production defaults.
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv !== null) {
    return cachedPublicEnv;
  }
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be a valid absolute URL such as http://localhost:3000.",
    );
  }
  const isProduction = process.env.NODE_ENV === "production";
  cachedPublicEnv = {
    appUrl:
      parsed.data.NEXT_PUBLIC_APP_URL ?? (isProduction ? PRODUCTION_APP_URL : DEVELOPMENT_APP_URL),
    isProduction,
  };
  return cachedPublicEnv;
}
