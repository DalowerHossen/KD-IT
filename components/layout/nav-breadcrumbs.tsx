// path: components/layout/nav-breadcrumbs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NAV_MAP } from "@/config/nav-map";
import { getBreadcrumbs } from "@/lib/navigation/breadcrumbs";

/** Auto-generated breadcrumbs for the current path from the navigation map. */
export function NavBreadcrumbs(): ReactElement {
  const pathname = usePathname();
  const items = getBreadcrumbs(pathname ?? "/", NAV_MAP);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => (
          <BreadcrumbItem key={`${item.label}-${index}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            {item.href === undefined ? (
              <BreadcrumbPage>{item.label}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Link href={item.href} prefetch={false}>
                  {item.label}
                </Link>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
