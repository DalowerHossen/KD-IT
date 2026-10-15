// path: lib/commands/types.ts
import { z } from "zod";

import { AUTH_ROLES, authRoleSchema, type AuthRole } from "@/lib/auth/roles";
import { idempotencyKeySchema, uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * Privileged-command registry. Every privileged mutation carried out by
 * this platform runs through exactly one of these command kinds so that
 * approval routing, audit correlation, and execution evidence always share
 * one vocabulary. Later steps add their kinds here, never in parallel
 * registries.
 */

/**
 * Single-source role aliases. The canonical typed role registry lives in
 * lib/auth/roles.ts; this module re-exports it so role strings are never
 * duplicated across registries.
 */
export const PLATFORM_ROLES = AUTH_ROLES;
export const platformRoleSchema = authRoleSchema;
export type PlatformRole = AuthRole;

/**
 * Step 03 approval action types, registered in the existing approval
 * engine. Identity, team, company, SMTP, domain, billing, KYC, backup, and
 * network-allowlist mutations each carry one of these kinds so the L1/L2/L3
 * chain, idempotency, and execution evidence apply uniformly.
 */
export const STEP_03_COMMAND_KINDS = [
  "auth.account.unlock",
  "auth.account.activate",
  "auth.role.assign",
  "auth.permission.grant",
  "auth.permission.revoke",
  "team.invitation.send",
  "team.invitation.revoke",
  "team.ownership.transfer",
  "company.profile.update",
  "company.settings.update",
  "company.security.update",
  "smtp.platform.configure",
  "smtp.tenant.configure",
  "domain.request",
  "domain.verify",
  "billing.plan.publish",
  "billing.coupon.issue",
  "billing.subscription.change",
  "kyc.application.submit",
  "kyc.review.submit",
  "kyc.decision.finalize",
  "backup.request",
  "security.allowlist.update",
] as const;
export type Step03CommandKind = (typeof STEP_03_COMMAND_KINDS)[number];

export const COMMAND_KINDS = [
  "admin.company.create",
  "admin.company.update",
  "admin.company.suspend",
  "admin.membership.invite",
  "admin.membership.update_role",
  "admin.membership.suspend",
  "config.entry.set",
  "config.entry.delete",
  "file.upload",
  "file.delete",
  "file.quarantine.release",
  "file.quarantine.delete",
  "storage.connection.register",
  "storage.connection.enable",
  "storage.connection.disable",
  "storage.migrate",
  "audit.export",
  ...STEP_03_COMMAND_KINDS,
] as const;
export const commandKindSchema = z.enum(COMMAND_KINDS);
export type CommandKind = z.infer<typeof commandKindSchema>;

export const COMMAND_SCOPES = {
  read: "read",
  mutation: "mutation",
} as const;
export type CommandScope = (typeof COMMAND_SCOPES)[keyof typeof COMMAND_SCOPES];

const MUTATION_EPILOGUE =
  "Mutation commands never execute without the full approval chain ending in execution evidence.";

/**
 * Required roles per privileged command. Composed by membership policy:
 * owner covers their own tenant, super_admin and ceo cover the platform,
 * admin_staff covers delegated operational mutations, staff covers nothing
 * privileged directly. This table denies by default: a kind without an
 * entry can never execute.
 */
export const REQUIRED_COMMAND_ROLES: Readonly<Record<CommandKind, readonly PlatformRole[]>> = {
  "admin.company.create": ["super_admin", "ceo"],
  "admin.company.update": ["super_admin", "ceo"],
  "admin.company.suspend": ["super_admin", "ceo"],
  "admin.membership.invite": ["super_admin", "ceo", "admin_staff", "owner"],
  "admin.membership.update_role": ["super_admin", "ceo", "owner"],
  "admin.membership.suspend": ["super_admin", "ceo", "owner"],
  "config.entry.set": ["super_admin", "ceo", "admin_staff", "owner"],
  "config.entry.delete": ["super_admin", "ceo"],
  "file.upload": ["super_admin", "ceo", "admin_staff", "owner", "staff"],
  "file.delete": ["super_admin", "ceo", "admin_staff", "owner"],
  "file.quarantine.release": ["super_admin", "ceo"],
  "file.quarantine.delete": ["super_admin", "ceo"],
  "storage.connection.register": ["super_admin", "ceo", "owner"],
  "storage.connection.enable": ["super_admin", "ceo", "owner"],
  "storage.connection.disable": ["super_admin", "ceo", "owner"],
  "storage.migrate": ["super_admin", "ceo", "owner"],
  "audit.export": ["super_admin", "ceo"],
  "auth.account.unlock": ["super_admin", "ceo"],
  "auth.account.activate": ["super_admin", "ceo"],
  "auth.role.assign": ["super_admin", "ceo", "owner"],
  "auth.permission.grant": ["super_admin", "ceo", "owner"],
  "auth.permission.revoke": ["super_admin", "ceo", "owner"],
  "team.invitation.send": ["super_admin", "ceo", "owner"],
  "team.invitation.revoke": ["super_admin", "ceo", "owner"],
  "team.ownership.transfer": ["super_admin", "ceo", "owner"],
  "company.profile.update": ["super_admin", "ceo", "owner"],
  "company.settings.update": ["super_admin", "ceo", "owner"],
  "company.security.update": ["super_admin", "ceo", "owner"],
  "smtp.platform.configure": ["super_admin", "ceo"],
  "smtp.tenant.configure": ["super_admin", "ceo", "owner"],
  "domain.request": ["super_admin", "ceo", "owner"],
  "domain.verify": ["super_admin", "ceo"],
  "billing.plan.publish": ["super_admin", "ceo"],
  "billing.coupon.issue": ["super_admin", "ceo"],
  "billing.subscription.change": ["super_admin", "ceo", "owner"],
  "kyc.application.submit": ["owner"],
  "kyc.review.submit": ["super_admin", "ceo", "admin_staff"],
  "kyc.decision.finalize": ["super_admin", "ceo"],
  "backup.request": ["super_admin", "ceo", "owner"],
  "security.allowlist.update": ["super_admin", "ceo"],
};

export function requiredRolesFor(kind: CommandKind): readonly PlatformRole[] {
  const roles = REQUIRED_COMMAND_ROLES[kind];
  if (roles === undefined) {
    return [];
  }
  return roles;
}

export function isMutationCommand(kind: CommandKind): boolean {
  return kind !== "audit.export";
}

export const COMMAND_EPILOGUE = MUTATION_EPILOGUE;

export const commandStatusSchema = z.enum([
  "proposed",
  "awaiting_l2",
  "awaiting_l3",
  "awaiting_confirmation",
  "approved",
  "executed",
  "rejected",
  "expired",
  "cancelled",
]);
export type CommandStatus = z.infer<typeof commandStatusSchema>;

export const commandEventTypeSchema = z.enum([
  "proposed",
  "initiated",
  "attested",
  "approved",
  "l2_approved",
  "l3_approved",
  "step_up_confirmed",
  "final_confirmed",
  "executed",
  "rejected",
  "expired",
  "cancelled",
  "delegated",
  "escalated",
]);
export type CommandEventType = z.infer<typeof commandEventTypeSchema>;

export const proposeCommandInputSchema = z.object({
  companyId: uuidV7Schema,
  kind: commandKindSchema,
  payload: z.record(z.string(), z.unknown()),
  commandTtlMinutes: z.number().int().min(5).max(10080).optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
  dualControl: z.boolean().optional(),
  attestation: z.string().min(3).max(280).optional(),
});
export type ProposeCommandInput = z.infer<typeof proposeCommandInputSchema>;

export const commandRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  kind: commandKindSchema,
  payload: z.record(z.string(), z.unknown()),
  payload_hash: z.string().regex(/^[0-9a-f]{64}$/),
  status: commandStatusSchema,
  initiator_id: uuidV7Schema,
  attestation: z.string().nullable(),
  step_up_confirmed: z.boolean(),
  dual_control_required: z.boolean(),
  dual_confirmed_by: uuidV7Schema.nullable(),
  l2_approved_by: uuidV7Schema.nullable(),
  l2_approved_at: z.string().datetime().nullable(),
  l3_approved_by: uuidV7Schema.nullable(),
  l3_approved_at: z.string().datetime().nullable(),
  delegated_to: uuidV7Schema.nullable(),
  expires_at: z.string().datetime(),
  executed_at: z.string().datetime().nullable(),
  executed_by: uuidV7Schema.nullable(),
  execution_result: z.record(z.string(), z.unknown()).nullable(),
  rejection_reason: z.string().nullable(),
  rejected_reason_code: z.string().nullable(),
  idempotency_key: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
  version: z.number().int().min(1),
});
export type CommandRow = z.infer<typeof commandRowSchema>;

export const standingGrantScopeSchema = z.string().regex(/^[a-z][a-z0-9_.:*-]{1,120}$/);

export const standingGrantRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  subject_id: uuidV7Schema,
  scope: standingGrantScopeSchema,
  granted_by: uuidV7Schema,
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime(),
  reason: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
  version: z.number().int().min(1),
});
export type StandingGrantRow = z.infer<typeof standingGrantRowSchema>;
