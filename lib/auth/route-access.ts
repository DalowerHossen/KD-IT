// path: lib/auth/route-access.ts
import { type PermissionCode } from "@/lib/auth/permissions";
import { type AuthRole } from "@/lib/auth/roles";
import { type RouteMeta } from "@/lib/navigation/route-metadata";

/**
 * Route-level authorization contracts. Pure evaluation shared by server
 * guards and navigation filtering: a route is accessible when the session
 * role is listed explicitly and every required permission code is held.
 * Role matching is explicit rather than rank-based so a route can never
 * widen silently when the hierarchy changes.
 */
export type RouteAccessDenial = "anonymous" | "role_mismatch" | "permission_missing";

export interface RouteAccessDecision {
  readonly allowed: boolean;
  readonly denial: RouteAccessDenial | null;
}

export interface RouteAccessInput {
  readonly role: AuthRole | null;
  readonly permissions: readonly PermissionCode[];
  readonly route: RouteMeta;
}

export function evaluateRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  const access = input.route.access;
  if (access === undefined) {
    return { allowed: true, denial: null };
  }
  if (input.role === null) {
    return { allowed: false, denial: "anonymous" };
  }
  if (access.roles !== undefined && !access.roles.includes(input.role)) {
    return { allowed: false, denial: "role_mismatch" };
  }
  if (access.permissions !== undefined) {
    for (const code of access.permissions) {
      if (!input.permissions.includes(code)) {
        return { allowed: false, denial: "permission_missing" };
      }
    }
  }
  return { allowed: true, denial: null };
}

export interface RouteFilterInput {
  readonly role: AuthRole | null;
  readonly permissions: readonly PermissionCode[];
  readonly routes: readonly RouteMeta[];
}

/** Filters navigation entries to the routes a session may access. */
export function filterAccessibleRoutes(input: RouteFilterInput): readonly RouteMeta[] {
  return input.routes.filter(
    (route) =>
      evaluateRouteAccess({
        role: input.role,
        permissions: input.permissions,
        route,
      }).allowed,
  );
}
