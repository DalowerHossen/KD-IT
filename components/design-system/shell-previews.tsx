// path: components/design-system/shell-previews.tsx
import { LockKeyhole } from "lucide-react";
import type { ReactElement } from "react";

import { AuthShell } from "@/components/layout/auth-shell";
import { PortalShell } from "@/components/layout/portal-shell";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { NAV_MAP } from "@/config/nav-map";
import { layoutTokens } from "@/config/design-tokens";
import { strings } from "@/lib/i18n/strings/en";

/**
 * Live previews of the layout contracts owned by Step 01. The shells render
 * with their real navigation and chrome inside bounded frames; the routes
 * that mount them are registered by the steps that own product pages.
 */
export function ShellPreviews(): ReactElement {
  const previewSections = [
    { id: "dashboard" as const, items: NAV_MAP.filter((entry) => entry.showInNav) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-heading-sm mb-3 font-semibold">
          {strings.designSystem.shellDemo.appShellTitle}
        </h3>
        <p className="text-body-sm text-muted-foreground mb-3 max-w-prose">
          {strings.designSystem.shellDemo.previewNote}
        </p>
        <div className="overflow-hidden rounded-lg border shadow-md">
          <div className="flex h-[420px]">
            <aside className="bg-card hidden w-56 shrink-0 flex-col border-r sm:flex">
              <div className="h-topbar flex items-center border-b px-4">
                <span className="text-body-md font-bold">{strings.brand.name}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidebarNav sections={previewSections} />
              </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="bg-muted/30 flex-1 overflow-y-auto p-4">
                <Card>
                  <CardContent className="text-body-sm text-muted-foreground p-6">
                    Page content renders in a centered container with a{" "}
                    {layoutTokens.contentMaxWidth} maximum width, a sticky{" "}
                    {layoutTokens.topbarHeight} top bar, and breadcrumbs generated from the
                    navigation map.
                  </CardContent>
                </Card>
              </main>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-sm mb-3 font-semibold">
          {strings.designSystem.shellDemo.authShellTitle}
        </h3>
        <div className="overflow-hidden rounded-lg border shadow-md">
          <div className="max-h-[460px] overflow-y-auto">
            <AuthShell>
              <Card>
                <CardContent className="flex flex-col gap-2 p-6">
                  <p className="text-heading-sm font-semibold">{strings.authShell.panelTitle}</p>
                  <p className="text-body-sm text-muted-foreground">
                    Authentication forms render in this column. The contract is complete: brand
                    panel, return navigation, and a centered single-column form area.
                  </p>
                </CardContent>
              </Card>
            </AuthShell>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-sm mb-3 font-semibold">
          {strings.designSystem.shellDemo.portalShellTitle}
        </h3>
        <div className="overflow-hidden rounded-lg border shadow-md">
          <div className="max-h-[460px] overflow-y-auto">
            <PortalShell>
              <Card>
                <CardContent className="flex flex-col gap-2 p-6">
                  <p className="text-heading-sm flex items-center gap-2 font-semibold">
                    <LockKeyhole className="text-success size-5" aria-hidden="true" />
                    {strings.shell.securePortalBadge}
                  </p>
                  <p className="text-body-sm text-muted-foreground">
                    {strings.designSystem.shellDemo.previewNote}
                  </p>
                </CardContent>
              </Card>
            </PortalShell>
          </div>
        </div>
      </div>
    </div>
  );
}
