// path: lib/email/credentials.ts
import "server-only";

import { z } from "zod";

import { getEncryptionKeyVersion } from "@/lib/config/env";
import { decryptData, encryptData, type EncryptionContext } from "@/lib/crypto/envelope";
import type { TenantContext } from "@/lib/db/tenant-context";
import { pgQuery } from "@/lib/db/pg";
import { withPgTransaction } from "@/lib/db/pg";
import type { EmailCredential, EmailProvider } from "@/lib/email/types";
import { ValidationError } from "@/lib/errors/app-errors";

const CREDENTIAL_CATEGORY = "email-credential";

const credentialJsonSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resend"),
    apiKey: z.string().min(1).max(256),
    from: z.string().email().max(320),
    baseUrl: z.string().url().max(256),
  }),
  z.object({
    kind: z.literal("smtp"),
    host: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().min(0).max(256),
    password: z.string().min(0).max(512),
    from: z.string().email().max(320),
  }),
]);
type CredentialJson = z.infer<typeof credentialJsonSchema>;

const credentialColumns =
  "id, company_id, provider, from_address, credentials_ciphertext, credentials_nonce, credentials_tag, credentials_key_version, verified, verified_at, version";

function contextFor(companyId: string, provider: EmailProvider): EncryptionContext {
  return {
    companyId,
    resourceId: provider,
    category: CREDENTIAL_CATEGORY,
    keyVersion: getEncryptionKeyVersion(),
  };
}

/**
 * Substep H - encrypted provider credentials. The credential object is
 * encrypted with the platform envelope (AES-256-GCM) bound to
 * (company, provider) and stored as an envelope; it is decrypted only inside
 * the server send/verify boundary and never written to logs or audit.
 */
export async function saveEmailCredential(
  context: TenantContext,
  input: {
    readonly provider: EmailProvider;
    readonly fromAddress: string;
    readonly credential: EmailCredential;
  },
): Promise<{ readonly id: string; readonly version: number }> {
  const canonical = Buffer.from(
    JSON.stringify(credentialJsonSchema.parse(input.credential)),
    "utf8",
  );
  const envelope = encryptData(contextFor(context.companyId, input.provider), canonical);
  return withPgTransaction(async (client) => {
    const existing = await client.query(
      `select ${credentialColumns} from app.email_credentials
        where company_id = $1 and provider = $2 and deleted_at is null for update`,
      [context.companyId, input.provider],
    );
    const row = existing.rows[0] as { id: string; version: number } | undefined;
    if (row === undefined) {
      const inserted = await client.query(
        `insert into app.email_credentials
           (company_id, provider, from_address, credentials_ciphertext, credentials_nonce,
            credentials_tag, credentials_key_version)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning ${credentialColumns}`,
        [
          context.companyId,
          input.provider,
          input.fromAddress,
          envelope.ciphertext,
          envelope.nonce,
          envelope.tag,
          envelope.keyVersion,
        ],
      );
      const next = inserted.rows[0] as { id: string; version: number };
      return { id: next.id, version: next.version };
    }
    await client.query(
      `update app.email_credentials
          set from_address = $3, credentials_ciphertext = $4, credentials_nonce = $5,
              credentials_tag = $6, credentials_key_version = $7
        where id = $1 and version = $2`,
      [
        row.id,
        row.version,
        input.fromAddress,
        envelope.ciphertext,
        envelope.nonce,
        envelope.tag,
        envelope.keyVersion,
      ],
    );
    return { id: row.id, version: row.version + 1 };
  });
}

/** Reads and decrypts a stored credential. Returns null when none exists. */
export async function getEmailCredential(
  companyId: string,
  provider: EmailProvider,
): Promise<EmailCredential | null> {
  const result = await pgQuery(
    `select ${credentialColumns} from app.email_credentials
      where company_id = $1 and provider = $2 and deleted_at is null`,
    [companyId, provider],
  );
  const row = result.rows[0] as
    | {
        credentials_ciphertext: Buffer;
        credentials_nonce: Buffer;
        credentials_tag: Buffer;
        credentials_key_version: number;
      }
    | undefined;
  if (row === undefined) {
    return null;
  }
  const plaintext = decryptData(
    { companyId, resourceId: provider, category: CREDENTIAL_CATEGORY },
    {
      ciphertext: row.credentials_ciphertext,
      nonce: row.credentials_nonce,
      tag: row.credentials_tag,
      keyVersion: row.credentials_key_version,
    },
  );
  const parsed = credentialJsonSchema.parse(JSON.parse(plaintext.toString("utf8")));
  return parsed as EmailCredential;
}

/** Records the outcome of a connection verification on a stored credential. */
export async function markCredentialVerified(id: string, verified: boolean): Promise<void> {
  await pgQuery(
    `update app.email_credentials
        set verified = $2, verified_at = case when $2 then clock_timestamp() else verified_at end
      where id = $1 and deleted_at is null`,
    [id, verified],
  );
}

export interface StoredCredentialRef {
  readonly id: string;
  readonly provider: EmailProvider;
  readonly fromAddress: string;
  readonly verified: boolean;
}

/** Lists stored credentials (metadata only; never the decrypted value). */
export async function listEmailCredentials(companyId: string): Promise<StoredCredentialRef[]> {
  const result = await pgQuery(
    `select id, provider, from_address, verified from app.email_credentials
      where company_id = $1 and deleted_at is null order by provider`,
    [companyId],
  );
  return (
    result.rows as Array<{
      id: string;
      provider: EmailProvider;
      from_address: string;
      verified: boolean;
    }>
  ).map((row) => ({
    id: row.id,
    provider: row.provider,
    fromAddress: row.from_address,
    verified: row.verified,
  }));
}

export function validateCredential(
  provider: EmailProvider,
  credential: EmailCredential,
): EmailCredential {
  if (credential.kind !== provider) {
    throw new ValidationError("The credential does not match the selected provider.");
  }
  return credential;
}

export type { CredentialJson };
