// path: lib/storage/google-drive.ts
import "server-only";

import { createSign } from "node:crypto";

import { z } from "zod";

import { ExternalServiceError, ValidationError } from "@/lib/errors/app-errors";
import type {
  ProviderHealth,
  ProviderObjectRef,
  StorageProviderAdapter,
} from "@/lib/storage/provider-interface";

/**
 * Google Drive v3 adapter over plain REST using a service-account JWT
 * bearer (RFC 7523). Kept SDK-free deliberately so privileged-cloud-surface
 * exposure stays small, auditable, and pinned. Credentials arrive only
 * decrypted in-memory from the encrypted connection registry, never from
 * source or logs.
 */

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
export const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export const driveCredentialsSchema = z.object({
  client_email: z.string().email(),
  private_key: z
    .string()
    .min(100)
    .refine((value) => value.includes("BEGIN PRIVATE KEY"), {
      message: "Drive credentials must contain a PEM private key.",
    }),
  token_uri: z.url().default(GOOGLE_OAUTH_TOKEN_ENDPOINT),
  folder_id: z.string().min(1).optional(),
});
export type DriveCredentials = z.infer<typeof driveCredentialsSchema>;

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function buildServiceAccountJwt(credentials: DriveCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: credentials.client_email,
    scope: DRIVE_SCOPE,
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(credentials.private_key, "base64url");
  return `${unsigned}.${signature}`;
}

async function obtainAccessToken(credentials: DriveCredentials): Promise<string> {
  const assertion = buildServiceAccountJwt(credentials);
  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new ExternalServiceError("Google Drive authentication request failed.");
  });
  if (!response.ok) {
    throw new ExternalServiceError("Google Drive rejected service-account authentication.");
  }
  const body = z.object({ access_token: z.string().min(10) }).parse(await response.json());
  return body.access_token;
}

interface CachedToken {
  token: string;
  refreshAtMs: number;
}

export class GoogleDriveStorageAdapter implements StorageProviderAdapter {
  readonly name = "google_drive" as const;
  private cachedToken: CachedToken | null = null;
  private readonly credentials: DriveCredentials;

  constructor(credentials: DriveCredentials) {
    driveCredentialsSchema.parse(credentials);
    this.credentials = credentials;
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken !== null && this.cachedToken.refreshAtMs > Date.now() + 60_000) {
      return this.cachedToken.token;
    }
    const token = await obtainAccessToken(this.credentials);
    this.cachedToken = { token, refreshAtMs: Date.now() + 3300_000 };
    return token;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const token = await this.accessToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {
      throw new ExternalServiceError("Could not reach Google Drive.");
    });
    return response;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const response = await this.request(`${DRIVE_API_BASE}/about?fields=storageQuota`, {
        method: "GET",
      });
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        return { status: "unhealthy", latencyMs };
      }
      return { status: latencyMs > 2500 ? "degraded" : "healthy", latencyMs };
    } catch {
      return { status: "unhealthy", latencyMs: Date.now() - started };
    }
  }

  async uploadObject(
    bytes: Buffer,
    objectKey: string,
    mimeType: string,
  ): Promise<ProviderObjectRef> {
    const metadata: Record<string, unknown> = { name: objectKey, mimeType };
    if (this.credentials.folder_id !== undefined) {
      metadata["parents"] = [this.credentials.folder_id];
    }
    const boundary = `kd-upload-${Date.now().toString(36)}`;
    const multipart = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        "utf8",
      ),
      Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`, "utf8"),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);
    const response = await this.request(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,md5Checksum`,
      {
        method: "POST",
        headers: { "content-type": `multipart/related; boundary=${boundary}` },
        body: multipart,
      },
    );
    if (!response.ok) {
      throw new ExternalServiceError("Google Drive upload failed.");
    }
    const body = z
      .object({ id: z.string().min(1), md5Checksum: z.string().optional() })
      .parse(await response.json());
    return { providerObjectId: body.id, etag: body.md5Checksum ?? null };
  }

  async downloadObject(ref: ProviderObjectRef): Promise<Buffer> {
    const response = await this.request(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(ref.providerObjectId)}?alt=media`,
      {
        method: "GET",
      },
    );
    if (!response.ok) {
      throw new ExternalServiceError("Google Drive download failed.");
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteObject(ref: ProviderObjectRef): Promise<void> {
    const response = await this.request(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(ref.providerObjectId)}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new ExternalServiceError("Google Drive delete failed.");
    }
  }
}

/** Validates drive credentials structurally before registering them. */
export function validateDriveCredentials(raw: unknown): DriveCredentials {
  const parsed = driveCredentialsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Google Drive credentials are malformed.", {
      details: { issues: parsed.error.issues.map((issue) => issue.path.join(".")) },
    });
  }
  return parsed.data;
}
