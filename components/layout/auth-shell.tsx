// path: components/layout/auth-shell.tsx
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { strings } from "@/lib/i18n/strings/en";

export interface AuthShellProps {
  readonly children: ReactNode;
}

/**
 * Authentication layout contract: split screen with the form column on the
 * left and a brand trust panel on the right; the panel collapses into a
 * compact header on mobile.
 */
export function AuthShell({ children }: AuthShellProps): ReactElement {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:min-h-0">
        <div className="flex items-center justify-between">
          <Link href="/" prefetch={false}>
            <Logo />
          </Link>
          <Link
            href="/"
            prefetch={false}
            className="text-body-sm text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {strings.authShell.backToSite}
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="brand-gradient text-primary-foreground relative hidden flex-col justify-between p-10 lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:32px_32px] opacity-20"
        />
        <div className="relative flex flex-col gap-4 pt-16">
          <h2 className="text-display-xl max-w-md">{strings.authShell.panelTitle}</h2>
          <p className="text-body-lg max-w-md opacity-90">{strings.authShell.panelDescription}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {strings.authShell.bullets.map((bullet) => (
              <li key={bullet} className="text-body-md flex items-center gap-2.5">
                <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-body-sm relative opacity-80">{strings.brand.tagline}</p>
      </div>
    </div>
  );
}
