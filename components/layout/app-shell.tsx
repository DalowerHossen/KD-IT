// path: components/layout/app-shell.tsx
"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";

import { Logo } from "@/components/brand/logo";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Topbar, type ShellUser } from "@/components/layout/topbar";
import { ShortcutReference } from "@/components/navigation/shortcut-reference";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { strings } from "@/lib/i18n/strings/en";
import type { NavSection } from "@/lib/navigation/route-metadata";
import { cn } from "@/lib/utils/cn";

const SIDEBAR_STORAGE_KEY = "kd.sidebar.collapsed";
const SIDEBAR_CHANGE_EVENT = "kd.sidebar.change";

function subscribeSidebarStorage(onStoreChange: () => void): () => void {
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readSidebarCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

/** Persisted sidebar collapse state, hydrated through an external store. */
function useSidebarCollapsed(): readonly [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    subscribeSidebarStorage,
    readSidebarCollapsed,
    () => false,
  );
  const toggle = useCallback((): void => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!readSidebarCollapsed()));
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  }, []);
  return [collapsed, toggle];
}

export interface AppShellProps {
  readonly sections: readonly NavSection[];
  readonly user?: ShellUser;
  readonly onOpenSettings?: () => void;
  readonly onSignOut?: () => void;
  readonly children: ReactNode;
}

/**
 * Shared application shell for dashboard and admin surfaces: collapsible
 * persisted sidebar (264px expanded, 72px rail), sticky 64px top bar, mobile
 * drawer, offline banner, breadcrumbs, command palette, and centered content.
 */
export function AppShell({
  sections,
  user,
  onOpenSettings,
  onSignOut,
  children,
}: AppShellProps): ReactElement {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-background flex min-h-dvh">
      <aside
        aria-label={strings.shell.mainNavigation}
        className={cn(
          "bg-card duration-normal ease-standard fixed inset-y-0 left-0 z-40 hidden flex-col border-r transition-[width] motion-reduce:transition-none md:flex",
          collapsed ? "w-sidebar-collapsed" : "w-sidebar-expanded",
        )}
      >
        <div className="h-topbar flex items-center justify-center border-b px-3">
          <Link href="/" prefetch={false}>
            <Logo variant={collapsed ? "mark" : "full"} />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav sections={sections} collapsed={collapsed} />
        </div>
        <Separator />
        <div className="p-3">
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? strings.actions.expandSidebar : strings.actions.collapseSidebar}
            className="w-full"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose aria-hidden="true" />
                {strings.actions.collapseSidebar}
              </>
            )}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="sm:max-w-sidebar-expanded w-sidebar-expanded gap-0 p-0"
        >
          <SheetTitle className="sr-only">{strings.shell.mainNavigation}</SheetTitle>
          <div className="h-topbar flex items-center border-b px-4">
            <Logo />
          </div>
          <SidebarNav sections={sections} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "duration-normal ease-standard flex min-w-0 flex-1 flex-col transition-[margin] motion-reduce:transition-none",
          collapsed ? "md:ml-sidebar-collapsed" : "md:ml-sidebar-expanded",
        )}
      >
        <Topbar
          onMobileMenuClick={() => setMobileOpen(true)}
          {...(user === undefined ? {} : { user })}
          {...(onOpenSettings === undefined ? {} : { onOpenSettings })}
          {...(onSignOut === undefined ? {} : { onSignOut })}
        />
        <OfflineBanner />
        <main id="main-content" tabIndex={-1} className="flex-1 focus-visible:outline-none">
          <div className="max-w-content mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <ShortcutReference />
    </div>
  );
}
