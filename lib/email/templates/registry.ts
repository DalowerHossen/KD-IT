// path: lib/email/templates/registry.ts
import type { RenderedEmail } from "@/lib/email/adapters/base";
import {
  accountLockedTemplate,
  confirmationTemplate,
  notificationTemplate,
  recoveryTemplate,
  type ConfirmationTemplateInput,
  type RecoveryTemplateInput,
} from "@/lib/email/templates/auth";

/**
 * Substep H - the template registry. Maps a stable template id to a renderer,
 * so the queue and the SMTP port reference templates by id (recorded on the
 * deliverability row) and adding a template is a single registry entry.
 */
export const TEMPLATE_IDS = {
  authConfirmation: "auth.confirmation",
  authRecovery: "auth.recovery",
  accountLocked: "auth.account.locked",
  notification: "system.notification",
} as const;
export type TemplateId = (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS];

export interface TemplateContext {
  readonly displayName?: string;
  readonly toAddress: string;
  readonly link?: string;
  readonly title?: string;
  readonly body?: string;
}

export function renderTemplate(id: TemplateId, context: TemplateContext): RenderedEmail {
  switch (id) {
    case TEMPLATE_IDS.authConfirmation:
      return confirmationTemplate({
        displayName: context.displayName ?? "there",
        toAddress: context.toAddress,
        link: context.link ?? "",
      } satisfies ConfirmationTemplateInput);
    case TEMPLATE_IDS.authRecovery:
      return recoveryTemplate({
        toAddress: context.toAddress,
        link: context.link ?? "",
      } satisfies RecoveryTemplateInput);
    case TEMPLATE_IDS.accountLocked:
      return accountLockedTemplate();
    case TEMPLATE_IDS.notification:
      return notificationTemplate({
        title: context.title ?? "Update",
        body: context.body ?? "",
        link: context.link,
      });
    default:
      throw new Error(`Unknown email template id: ${String(id)}`);
  }
}
