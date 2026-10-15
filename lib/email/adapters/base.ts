// path: lib/email/adapters/base.ts
import type { EmailCredential, EmailMessage, SendResult } from "@/lib/email/types";

/**
 * Substep H - the universal email adapter contract. Every provider (Resend,
 * generic SMTP, and any future gateway) implements this shape, so the queue,
 * routing, and deliverability layers are provider-agnostic.
 *
 * Implementations MUST fail closed: a provider error is a returned transient
 * failure (never a thrown exception that crashes the worker) or, for
 * verifyConnection, a thrown ExternalServiceError. Provider detail must be
 * short and free of credentials.
 */
export interface EmailAdapter {
  /** Stable provider identifier, matching the credential kind. */
  readonly name: "resend" | "smtp";

  /** Dispatches a rendered message. Returns a SendResult; never throws for
   *  provider-side outcomes (network/timeout -> transient, reject -> bounce). */
  send(message: EmailMessage, credential: EmailCredential): Promise<SendResult>;

  /**
   * Performs a live handshake with the provider using the supplied credential
   * and throws ExternalServiceError when the credential or connection is not
   * usable. This is what connection verification records as `verified`.
   */
  verifyConnection(credential: EmailCredential): Promise<void>;
}

/** A single line of a rendered template. */
export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}
