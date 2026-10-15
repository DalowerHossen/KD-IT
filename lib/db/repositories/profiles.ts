// path: lib/db/repositories/profiles.ts
import "server-only";

import { z } from "zod";

import {
  type ProfileRow,
  type ProfileStatus,
  profileRowSchema,
  profileStatusSchema,
  type UpdateProfileInput,
  updateProfileInputSchema,
} from "@/lib/auth/schemas";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { assertApprovedCommandFor } from "@/lib/db/repositories/commands";
import { toDatabaseError, withPgTransaction } from "@/lib/db/pg";
import {
  PLATFORM_COMPANY_ID,
  type TenantContext,
  requirePlatformRole,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors/app-errors";
import { genericUuidSchema, plainTextSchema } from "@/lib/validation/zod-helpers";

/**
 * Identity-profile repository. Profiles are user-global rows on the
 * platform company. Reads are ownership-checked: a subject reads their own
 * profile, platform operators read any profile, and a tenant owner reads
 * profiles of users holding an active membership in the owner company.
 * Cross-tenant probes receive a generic non-enumerating denial.
 */
export const PROFILE_COLUMNS =
  "id, company_id, user_id, display_name, status, status_reason, deactivated_at, created_at, updated_at, deleted_at, version";

async function readProfileByUserId(userId: string): Promise<ProfileRow | null> {
  const result = await withPgTransaction(async (client) =>
    client.query(
      `select ${PROFILE_COLUMNS}
       from app.profiles
       where user_id = $1
         and company_id = $2
         and deleted_at is null`,
      [userId, PLATFORM_COMPANY_ID],
    ),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return profileRowSchema.parse(row);
}

async function subjectHasCompanyMembership(
  context: TenantContext,
  subjectUserId: string,
): Promise<boolean> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select 1
         from app.memberships
         where company_id = $1
           and user_id = $2
           and status = 'active'
           and deleted_at is null
         limit 1`,
        [context.companyId, subjectUserId],
      ),
    tenantContextSettings(context),
  );
  return result.rows.length > 0;
}

/** Own profile, or null before the identity record is created. */
export async function getOwnProfile(context: TenantContext): Promise<ProfileRow | null> {
  return readProfileByUserId(context.userId);
}

/**
 * Ownership-checked profile read. Denials are generic so profile
 * existence can never be enumerated across boundaries.
 */
export async function getProfileByUserId(
  context: TenantContext,
  subjectUserId: string,
): Promise<ProfileRow> {
  const validatedSubject = genericUuidSchema.parse(subjectUserId);
  if (validatedSubject !== context.userId) {
    if (context.isPlatform && (context.role === "super_admin" || context.role === "ceo")) {
      // Platform operators fall through to the ownership-checked read.
    } else if (
      context.role === "owner" &&
      (await subjectHasCompanyMembership(context, validatedSubject))
    ) {
      // Tenant owners fall through for members of their own company.
    } else {
      throw new ForbiddenError("This record does not belong to your workspace.");
    }
  }
  const profile = await readProfileByUserId(validatedSubject);
  if (profile === null) {
    throw new NotFoundError("Profile not found.");
  }
  return profile;
}

export const createProfileInputSchema = z.strictObject({
  userId: genericUuidSchema,
  displayName: plainTextSchema(120, "Display name"),
});
export type CreateProfileInput = z.infer<typeof createProfileInputSchema>;

/**
 * Creates the identity record during signup activation or platform-staff
 * provisioning. Only the subject or a platform operator may create it.
 */
export async function createProfile(
  context: TenantContext,
  input: CreateProfileInput,
): Promise<ProfileRow> {
  const validated = createProfileInputSchema.parse(input);
  if (validated.userId !== context.userId) {
    requirePlatformRole(context, ["super_admin", "ceo"]);
  }
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `insert into app.profiles (company_id, user_id, display_name, status)
         values ($1, $2, $3, 'pending_verification')
         returning ${PROFILE_COLUMNS}`,
        [PLATFORM_COMPANY_ID, validated.userId, validated.displayName],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw toDatabaseError(new Error("profile insert returned no row"));
  }
  const parsed = profileRowSchema.parse(row);
  await appendAuditEvent(context, {
    actorType: "user",
    action: "profile.created",
    resourceType: "profiles",
    resourceId: parsed.id,
    metadata: { subjectUserId: parsed.user_id },
  });
  return parsed;
}

export interface UpdateProfileForUserInput extends UpdateProfileInput {
  readonly subjectUserId: string;
}

/**
 * Updates a display name with optimistic locking. Subjects update their
 * own profile; platform operators update any profile. Status transitions
 * are owned by the account-lifecycle flows, not by this method.
 */
export async function updateProfile(
  context: TenantContext,
  input: UpdateProfileForUserInput,
): Promise<ProfileRow> {
  const validatedSubject = genericUuidSchema.parse(input.subjectUserId);
  const validated = updateProfileInputSchema.parse({
    displayName: input.displayName,
    expectedVersion: input.expectedVersion,
  });
  if (validated.displayName === undefined) {
    throw new ConflictError("There is nothing to update.");
  }
  if (validatedSubject !== context.userId) {
    requirePlatformRole(context, ["super_admin", "ceo"]);
  }
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.profiles
         set display_name = $1,
             version = version + 1
         where user_id = $2
           and company_id = $3
           and deleted_at is null
           and version = $4
         returning ${PROFILE_COLUMNS}`,
        [validated.displayName, validatedSubject, PLATFORM_COMPANY_ID, validated.expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new ConflictError("This profile changed. Reload and retry.");
  }
  const parsed = profileRowSchema.parse(row);
  await appendAuditEvent(context, {
    actorType: "user",
    action: "profile.updated",
    resourceType: "profiles",
    resourceId: parsed.id,
    metadata: { subjectUserId: parsed.user_id },
  });
  return parsed;
}

// ---------------------------------------------------------------------------
// Substep B: account-lifecycle status transitions. The machine is:
// pending_verification -> pending_approval (own email link, or platform),
// pending_approval -> active (platform operators through an approved
// auth.account.activate command), active <-> suspended (platform),
// any live status -> deactivated (platform). Terminal deactivation has no
// outgoing edge. Illegal transitions fail with a generic conflict that
// reveals no lifecycle state.
// ---------------------------------------------------------------------------

export const PROFILE_STATUS_TRANSITIONS: Readonly<Record<ProfileStatus, readonly ProfileStatus[]>> =
  {
    pending_verification: ["pending_approval", "deactivated"],
    pending_approval: ["active", "deactivated"],
    active: ["suspended", "deactivated"],
    suspended: ["active", "deactivated"],
    deactivated: [],
  };

export interface TransitionProfileStatusInput {
  readonly subjectUserId: string;
  readonly toStatus: ProfileStatus;
  readonly expectedVersion: number;
  readonly reason?: string;
  /** Required when the transition activates a pending account. */
  readonly commandId?: string;
}

/**
 * Moves a profile along the lifecycle machine with optimistic locking.
 * Activation additionally requires an approved auth.account.activate
 * command, enforced here so no caller can bypass the approval chain.
 */
export async function transitionProfileStatus(
  context: TenantContext,
  input: TransitionProfileStatusInput,
): Promise<ProfileRow> {
  const validatedSubject = genericUuidSchema.parse(input.subjectUserId);
  const toStatus = profileStatusSchema.parse(input.toStatus);
  const reason =
    input.reason === undefined ? null : plainTextSchema(280, "Reason").parse(input.reason);

  const current = await readProfileByUserId(validatedSubject);
  if (current === null) {
    throw new NotFoundError("Profile not found.");
  }
  if (!PROFILE_STATUS_TRANSITIONS[current.status].includes(toStatus)) {
    throw new ConflictError("This status change is not allowed.");
  }

  const selfVerification =
    validatedSubject === context.userId &&
    current.status === "pending_verification" &&
    toStatus === "pending_approval";
  if (!selfVerification) {
    requirePlatformRole(context, ["super_admin", "ceo"]);
  }
  if (current.status === "pending_approval" && toStatus === "active") {
    if (input.commandId === undefined) {
      throw new ConflictError("Account activation requires an approved command.");
    }
    await assertApprovedCommandFor(context, input.commandId, "auth.account.activate");
  }

  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.profiles
         set status = $1,
             status_reason = coalesce($2, status_reason),
             deactivated_at = case when $1 = 'deactivated' then clock_timestamp() else null end,
             version = version + 1
         where user_id = $3
           and company_id = $4
           and deleted_at is null
           and version = $5
         returning ${PROFILE_COLUMNS}`,
        [toStatus, reason, validatedSubject, PLATFORM_COMPANY_ID, input.expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new ConflictError("This profile changed. Reload and retry.");
  }
  const parsed = profileRowSchema.parse(row);
  await appendAuditEvent(context, {
    actorType: "user",
    action: "profile.status_changed",
    resourceType: "profiles",
    resourceId: parsed.id,
    metadata: {
      subjectUserId: parsed.user_id,
      fromStatus: current.status,
      toStatus: parsed.status,
    },
  });
  return parsed;
}
