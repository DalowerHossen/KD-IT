// path: lib/config/public-env.ts
import { z } from "zod";

const DEVELOPMENT_APP_URL = "http://localhost:3000";

/** Canonical product domain used when no public URL override is configured. */
const PRODUCTION_APP_URL = "https://kdsolutionit.com";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export interface PublicEnv {
  readonly appUrl: string;
  readonly isProduction: boolean;
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
}

let cachedPublicEnv: PublicEnv | null = null;

/**
 * Safe access to public (non-secret) environment values. Explicitly set but
 * malformed values fail closed; unset browser-facing Supabase values stay
 * undefined until the application ships its hosted project (browser clients
 * fail closed at construction when required).
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv !== null) {
    return cachedPublicEnv;
  }
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_SUPABASE_URL must be valid absolute URLs.",
    );
  }
  const isProduction = process.env.NODE_ENV === "production";
  cachedPublicEnv = {
    appUrl:
      parsed.data.NEXT_PUBLIC_APP_URL ?? (isProduction ? PRODUCTION_APP_URL : DEVELOPMENT_APP_URL),
    isProduction,
    ...(parsed.data.NEXT_PUBLIC_SUPABASE_URL !== undefined
      ? { supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL }
      : {}),
    ...(parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY !== undefined
      ? { supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY }
      : {}),
  };
  return cachedPublicEnv;
}
