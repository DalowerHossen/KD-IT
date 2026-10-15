// path: lib/notifications/service.ts
import "server-only";

import type { TenantContext } from "@/lib/db/tenant-context";
import { entitlementsForCompany } from "@/lib/company/entitlements";
import { sendTemplatedEmail } from "@/lib/email/send";
import { TEMPLATE_IDS } from "@/lib/email/templates/registry";
import { rootLogger } from "@/lib/logging/logger";
import { createNotification, type CreateNotificationInput } from "@/lib/notifications/repository";

/**
 * Substep J - the notification service. Creates a per-recipient in-app
 * notification and, when the company's plan includes the "notifications"
 * entitlement (Substep I) and an email target is given, also delivers an email
 * copy through the universal-SMTP pipeline (Substep H).
 *
 * Flows call notifyBestEffort so that a notification failure never blocks the
 * primary action, which has already committed in its own transaction.
 */

const NOTIFICATIONS_FEATURE = "notifications";

export interface NotifyInput extends CreateNotificationInput {
  readonly emailTo?: string;
  readonly emailLink?: string;
}

export async function notify(context: TenantContext, input: NotifyInput): Promise<void> {
  await createNotification(context, {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    relatedId: input.relatedId,
  });
  if (input.emailTo !== undefined) {
    const entitlements = await entitlementsForCompany(context.companyId);
    if (entitlements.includes(NOTIFICATIONS_FEATURE)) {
      await sendTemplatedEmail(context, TEMPLATE_IDS.notification, input.emailTo, {
        title: input.title,
        body: input.body,
        link: input.emailLink,
      });
    }
  }
}

export async function notifyBestEffort(context: TenantContext, input: NotifyInput): Promise<void> {
  try {
    await notify(context, input);
  } catch (error) {
    rootLogger.warn(
      `notification delivery failed for type ${input.type}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

/** Notifies a user they were invited to a workspace. */
export function notifyInvitee(
  context: TenantContext,
  input: {
    readonly userId: string;
    readonly role: string;
    readonly membershipId: string;
    readonly emailTo?: string;
  },
): Promise<void> {
  return notifyBestEffort(context, {
    userId: input.userId,
    type: "membership.invited",
    title: "You have been invited to a workspace",
    body: `You were invited to join a KD SOLUTION IT workspace with the role: ${input.role}.`,
    relatedId: input.membershipId,
    emailTo: input.emailTo,
  });
}

/** Notifies a newly-provisioned workspace owner. */
export function notifyWorkspaceReady(
  context: TenantContext,
  input: { readonly userId: string; readonly companyId: string; readonly emailTo?: string },
): Promise<void> {
  return notifyBestEffort(context, {
    userId: input.userId,
    type: "workspace.ready",
    title: "Your workspace is ready",
    body: "Your KD SOLUTION IT workspace has been set up and you are the owner.",
    relatedId: input.companyId,
    emailTo: input.emailTo,
  });
}
