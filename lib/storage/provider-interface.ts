// path: lib/storage/provider-interface.ts
import "server-only";

import { z } from "zod";

/**
 * Step 02 runtime file storage contract. File metadata and ciphertext
 * references live in PostgreSQL; bytes live behind exactly one of these
 * adapters. File read paths always honor the recorded storage_provider on
 * the file row; write paths select the healthy preferred provider.
 */

export const storageProviderSchema = z.enum(["google_drive", "supabase_storage"]);
export type StorageProviderName = z.infer<typeof storageProviderSchema>;

export const providerObjectRefSchema = z.object({
  providerObjectId: z.string().min(1).max(1024),
  etag: z.string().nullable(),
});
export type ProviderObjectRef = z.infer<typeof providerObjectRefSchema>;

export interface ProviderHealth {
  readonly status: "healthy" | "degraded" | "unhealthy";
  readonly latencyMs: number;
}

export interface StorageProviderAdapter {
  readonly name: StorageProviderName;
  /** Cheap liveness + reachability probe, used by selection and health sweeps. */
  healthCheck(): Promise<ProviderHealth>;
  /** Uploads ciphertext bytes exactly once; returns the provider object id. */
  uploadObject(bytes: Buffer, objectKey: string, mimeType: string): Promise<ProviderObjectRef>;
  /** Downloads the exact bytes previously uploaded under providerObjectId. */
  downloadObject(ref: ProviderObjectRef): Promise<Buffer>;
  /** Deletes a stored object after its retention window has passed. */
  deleteObject(ref: ProviderObjectRef): Promise<void>;
}

export interface StoredFileEnvelope {
  readonly ref: ProviderObjectRef;
  readonly byteLength: number;
  readonly sha256: string;
}

/** OneSSCF consumer hint: adapter names exactly match DB CHECK values. */
export const STORAGE_PROVIDER_NAMES: readonly StorageProviderName[] = [
  "google_drive",
  "supabase_storage",
];
