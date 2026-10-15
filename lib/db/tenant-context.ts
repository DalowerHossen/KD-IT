// path: lib/db/tenant-context.ts
import "server-only";

import { z } from "zod";

import { ForbiddenError } from "@/lib/errors/app-errors";
import {
  type CommandKind,
  type PlatformRole,
  platformRoleSchema,
  requiredRolesFor,
} from "@/lib/commands/types";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * Step 02 request-scoped tenant context. Repositories never resolve a
 * tenant from request bodies or hidden parameters: callers construct this
 * context once per request at the route boundary (from the authoritative
 * session), and it travels explicitly into every data access so ownership
 * is enforced identically on every path.
 */
export const PLATFORM_COMPANY_ID = "00000000-0000-7000-8000-000000000001";

export const tenantContextSchema = z.object({
  companyId: uuidV7Schema,
  userId: uuidV7Schema,
  role: platformRoleSchema,
  correlationId: uuidV7Schema,
  isPlatform: z.boolean(),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;

export interface TenantContextInput {
  readonly companyId: string;
  readonly userId: string;
  readonly role: PlatformRole;
  readonly correlationId: string;
}

/** Builds a validated, immutable tenant context at the route boundary. */
export function makeTenantContext(input: TenantContextInput): TenantContext {
  const validated = tenantContextSchema.parse({
    companyId: input.companyId,
    userId: input.userId,
    role: input.role,
    correlationId: input.correlationId,
    isPlatform: input.companyId === PLATFORM_COMPANY_ID,
  });
  return Object.freeze({ ...validated });
}

/** set_config keys that translate this context into SQL session state. */
export function tenantContextSettings(context: TenantContext): Record<string, string> {
  return {
    "app.company_id": context.companyId,
    "app.user_id": context.userId,
    "app.user_role": context.role,
    "app.correlation_id": context.correlationId,
  };
}

/**
 * Enforces the REQUIRED_COMMAND_ROLES matrix exactly: the active role must
 * be explicitly permitted for the command kind. Platform operators can act
 * on their own platform scopes only; tenant-scoped commands always stay
 * inside their own company boundary. Denials produce generic errors that
 * enumerate neither roles nor commands.
 */
export function requireCommandPermission(context: TenantContext, kind: CommandKind): void {
  const permitted = requiredRolesFor(kind);
  if (!permitted.includes(context.role)) {
    throw new UnauthorizedOrForbiddenForCommandError();
  }
}

class UnauthorizedOrForbiddenForCommandError extends ForbiddenError {
  constructor() {
    super("You do not have permission to perform this action.");
  }
}

/** Throws when the context cannot prove an authenticated platform actor. */
export function requirePlatformRole(context: TenantContext, roles: readonly PlatformRole[]): void {
  if (!context.isPlatform || !roles.includes(context.role)) {
    throw new ForbiddenError("This action is restricted to platform operators.");
  }
}

/** Guards a target company boundary against cross-tenant entry. */
export function requireSameCompanyBoundary(context: TenantContext, targetCompanyId: string): void {
  if (uuidV7Schema.parse(targetCompanyId) !== context.companyId) {
    throw new ForbiddenError("This record does not belong to your workspace.");
  }
}

/** Ownership guard for single-record reads against empty-result leakage. */
export function requireOwnedRow<T extends { company_id: string }>(
  context: TenantContext,
  row: T | null | undefined,
): T {
  if (row === null || row === undefined || row.company_id !== context.companyId) {
    throw new ForbiddenError("This record does not belong to your workspace.");
  }
  return row;
}
