// path: lib/email/routing.ts
import "server-only";

import { z } from "zod";

import { getConfigurationValue } from "@/lib/db/repositories/config";
import type { TenantContext } from "@/lib/db/tenant-context";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { getEmailCredential } from "@/lib/email/credentials";
import type { EmailCredential, EmailProvider, EmailRoute } from "@/lib/email/types";

const EMAIL_ROUTING_CONFIG_KEY = "email.routing";
const DEFAULT_PROVIDER: EmailProvider = "resend";
const DEFAULT_FROM = "KD SOLUTION IT <no-reply@kd-solution.it>";

const routingSchema = z.object({ provider: z.enum(["resend", "smtp"]) }).strict();

/**
 * Substep H - tenant and platform email routing. The provider comes from the
 * `email.routing` config (the config reader already applies tenant-over-platform
 * precedence), defaulting to the universal adapter's default provider. The
 * credential resolves tenant DB, then platform DB, then environment, so an
 * operator can run on environment credentials or on stored encrypted
 * credentials. Returns null when no usable credential exists (the caller
 * reports a configuration error rather than sending to an unknown endpoint).
 */
export async function resolveEmailRoute(context: TenantContext): Promise<EmailRoute | null> {
  const stored = await getConfigurationValue(context, EMAIL_ROUTING_CONFIG_KEY);
  const provider: EmailProvider =
    stored === null ? DEFAULT_PROVIDER : routingSchema.parse(stored).provider;

  let credential: EmailCredential | null = await getEmailCredential(context.companyId, provider);
  if (credential === null && context.companyId !== PLATFORM_COMPANY_ID) {
    credential = await getEmailCredential(PLATFORM_COMPANY_ID, provider);
  }
  if (credential === null) {
    credential = envEmailCredential(provider);
  }
  if (credential === null) {
    return null;
  }
  return { provider, fromAddress: credential.from, credential };
}

/** Builds a credential from environment variables when no DB row exists. */
function envEmailCredential(provider: EmailProvider): EmailCredential | null {
  const envFrom = process.env.KD_EMAIL_FROM;
  const from = envFrom !== undefined && envFrom.trim() !== "" ? envFrom : DEFAULT_FROM;
  if (provider === "resend") {
    const apiKey = process.env.KD_RESEND_API_KEY;
    if (apiKey === undefined || apiKey.trim() === "") {
      return null;
    }
    return {
      kind: "resend",
      apiKey,
      from,
      baseUrl: process.env.KD_RESEND_BASE_URL ?? "https://api.resend.com",
    };
  }
  const host = process.env.KD_SMTP_HOST;
  const port = process.env.KD_SMTP_PORT;
  if (host === undefined || host.trim() === "" || port === undefined) {
    return null;
  }
  return {
    kind: "smtp",
    host,
    port: Number(port),
    secure: process.env.KD_SMTP_SECURE === "true",
    username: process.env.KD_SMTP_USERNAME ?? "",
    password: process.env.KD_SMTP_PASSWORD ?? "",
    from,
  };
}

/** The AuthEmailPort implementation selected by environment (substep H flip). */
export function selectedAuthEmailPortName(): "supabase" | "smtp" {
  return process.env.KD_EMAIL_PROVIDER === "smtp" ? "smtp" : "supabase";
}

export const EMAIL_ROUTING_KEY = EMAIL_ROUTING_CONFIG_KEY;
export { DEFAULT_FROM };
