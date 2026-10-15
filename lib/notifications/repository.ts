// path: lib/notifications/repository.ts
import "server-only";

import { z } from "zod";

import { withPgTransaction, toDatabaseError } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantContextSettings } from "@/lib/db/tenant-context";

/**
 * Substep J - the notification inbox repository. A notification is a
 * per-recipient row; the working company is recorded for scope, but a
 * recipient reads their own feed. Read state is a read_at timestamp.
 */

export const notificationTypeSchema = z.enum([
  "membership.invited",
  "membership.role_changed",
  "workspace.ready",
  "security.alert",
  "kyc.submission_requested",
  "kyc.approved",
  "kyc.rejected",
  "kyc.expiring",
  "kyc.expired",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

const NOTIFICATION_COLUMNS =
  "id, company_id, user_id, type, title, body, related_id, read_at, created_at";

const notificationRowSchema = z.object({
  id: z.string().min(1).max(64),
  company_id: z.string(),
  user_id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  related_id: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type NotificationRow = z.infer<typeof notificationRowSchema>;

export interface CreateNotificationInput {
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly relatedId?: string | null;
}

export async function createNotification(
  context: TenantContext,
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `insert into app.notifications (company_id, user_id, type, title, body, related_id)
           values ($1, $2, $3, $4, $5, $6)
           returning ${NOTIFICATION_COLUMNS}`,
        [
          context.companyId,
          input.userId,
          input.type,
          input.title,
          input.body,
          input.relatedId ?? null,
        ],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw toDatabaseError(new Error("notification insert returned no row"));
  }
  return notificationRowSchema.parse(row);
}

/** The recipient's inbox, newest first, capped. */
export async function listNotifications(
  context: TenantContext,
  limit = 50,
): Promise<NotificationRow[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${NOTIFICATION_COLUMNS} from app.notifications
          where user_id = $1 and deleted_at is null
          order by created_at desc
          limit $2`,
        [context.userId, capped],
      ),
    tenantContextSettings(context),
  );
  return z.array(notificationRowSchema).parse(result.rows);
}

/** The count of the recipient's unread notifications. */
export async function unreadCount(context: TenantContext): Promise<number> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select count(*)::int as n from app.notifications
          where user_id = $1 and read_at is null and deleted_at is null`,
        [context.userId],
      ),
    tenantContextSettings(context),
  );
  return (result.rows[0] as { n: number }).n;
}

/** Marks one of the recipient's notifications read (idempotent). */
export async function markNotificationRead(
  context: TenantContext,
  notificationId: string,
): Promise<void> {
  await withPgTransaction(
    async (client) =>
      client.query(
        `update app.notifications
           set read_at = clock_timestamp()
         where id = $1 and user_id = $2 and read_at is null and deleted_at is null`,
        [notificationId, context.userId],
      ),
    tenantContextSettings(context),
  );
}
