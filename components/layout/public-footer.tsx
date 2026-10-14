// path: components/layout/public-footer.tsx
import Link from "next/link";
import type { ReactElement } from "react";

import { Logo } from "@/components/brand/logo";
import { Separator } from "@/components/ui/separator";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";

/** Public site footer with product, support, and build information. */
export function PublicFooter(): ReactElement {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-card border-t">
      <div className="max-w-content mx-auto grid w-full gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="text-body-sm text-muted-foreground max-w-xs">{siteConfig.tagline}</p>
        </div>
        <nav aria-label={strings.footer.productHeading} className="flex flex-col gap-2">
          <h2 className="text-caption text-muted-foreground font-semibold tracking-wide uppercase">
            {strings.footer.productHeading}
          </h2>
          <Link
            href="/"
            prefetch={false}
            className="text-body-sm text-foreground focus-visible:ring-ring w-fit rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {strings.footer.homeLinkLabel}
          </Link>
          <Link
            href="/design-system"
            prefetch={false}
            className="text-body-sm text-foreground focus-visible:ring-ring w-fit rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {strings.footer.designSystemLinkLabel}
          </Link>
        </nav>
        <div className="flex flex-col gap-2">
          <h2 className="text-caption text-muted-foreground font-semibold tracking-wide uppercase">
            {strings.footer.supportHeading}
          </h2>
          <a
            href={`mailto:${siteConfig.supportEmail}`}
            className="text-body-sm text-foreground focus-visible:ring-ring w-fit rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {strings.footer.supportLinkLabel}
          </a>
          <p className="text-body-sm text-muted-foreground">{siteConfig.supportEmail}</p>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-caption text-muted-foreground font-semibold tracking-wide uppercase">
            {strings.footer.versionLabel}
          </h2>
          <p className="text-body-sm text-muted-foreground">
            {strings.footer.versionLabel} {siteConfig.version}
          </p>
        </div>
      </div>
      <Separator />
      <div className="max-w-content text-body-sm text-muted-foreground mx-auto flex w-full flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          {strings.footer.copyrightSymbol} {currentYear} {siteConfig.name}.{" "}
          {strings.footer.rightsNotice}
        </p>
        <p>{siteConfig.tagline}</p>
      </div>
    </footer>
  );
}
