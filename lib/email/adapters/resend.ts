// path: lib/email/adapters/resend.ts
import "server-only";

import type { EmailAdapter } from "@/lib/email/adapters/base";
import type { EmailCredential, EmailMessage, SendResult } from "@/lib/email/types";
import { ExternalServiceError } from "@/lib/errors/app-errors";

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Substep H - the Resend adapter (the platform default). Sends through the
 * Resend HTTP API using the encrypted credential's API key. Provider outcomes
 * map to SendResult: a 202 with an id is delivered; a 4xx is a permanent
 * bounce; a 5xx/network error is a transient failure the queue retries.
 */
export const resendAdapter: EmailAdapter = {
  name: "resend",

  async send(message: EmailMessage, credential: EmailCredential): Promise<SendResult> {
    if (credential.kind !== "resend") {
      return { delivered: false, bounced: false, detail: "credential/provider mismatch" };
    }
    try {
      const response = await fetch(`${credential.baseUrl.replace(/\/$/, "")}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 200 || response.status === 201 || response.status === 202) {
        const body = (await response.json().catch(() => null)) as { id?: string } | null;
        return { delivered: true, bounced: false, messageId: body?.id };
      }
      if (response.status >= 400 && response.status < 500) {
        return {
          delivered: false,
          bounced: true,
          bounceCategory: "permanent",
          detail: `resend rejected (${response.status})`,
        };
      }
      return {
        delivered: false,
        bounced: false,
        detail: `resend unavailable (${response.status})`,
      };
    } catch (error) {
      return {
        delivered: false,
        bounced: false,
        detail: error instanceof Error ? error.message.slice(0, 200) : "resend request failed",
      };
    }
  },

  async verifyConnection(credential: EmailCredential): Promise<void> {
    if (credential.kind !== "resend") {
      throw new ExternalServiceError("Credential does not match the Resend provider.");
    }
    try {
      const response = await fetch(`${credential.baseUrl.replace(/\/$/, "")}/domains`, {
        method: "GET",
        headers: { Authorization: `Bearer ${credential.apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new ExternalServiceError("Resend credential could not be verified.");
      }
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError("Resend is not reachable with this credential.");
    }
  },
};
