// path: lib/storage/provider-selection.ts
import "server-only";

import { ExternalServiceError } from "@/lib/errors/app-errors";
import type { TenantContext } from "@/lib/db/tenant-context";
import { getConfigurationValue } from "@/lib/db/repositories/config";
import {
  listStorageConnections,
  loadConnectionCredentials,
  recordStorageHealth,
} from "@/lib/db/repositories/storage-connections";
import { DEFAULT_STORAGE_BUCKET } from "@/lib/storage/supabase-storage";
import { GoogleDriveStorageAdapter, validateDriveCredentials } from "@/lib/storage/google-drive";
import type { StorageProviderAdapter, StorageProviderName } from "@/lib/storage/provider-interface";
import { SupabaseStorageAdapter } from "@/lib/storage/supabase-storage";

/**
 * Provider routing with automatic failover. Write paths prefer Google
 * Drive when its connection is enabled and healthy; otherwise they fall
 * back to Supabase Storage when healthy; otherwise they fail closed.
 * Health is cached briefly so upload hot paths never thrash provider
 * liveness probes, and failed probes are recorded for operators.
 */

const HEALTH_CACHE_TTL_MS = 60_000;

let providerHealthCache: Map<
  string,
  { status: "healthy" | "degraded" | "unhealthy"; checkedAtMs: number }
> | null = null;

function healthCache(): Map<
  string,
  { status: "healthy" | "degraded" | "unhealthy"; checkedAtMs: number }
> {
  if (providerHealthCache === null) {
    providerHealthCache = new Map();
  }
  return providerHealthCache;
}

export async function resolveStorageProvider(
  context: TenantContext,
  provider: StorageProviderName,
): Promise<StorageProviderAdapter> {
  if (provider === "supabase_storage") {
    return new SupabaseStorageAdapter(await readBucketName(context));
  }
  const credentials = validateDriveCredentials(
    await loadConnectionCredentials(context, "google_drive"),
  );
  return new GoogleDriveStorageAdapter(credentials);
}

/**
 * Reads the configured Supabase bucket from tenant configuration. The
 * registry holds no secrets for Supabase Storage (the privileged server
 * client is its own authority), only the bucket name.
 */
async function readBucketName(context: TenantContext): Promise<string> {
  const configured = await getConfigurationValue(context, "storage.supabase_bucket").catch(
    () => null,
  );
  if (configured !== null && typeof configured === "object" && "bucket" in configured) {
    const candidate = (configured as { bucket: unknown }).bucket;
    if (typeof candidate === "string" && /^[a-z][a-z0-9-]{2,60}$/.test(candidate)) {
      return candidate;
    }
  }
  return DEFAULT_STORAGE_BUCKET;
}

async function probeProvider(
  context: TenantContext,
  provider: StorageProviderName,
): Promise<"healthy" | "degraded" | "unhealthy"> {
  const cacheKey = `${context.companyId}:${provider}`;
  const cached = healthCache().get(cacheKey);
  if (cached !== undefined && cached.checkedAtMs > Date.now() - HEALTH_CACHE_TTL_MS) {
    return cached.status;
  }
  let status: "healthy" | "degraded" | "unhealthy";
  try {
    const adapter = await resolveStorageProvider(context, provider);
    const health = await adapter.healthCheck();
    status = health.status;
    await recordStorageHealth(context.companyId, provider, status, null);
  } catch {
    status = "unhealthy";
    await recordStorageHealth(context.companyId, provider, "unhealthy", "adapter or probe failure");
  }
  healthCache().set(cacheKey, { status, checkedAtMs: Date.now() });
  return status;
}

/**
 * Selects an upload provider. Google Drive is the platform preference;
 * Supabase Storage is the automatic alternate. When both are unavailable
 * the caller receives a fail-closed error and no upload proceeds.
 */
export async function selectUploadProvider(
  context: TenantContext,
): Promise<StorageProviderAdapter> {
  const connections = await listStorageConnections(context);
  const driveConnection = connections.find((row) => row.provider === "google_drive");
  if (driveConnection !== undefined && driveConnection.status === "enabled") {
    const driveHealth = await probeProvider(context, "google_drive");
    if (driveHealth !== "unhealthy") {
      return resolveStorageProvider(context, "google_drive");
    }
  }
  const supabaseConnection = connections.find((row) => row.provider === "supabase_storage");
  if (supabaseConnection !== undefined && supabaseConnection.status === "enabled") {
    const supabaseHealth = await probeProvider(context, "supabase_storage");
    if (supabaseHealth !== "unhealthy") {
      return resolveStorageProvider(context, "supabase_storage");
    }
  }
  throw new ExternalServiceError(
    "No storage provider is currently healthy. File storage is temporarily unavailable.",
  );
}

/** Flushes cached health entries (operator-driven refresh, and migration sweeps). */
export function resetProviderHealthCache(): void {
  healthCache().clear();
}
