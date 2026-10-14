// path: components/layout/public-header.tsx
"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactElement } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_MAP } from "@/config/nav-map";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

const publicLinks = NAV_MAP.filter((entry) => entry.section === "public" && entry.showInNav);

/** Sticky public site header with desktop links and a mobile drawer. */
export function PublicHeader(): ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="z-header bg-background/80 sticky top-0 border-b backdrop-blur-sm">
      <div className="h-topbar max-w-content mx-auto flex w-full items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" prefetch={false} className="shrink-0">
          <Logo />
        </Link>
        <nav
          aria-label={strings.header.navigationLabel}
          className="ml-6 hidden items-center gap-1 md:flex"
        >
          {publicLinks.map((entry) => {
            const isActive = pathname === entry.path;
            return (
              <Button key={entry.path} variant={isActive ? "secondary" : "ghost"} size="sm" asChild>
                <Link
                  href={entry.path}
                  prefetch={false}
                  aria-current={isActive ? "page" : undefined}
                >
                  {entry.title}
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button size="sm" asChild className="hidden sm:inline-flex">
            <a href={`mailto:${siteConfig.supportEmail}`}>{strings.header.primaryCtaLabel}</a>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={strings.actions.openMenu}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-sidebar-expanded">
              <SheetTitle className="sr-only">{strings.header.navigationLabel}</SheetTitle>
              <nav aria-label={strings.header.navigationLabel} className="flex flex-col gap-2">
                {publicLinks.map((entry) => {
                  const isActive = pathname === entry.path;
                  return (
                    <Link
                      key={entry.path}
                      href={entry.path}
                      prefetch={false}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "text-body-md hover:bg-accent rounded-md px-3 py-3 font-medium transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      {entry.title}
                    </Link>
                  );
                })}
                <Button asChild className="mt-3">
                  <a href={`mailto:${siteConfig.supportEmail}`}>{strings.header.primaryCtaLabel}</a>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
