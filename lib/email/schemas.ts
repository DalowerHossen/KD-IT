// path: lib/email/schemas.ts
import { z } from "zod";

import type { EmailCredential, EmailProvider } from "@/lib/email/types";

/**
 * Substep H - request schemas for the email administration surface. The
 * credential is discriminated by provider; optional fields are normalized to
 * their defaults here so the stored credential is always complete.
 */

const resendCredentialSchema = z.object({
  kind: z.literal("resend"),
  apiKey: z.string().min(1).max(256),
  from: z.string().email().max(320),
  baseUrl: z.string().url().max(256).optional(),
});

const smtpCredentialSchema = z.object({
  kind: z.literal("smtp"),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().optional(),
  username: z.string().min(0).max(256).optional(),
  password: z.string().min(0).max(512).optional(),
  from: z.string().email().max(320),
});

export const verifyEmailRequestSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("resend"), credential: resendCredentialSchema }).strict(),
  z.object({ provider: z.literal("smtp"), credential: smtpCredentialSchema }).strict(),
]);
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** Normalizes an incoming credential to the complete stored shape. */
export function normalizeCredential(request: VerifyEmailRequest): EmailCredential {
  if (request.provider === "resend") {
    const { kind, apiKey, from, baseUrl } = request.credential;
    return { kind, apiKey, from, baseUrl: baseUrl ?? "https://api.resend.com" };
  }
  const { kind, host, port, secure, username, password, from } = request.credential;
  return {
    kind,
    host,
    port,
    secure: secure ?? false,
    username: username ?? "",
    password: password ?? "",
    from,
  };
}

export type { EmailProvider };
