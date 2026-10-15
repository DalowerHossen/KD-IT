// path: lib/auth/supabase-email.ts
import "server-only";

import { type AuthEmailPort } from "@/lib/auth/email-port";
import { createAuthenticatedServerClient } from "@/lib/db/clients/supabase";
import { toDatabaseError } from "@/lib/db/pg";
import { publishOutboxEvent } from "@/lib/db/repositories/outbox";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { ExternalServiceError } from "@/lib/errors/app-errors";

/**
 * Supabase-native authentication email sender. Uses the anonymous project
 * client exactly as a browser would, but from inside the server boundary
 * so delivery stays observable and rate-limited. Provider failures map to
 * generic errors; addresses are never echoed in error text.
 */
function providerClient(): ReturnType<typeof createAuthenticatedServerClient> {
  return createAuthenticatedServerClient();
}

export const supabaseAuthEmailPort: AuthEmailPort = {
  name: "supabase",

  async createUserAndSendConfirmation(input) {
    const client = providerClient();
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: input.emailRedirectTo,
        data: { display_name: input.displayName },
      },
    });
    if (error !== null) {
      throw new ExternalServiceError("Account creation is temporarily unavailable.", {
        cause: toDatabaseError(error),
      });
    }
    const userId = data.user?.id;
    if (userId === undefined) {
      throw new ExternalServiceError("Account creation is temporarily unavailable.");
    }
    const identities = data.user?.identities ?? [];
    return { userId, confirmationSent: identities.length > 0 };
  },

  async resendConfirmation(email) {
    const client = providerClient();
    const { error } = await client.auth.resend({ type: "signup", email });
    if (error !== null) {
      throw new ExternalServiceError("Verification email delivery failed.", {
        cause: toDatabaseError(error),
      });
    }
  },

  async sendPasswordRecovery(email, redirectTo) {
    const client = providerClient();
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error !== null) {
      throw new ExternalServiceError("Recovery email delivery failed.", {
        cause: toDatabaseError(error),
      });
    }
  },

  async sendAccountLockedAlert(email) {
    // The Supabase-native port has no custom security template, so it durably
    // enqueues the alert on the outbox for the email worker. The universal-SMTP
    // port (later substep) binds the same method and sends it directly.
    await publishOutboxEvent(PLATFORM_COMPANY_ID, "auth.account.locked", { email });
  },
};
