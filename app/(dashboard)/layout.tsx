// path: app/(dashboard)/layout.tsx
import type { ReactElement, ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getNavSection } from "@/config/nav-map";

/**
 * Tenant workspace layout contract. Owning steps register their dashboard
 * routes in config/nav-map.ts; the sidebar renders the registered section
 * and shows the shared empty state until modules land.
 */
export default function DashboardLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <AppShell sections={[getNavSection("dashboard")]}>{children}</AppShell>;
}
