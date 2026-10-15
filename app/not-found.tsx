// path: app/not-found.tsx
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

import { Logo } from "@/components/brand/logo";
import { NotFoundSearch } from "@/components/navigation/not-found-search";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/** Branded 404 with a working site search and a way back home. */
export default function NotFound(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <Link href="/" prefetch={false}>
        <Logo />
      </Link>
      <div className="flex flex-col items-center gap-2">
        <p className="text-display-xl text-primary font-bold" aria-hidden="true">
          404
        </p>
        <h1 className="text-heading-lg font-bold">{strings.notFound.title}</h1>
        <p className="text-body-md text-muted-foreground max-w-md">
          {strings.notFound.description}
        </p>
      </div>
      <NotFoundSearch />
      <Button asChild>
        <Link href="/" prefetch={false}>
          {strings.actions.backToHome}
        </Link>
      </Button>
    </div>
  );
}
