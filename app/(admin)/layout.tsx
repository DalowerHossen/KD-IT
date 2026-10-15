// path: app/(admin)/layout.tsx
import type { ReactElement, ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getNavSection } from "@/config/nav-map";

/**
 * Platform administration layout contract for the super_admin, ceo, and
 * admin_staff surfaces. Routes and role filtering are registered by their
 * owning steps through the central navigation map.
 */
export default function AdminLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return <AppShell sections={[getNavSection("admin")]}>{children}</AppShell>;
}
