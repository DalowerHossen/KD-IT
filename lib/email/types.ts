// path: lib/email/types.ts
import { z } from "zod";

/**
 * Substep H - shared email-domain types. These are the contracts the
 * adapters, routing, queue, and deliverability layers agree on.
 */

export const emailProviderSchema = z.enum(["resend", "smtp"]);
export type EmailProvider = z.infer<typeof emailProviderSchema>;

export const deliveryStatusSchema = z.enum([
  "queued",
  "sending",
  "delivered",
  "bounced",
  "failed",
  "suppressed",
]);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const bounceCategorySchema = z.enum(["permanent", "temporary", "unknown"]);
export type BounceCategory = z.infer<typeof bounceCategorySchema>;

export const suppressionReasonSchema = z.enum([
  "permanent_bounce",
  "complaint",
  "unsubscribed",
  "manual",
]);
export type SuppressionReason = z.infer<typeof suppressionReasonSchema>;

/** A single email to dispatch. Bodies are already-rendered English text/HTML. */
export const emailMessageSchema = z.object({
  to: z.string().email().max(320),
  from: z.string().max(320),
  subject: z.string().min(1).max(512),
  text: z.string().min(1),
  html: z.string().min(1),
  /** The template identifier that rendered this message (for audit/records). */
  templateId: z.string().min(1).max(64),
});
export type EmailMessage = z.infer<typeof emailMessageSchema>;

/**
 * The outcome of one adapter dispatch. `delivered` and `bounced` are
 * mutually exclusive; a transient failure is neither (the queue retries it).
 * Provider detail is truncated by the caller before it reaches the database.
 */
export interface SendResult {
  readonly delivered: boolean;
  readonly bounced: boolean;
  readonly bounceCategory?: BounceCategory;
  readonly messageId?: string;
  readonly detail?: string;
}

/** A resolved send target: which provider, sender address, and credential. */
export interface EmailRoute {
  readonly provider: EmailProvider;
  readonly fromAddress: string;
  readonly credential: EmailCredential;
}

/**
 * Decrypted provider credential. Never logged; the plain object exists only
 * inside the adapter call. `kind` discriminates the provider-specific shape.
 */
export type EmailCredential =
  | {
      readonly kind: "resend";
      readonly apiKey: string;
      readonly from: string;
      readonly baseUrl: string;
    }
  | {
      readonly kind: "smtp";
      readonly host: string;
      readonly port: number;
      readonly secure: boolean;
      readonly username: string;
      readonly password: string;
      readonly from: string;
    };
