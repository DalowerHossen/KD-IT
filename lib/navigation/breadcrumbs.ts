// path: lib/navigation/breadcrumbs.ts
import type { BreadcrumbItem, RouteMeta } from "@/lib/navigation/route-metadata";

function titleizeSegment(segment: string): string {
  return segment
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

/**
 * Derives breadcrumbs for a pathname from the central navigation map. Parent
 * segments that are not registered fall back to a title-cased label without
 * a link, so breadcrumbs never point at a route that does not exist.
 */
export function getBreadcrumbs(
  pathname: string,
  navMap: readonly RouteMeta[],
  homeLabel = "Home",
): BreadcrumbItem[] {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") {
    return [{ label: homeLabel }];
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const items: BreadcrumbItem[] = [{ label: homeLabel, href: "/" }];

  segments.forEach((segment, index) => {
    const candidate = `/${segments.slice(0, index + 1).join("/")}`;
    const meta = navMap.find((entry) => entry.path === candidate);
    const isLast = index === segments.length - 1;
    const label = meta ? (meta.breadcrumbLabel ?? meta.title) : titleizeSegment(segment);
    if (isLast) {
      items.push({ label });
      return;
    }
    items.push(meta ? { label, href: candidate } : { label });
  });

  return items;
}
