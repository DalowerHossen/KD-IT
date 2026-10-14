// path: lib/db/clients/browser.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/config/public-env";

/**
 * Step 02 browser-side Supabase client. Constructed exclusively with the
 * publishable anon key from the public environment contract, so nothing
 * privileged can ever leak into shipped bundles. RLS in the database fully
 * constrains what this client can observe.
 */
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient !== null) {
    return browserClient;
  }
  const publicEnv = getPublicEnv();
  if (publicEnv.supabaseUrl === undefined || publicEnv.supabaseAnonKey === undefined) {
    throw new Error("Public Supabase configuration is missing from the browser bundle.");
  }
  browserClient = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return browserClient;
}
