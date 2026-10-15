// path: lib/email/adapters/registry.ts
import "server-only";

import type { EmailAdapter } from "@/lib/email/adapters/base";
import { resendAdapter } from "@/lib/email/adapters/resend";
import { smtpAdapter } from "@/lib/email/adapters/smtp";
import type { EmailProvider } from "@/lib/email/types";
import { ConfigurationError } from "@/lib/errors/app-errors";

/**
 * Substep H - the provider adapter registry. Maps a provider name to its
 * adapter. Adding a future gateway (SendGrid, SES, Mailgun, Postmark) is a
 * new adapter plus one entry here; the queue and routing are unchanged.
 */
const ADAPTERS: Record<EmailProvider, EmailAdapter> = {
  resend: resendAdapter,
  smtp: smtpAdapter,
};

export function getEmailAdapter(provider: EmailProvider): EmailAdapter {
  const adapter = ADAPTERS[provider];
  if (adapter === undefined) {
    throw new ConfigurationError(`No email adapter is registered for provider "${provider}".`);
  }
  return adapter;
}

export const EMAIL_PROVIDERS: readonly EmailProvider[] = Object.keys(ADAPTERS) as EmailProvider[];
