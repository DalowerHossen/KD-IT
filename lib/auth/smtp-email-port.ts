// path: lib/auth/smtp-email-port.ts
import "server-only";

import { randomUUID } from "node:crypto";

import { UNKNOWN_AUTH_SUBJECT_ID } from "@/lib/auth/audit";
import type {
  AuthEmailPort,
  SignupConfirmationInput,
  SignupConfirmationResult,
} from "@/lib/auth/email-port";
import { supabaseAuthEmailPort } from "@/lib/auth/supabase-email";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";
import { sendTemplatedEmail } from "@/lib/email/send";
import { TEMPLATE_IDS } from "@/lib/email/templates/registry";

/**
 * Substep H - the universal-SMTP authentication email port. Binds the same
 * AuthEmailPort interface to the universal SMTP pipeline (queue, routing,
 * adapters, deliverability).
 *
 * Ownership boundary: the account-locked security alert is an app-owned
 * notification and is rendered and sent through the SMTP pipeline. The
 * Supabase-token-bound transactional emails (signup confirmation, verification
 * resend, password recovery) remain owned by Supabase Auth, which generates the
 * single-use token the recovery/confirmation links require; this port delegates
 * those to the Supabase-native sender so the token flow stays correct. This is
 * the "flip the binding without touching the flows" the email port was built
 * for.
 */
function platformContext(): ReturnType<typeof makeTenantContext> {
  return makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId: UNKNOWN_AUTH_SUBJECT_ID,
    role: "staff",
    correlationId: randomUUID(),
  });
}

export const smtpAuthEmailPort: AuthEmailPort = {
  name: "smtp",

  async createUserAndSendConfirmation(
    input: SignupConfirmationInput,
  ): Promise<SignupConfirmationResult> {
    return supabaseAuthEmailPort.createUserAndSendConfirmation(input);
  },

  async resendConfirmation(email: string): Promise<void> {
    return supabaseAuthEmailPort.resendConfirmation(email);
  },

  async sendPasswordRecovery(email: string, redirectTo: string): Promise<void> {
    return supabaseAuthEmailPort.sendPasswordRecovery(email, redirectTo);
  },

  async sendAccountLockedAlert(email: string): Promise<void> {
    await sendTemplatedEmail(platformContext(), TEMPLATE_IDS.accountLocked, email);
  },
};
