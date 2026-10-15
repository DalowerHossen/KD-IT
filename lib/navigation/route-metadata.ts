// path: lib/navigation/route-metadata.ts
import type { LucideIcon } from "lucide-react";

import { type PermissionCode as RegistryPermissionCode } from "@/lib/auth/permissions";
import { AUTH_ROLES, type AuthRole } from "@/lib/auth/roles";

/**
 * Navigation contract types. The central navigation map (config/nav-map.ts)
 * is the single source of truth registered against these types. Page-owning
 * steps extend the map with complete routes only.
 */
export type RouteSection = "public" | "auth" | "dashboard" | "admin" | "portal";

/**
 * Single-source role and permission aliases. The canonical typed registries
 * live in lib/auth/roles.ts and lib/auth/permissions.ts; navigation
 * re-exports them so role and permission strings are never duplicated.
 */
export const ROLE_ORDER = AUTH_ROLES;

export type AppRole = AuthRole;

/** Permission codes come from the central registry, e.g. team.invite. */
export type PermissionCode = RegistryPermissionCode;

export interface RouteAccess {
  /** Roles allowed to see the entry; undefined means every visitor. */
  readonly roles?: readonly AppRole[];
  /** Permission codes required in addition to the role check. */
  readonly permissions?: readonly PermissionCode[];
}

export interface RouteMeta {
  /** Absolute App Router path, e.g. /design-system. */
  readonly path: string;
  /** Short title for navigation, breadcrumbs, and the command palette. */
  readonly title: string;
  /** One-line description used by search and metadata. */
  readonly description: string;
  /** Navigation section the route belongs to. */
  readonly section: RouteSection;
  /** Lucide icon for menus and the command palette. */
  readonly icon?: LucideIcon;
  /** Whether the route appears in navigation surfaces. */
  readonly showInNav: boolean;
  /** Extra search keywords for the command palette. */
  readonly keywords?: readonly string[];
  /** Breadcrumb label override when it differs from the title. */
  readonly breadcrumbLabel?: string;
  /** Access contract; undefined means unrestricted. */
  readonly access?: RouteAccess;
}

export interface BreadcrumbItem {
  readonly label: string;
  /** Undefined for the current (final) breadcrumb item. */
  readonly href?: string;
}

export interface NavSection {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly RouteMeta[];
}
