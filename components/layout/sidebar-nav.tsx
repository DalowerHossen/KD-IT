// path: components/layout/sidebar-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { strings } from "@/lib/i18n/strings/en";
import type { NavSection } from "@/lib/navigation/route-metadata";
import { cn } from "@/lib/utils/cn";

export interface SidebarNavProps {
  readonly sections: readonly NavSection[];
  /** Collapsed rail mode shows icon-only entries with tooltips. */
  readonly collapsed?: boolean;
  readonly onNavigate?: () => void;
}

/** Role-filtered sidebar navigation with active and parent-active states. */
export function SidebarNav({
  sections,
  collapsed = false,
  onNavigate,
}: SidebarNavProps): ReactElement {
  const pathname = usePathname();
  const hasItems = sections.some((section) => section.items.length > 0);

  if (!hasItems) {
    return (
      <div className="p-3">
        <EmptyState
          compact
          title={strings.shell.emptyNavigationTitle}
          description={strings.shell.emptyNavigationDescription}
        />
      </div>
    );
  }

  return (
    <nav aria-label={strings.shell.mainNavigation} className="flex flex-col gap-6 p-3">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-1">
          {section.label === undefined || collapsed ? null : (
            <p className="text-caption text-muted-foreground px-3 pb-1 font-semibold tracking-wide uppercase">
              {section.label}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const isActive = pathname === item.path || pathname?.startsWith(`${item.path}/`);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.path}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "text-body-sm duration-fast hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex h-11 items-center gap-3 rounded-md px-3 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  {Icon === undefined ? null : (
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                  )}
                  {collapsed ? (
                    <span className="sr-only">{item.title}</span>
                  ) : (
                    <span className="truncate">{item.title}</span>
                  )}
                </Link>
              );
              return (
                <li key={item.path}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.title}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
