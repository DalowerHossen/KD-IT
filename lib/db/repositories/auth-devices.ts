// path: lib/db/repositories/auth-devices.ts
import "server-only";

import { z } from "zod";

import { type AuthDeviceRow, authDeviceRowSchema } from "@/lib/auth/schemas";
import { pgQuery } from "@/lib/db/pg";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { NotFoundError } from "@/lib/errors/app-errors";
import { genericUuidSchema, plainTextSchema } from "@/lib/validation/zod-helpers";

/**
 * Authentication-device repository. Device rows are user-global records on
 * the platform company; every read and write is scoped by user id so one
 * user can never observe or revoke another user's devices. Raw user agents
 * never persist: rows hold the HMAC device key, a display label, and
 * hashed signals only.
 */
export const AUTH_DEVICE_COLUMNS =
  "id, company_id, user_id, device_key_hash, display_label, platform, last_ip, last_seen_at, trusted_until, revoked_at, revoked_reason, created_at, updated_at, deleted_at, version";

export const upsertDeviceInputSchema = z.strictObject({
  userId: genericUuidSchema,
  deviceKeyHash: z.string().regex(/^[0-9a-f]{64}$/),
  displayLabel: plainTextSchema(120, "Device label"),
  platform: z.string().min(1).max(60).nullable(),
  ip: z.string().max(64).nullable(),
});
export type UpsertDeviceInput = z.infer<typeof upsertDeviceInputSchema>;

export interface UpsertDeviceResult {
  readonly device: AuthDeviceRow;
  /** True when this login introduced a previously unseen device. */
  readonly isNew: boolean;
}

function parseDeviceRow(row: Record<string, unknown>): AuthDeviceRow {
  return authDeviceRowSchema.parse({
    ...row,
    last_ip: row.last_ip === null ? null : String(row.last_ip),
  });
}

/**
 * Fetches the device row for a login, creating it when unseen. Returns
 * whether the device is new so callers can emit the new-device signal.
 */
export async function upsertDeviceOnLogin(input: UpsertDeviceInput): Promise<UpsertDeviceResult> {
  const validated = upsertDeviceInputSchema.parse(input);
  const result = await pgQuery(
    `insert into app.auth_devices (
       company_id, user_id, device_key_hash, display_label, platform, last_ip, last_seen_at
     )
     values ($1, $2, $3, $4, $5, $6::inet, clock_timestamp())
     on conflict (user_id, device_key_hash) where deleted_at is null
     do update set
       display_label = excluded.display_label,
       platform = excluded.platform,
       last_ip = excluded.last_ip,
       last_seen_at = clock_timestamp(),
       revoked_at = null,
       revoked_reason = null,
       version = app.auth_devices.version + 1
     returning ${AUTH_DEVICE_COLUMNS}, (xmax = 0) as inserted`,
    [
      PLATFORM_COMPANY_ID,
      validated.userId,
      validated.deviceKeyHash,
      validated.displayLabel,
      validated.platform,
      validated.ip,
    ],
  );
  const row = result.rows[0] as (Record<string, unknown> & { inserted: boolean }) | undefined;
  if (row === undefined) {
    throw new NotFoundError("Device record was not created.");
  }
  return { device: parseDeviceRow(row), isNew: row.inserted };
}

/** Live devices for a user, most recently seen first. */
export async function listUserDevices(userId: string): Promise<readonly AuthDeviceRow[]> {
  const validated = genericUuidSchema.parse(userId);
  const result = await pgQuery(
    `select ${AUTH_DEVICE_COLUMNS}
     from app.auth_devices
     where user_id = $1
       and company_id = $2
       and deleted_at is null
       and revoked_at is null
     order by last_seen_at desc`,
    [validated, PLATFORM_COMPANY_ID],
  );
  return result.rows.map((row) => parseDeviceRow(row as Record<string, unknown>));
}

/**
 * Revokes a device. The lookup is ownership-scoped, so unknown ids and
 * other users' devices share one generic outcome.
 */
export async function revokeDevice(
  userId: string,
  deviceId: string,
  reason: string,
): Promise<void> {
  const validatedUser = genericUuidSchema.parse(userId);
  const validatedDevice = genericUuidSchema.parse(deviceId);
  const result = await pgQuery(
    `update app.auth_devices
     set revoked_at = clock_timestamp(),
         revoked_reason = $4,
         version = version + 1
     where id = $1
       and user_id = $2
       and company_id = $3
       and deleted_at is null
       and revoked_at is null`,
    [validatedDevice, validatedUser, PLATFORM_COMPANY_ID, reason],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError("Device not found.");
  }
}
