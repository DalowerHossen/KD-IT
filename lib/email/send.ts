// path: lib/email/send.ts
import "server-only";

import type { TenantContext } from "@/lib/db/tenant-context";
import { renderTemplate, type TemplateId } from "@/lib/email/templates/registry";
import { enqueueEmail, type EnqueueResult } from "@/lib/email/queue";
import { resolveEmailRoute, DEFAULT_FROM } from "@/lib/email/routing";

export interface SendTemplatedOptions {
  readonly link?: string;
  readonly displayName?: string;
  readonly title?: string;
  readonly body?: string;
}

/**
 * Substep H - renders a registered template and enqueues it on the delivery
 * pipeline. The sender address comes from the resolved route (falling back to
 * the platform default). This is the single entry point for app-owned emails.
 */
export async function sendTemplatedEmail(
  context: TenantContext,
  templateId: TemplateId,
  to: string,
  options: SendTemplatedOptions = {},
): Promise<EnqueueResult> {
  const rendered = renderTemplate(templateId, {
    toAddress: to,
    link: options.link,
    displayName: options.displayName,
    title: options.title,
    body: options.body,
  });
  const route = await resolveEmailRoute(context);
  return enqueueEmail(context, {
    to,
    from: route?.fromAddress ?? DEFAULT_FROM,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    templateId,
  });
}
