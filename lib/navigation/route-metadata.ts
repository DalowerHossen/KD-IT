// path: lib/navigation/route-metadata.ts
import type { LucideIcon } from "lucide-react";

/**
 * Navigation contract types. The central navigation map (config/nav-map.ts)
 * is the single source of truth registered against these types. Page-owning
 * steps extend the map with complete routes only.
 */
export type RouteSection = "public" | "auth" | "dashboard" | "admin" | "portal";

/**
 * Authenticated role order from the requirements addendum. Declared once here
 * because navigation filtering consumes it; the Step 03 permission registry
 * imports this contract instead of redefining the role list.
 */
export const ROLE_ORDER = ["super_admin", "ceo", "admin_staff", "owner", "staff"] as const;

export type AppRole = (typeof ROLE_ORDER)[number];

/** Permission codes follow the "domain.action" convention, e.g. invoices.read. */
export type PermissionCode = `${string}.${string}`;

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
