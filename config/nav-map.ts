// path: config/nav-map.ts
import { Home, LayoutGrid } from "lucide-react";

import { strings } from "@/lib/i18n/strings/en";
import type { NavSection, RouteMeta } from "@/lib/navigation/route-metadata";

/**
 * Central navigation map: the single source of truth for routes, breadcrumb
 * labels, command palette entries, and menu composition. Every implemented
 * route is registered here, and scripts/check-nav-routes.mjs proves that no
 * registered path or internal link is dead. Page-owning steps register their
 * complete routes here; routes without pages are never registered.
 */
export const NAV_MAP: readonly RouteMeta[] = [
  {
    path: "/",
    title: "Home",
    description: "KD SOLUTION IT platform overview and foundation status.",
    section: "public",
    icon: Home,
    showInNav: true,
    keywords: ["start", "overview", "platform"],
  },
  {
    path: "/design-system",
    title: strings.designSystem.title,
    description: strings.designSystem.description,
    section: "public",
    icon: LayoutGrid,
    showInNav: true,
    keywords: ["tokens", "components", "primitives", "reference"],
  },
];

/** Composes visible navigation sections for a shell from the map. */
export function getNavSection(section: RouteMeta["section"]): NavSection {
  return {
    id: section,
    items: NAV_MAP.filter((entry) => entry.section === section && entry.showInNav),
  };
}
