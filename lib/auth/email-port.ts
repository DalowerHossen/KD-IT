// path: lib/auth/email-port.ts
import "server-only";

import { supabaseAuthEmailPort } from "@/lib/auth/supabase-email";
import { smtpAuthEmailPort } from "@/lib/auth/smtp-email-port";
import { selectedAuthEmailPortName } from "@/lib/email/routing";

/**
 * Authentication email port. Substep B ships the Supabase-native sender:
 * Supabase Auth delivers confirmation and recovery mail through the
 * project's configured mailer (wired to the platform provider in the
 * Substep F operations record). Substep F provides the universal-SMTP
 * implementation behind this same interface and flips the binding without
 * touching the flows.
 */
export interface SignupConfirmationInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly emailRedirectTo: string;
}

export interface SignupConfirmationResult {
  readonly userId: string;
  /** False when the address was already registered (generic success). */
  readonly confirmationSent: boolean;
}

export interface AuthEmailPort {
  readonly name: "supabase" | "smtp";
  createUserAndSendConfirmation(input: SignupConfirmationInput): Promise<SignupConfirmationResult>;
  resendConfirmation(email: string): Promise<void>;
  sendPasswordRecovery(email: string, redirectTo: string): Promise<void>;
  /**
   * Alerts the account holder that a lock has started (Substep E). The body
   * must never expose secrets or unsafe recovery links. The Supabase-native
   * implementation durably enqueues the alert; the universal-SMTP port sends
   * it directly.
   */
  sendAccountLockedAlert(email: string): Promise<void>;
}

let activePort: AuthEmailPort | null = null;

/** Overrides the sender; used by the universal-SMTP implementation. */
export function setAuthEmailPort(port: AuthEmailPort): void {
  activePort = port;
}

/**
 * Active sender. An explicit override wins; otherwise the environment-selected
 * implementation is used (Substep H flips to the universal-SMTP port when
 * KD_EMAIL_PROVIDER=smtp), defaulting to the Supabase-native implementation.
 */
export function getAuthEmailPort(): AuthEmailPort {
  if (activePort !== null) return activePort;
  return selectedAuthEmailPortName() === "smtp" ? smtpAuthEmailPort : supabaseAuthEmailPort;
}
