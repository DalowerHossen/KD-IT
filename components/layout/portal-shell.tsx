// path: components/layout/portal-shell.tsx
import { ShieldCheck } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { Separator } from "@/components/ui/separator";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";

export interface PortalShellProps {
  readonly children: ReactNode;
}

/**
 * Tokenized client portal layout contract: calm, branding-first chrome for
 * private document links. Token pages are always marked noindex.
 */
export function PortalShell({ children }: PortalShellProps): ReactElement {
  return (
    <div className="bg-muted/40 flex min-h-dvh flex-col">
      <header className="bg-card border-b">
        <div className="h-topbar mx-auto flex w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <span className="bg-success/10 text-caption text-success inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {strings.shell.securePortalBadge}
          </span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 focus-visible:outline-none">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{children}</div>
      </main>
      <Separator />
      <footer className="text-body-sm text-muted-foreground mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <p>{strings.shell.portalFooterNote}</p>
        <p className="mt-1">
          <a
            href={`mailto:${siteConfig.supportEmail}`}
            className="text-foreground focus-visible:ring-ring rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {siteConfig.supportEmail}
          </a>
        </p>
      </footer>
    </div>
  );
}
