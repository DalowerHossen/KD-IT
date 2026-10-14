// path: lib/commands/types.ts
import { z } from "zod";

import { idempotencyKeySchema, uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * Step 02 privileged-command registry. Every privileged mutation carried
 * out by this platform runs through exactly one of these command kinds so
 * that approval routing, audit correlation, and execution evidence always
 * share one vocabulary. Later steps add their kinds here, never in parallel
 * registries.
 */

export const PLATFORM_ROLES = ["super_admin", "ceo", "admin_staff", "owner", "staff"] as const;
export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

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

export const standingGrantRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  subject_id: uuidV7Schema,
  scope: z.string().regex(/^[a-z][a-z0-9_.:-]{1,120}$/),
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
