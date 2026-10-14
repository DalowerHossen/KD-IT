// path: lib/storage/supabase-storage.ts
import "server-only";

import { ExternalServiceError } from "@/lib/errors/app-errors";
import { getPrivilegedSupabaseClient } from "@/lib/db/clients/supabase";
import type {
  ProviderHealth,
  ProviderObjectRef,
  StorageProviderAdapter,
} from "@/lib/storage/provider-interface";

/**
 * Supabase Storage adapter. Uses the privileged server client so storage
 * buckets stay private and server-mediated; browser clients never receive
 * storage upload capabilities.
 */

export const DEFAULT_STORAGE_BUCKET = "kd-files";
const STORAGE_TIMEOUT_MS = 30_000;

export class SupabaseStorageAdapter implements StorageProviderAdapter {
  readonly name = "supabase_storage" as const;

  constructor(private readonly bucket: string = DEFAULT_STORAGE_BUCKET) {
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(bucket)) {
      throw new ExternalServiceError("Supabase storage bucket name is invalid.");
    }
  }

  private storage(): ReturnType<ReturnType<typeof getPrivilegedSupabaseClient>["storage"]["from"]> {
    const client = getPrivilegedSupabaseClient();
    return client.storage.from(this.bucket);
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), STORAGE_TIMEOUT_MS),
      );
      const probe = this.storage().list("", { limit: 1 });
      const { error } = await Promise.race([probe, timeout]);
      const latencyMs = Date.now() - started;
      if (error !== null) {
        return { status: "unhealthy", latencyMs };
      }
      return { status: latencyMs > 1500 ? "degraded" : "healthy", latencyMs };
    } catch {
      return { status: "unhealthy", latencyMs: Date.now() - started };
    }
  }

  async uploadObject(
    bytes: Buffer,
    objectKey: string,
    mimeType: string,
  ): Promise<ProviderObjectRef> {
    const { data, error } = await this.storage().upload(objectKey, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (error !== null || data === null) {
      throw new ExternalServiceError("Supabase storage upload failed.");
    }
    return { providerObjectId: data.path, etag: null };
  }

  async downloadObject(ref: ProviderObjectRef): Promise<Buffer> {
    const { data, error } = await this.storage().download(ref.providerObjectId);
    if (error !== null || data === null) {
      throw new ExternalServiceError("Supabase storage download failed.");
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteObject(ref: ProviderObjectRef): Promise<void> {
    const { error } = await this.storage().remove([ref.providerObjectId]);
    if (error !== null) {
      throw new ExternalServiceError("Supabase storage delete failed.");
    }
  }
}

/** Object key convention: tenant-scoped, traversal-proof by construction. */
export function supabaseStorageObjectKey(companyId: string, fileId: string): string {
  return `${companyId}/${fileId}`;
}
