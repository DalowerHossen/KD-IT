// path: lib/hooks/use-permissions.ts
"use client";

import { useCallback, useMemo } from "react";

import { ROLE_ORDER, type AppRole, type PermissionCode } from "@/lib/navigation/route-metadata";
import { useSession } from "@/lib/providers/session-provider";

export interface PermissionQueries {
  readonly isAuthenticated: boolean;
  readonly role: AppRole | null;
  readonly permissions: readonly PermissionCode[];
  readonly hasPermission: (code: PermissionCode) => boolean;
  readonly hasAnyPermission: (codes: readonly PermissionCode[]) => boolean;
  /** True when the session role holds at least the given authority level. */
  readonly hasRoleAtLeast: (role: AppRole) => boolean;
}

/**
 * Permission query hook consumed by navigation filtering and page guards.
 * Backed by the typed session context so the Step 03 auth implementation
 * wires real sessions into one place.
 */
export function usePermissions(): PermissionQueries {
  const session = useSession();
  const role = session.status === "signed-in" ? session.user.role : null;
  const permissions = useMemo<readonly PermissionCode[]>(
    () => (session.status === "signed-in" ? session.user.permissions : []),
    [session],
  );

  const hasPermission = useCallback(
    (code: PermissionCode): boolean => permissions.includes(code),
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (codes: readonly PermissionCode[]): boolean => codes.some((code) => permissions.includes(code)),
    [permissions],
  );

  const hasRoleAtLeast = useCallback(
    (required: AppRole): boolean => {
      if (role === null) {
        return false;
      }
      return ROLE_ORDER.indexOf(role) <= ROLE_ORDER.indexOf(required);
    },
    [role],
  );

  return {
    isAuthenticated: session.status === "signed-in",
    role,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasRoleAtLeast,
  };
}
