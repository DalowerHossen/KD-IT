// path: app/(public)/page.tsx
import { Accessibility, ArrowRight, Boxes, Coins, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";

const pillarIcons = [ShieldCheck, Coins, Boxes, Accessibility] as const;

export const metadata: Metadata = {
  title: strings.metadata.defaultTitle,
  description: strings.metadata.defaultDescription,
};

/** Public home: platform overview with real foundation-stage content. */
export default function HomePage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col gap-20 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <section aria-labelledby="home-hero" className="flex max-w-3xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          {strings.home.eyebrow}
        </Badge>
        <h1 id="home-hero" className="text-display-xl sm:text-display-2xl tracking-tight">
          {strings.home.title}
        </h1>
        <p className="text-body-lg text-muted-foreground">{strings.home.subtitle}</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/design-system" prefetch={false}>
              {strings.home.primaryCta}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={`mailto:${siteConfig.supportEmail}`}>{strings.home.secondaryCta}</a>
          </Button>
        </div>
      </section>

      <section aria-labelledby="home-pillars" className="flex flex-col gap-6">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 id="home-pillars" className="text-heading-lg font-bold tracking-tight">
            {strings.home.pillarsTitle}
          </h2>
          <p className="text-body-md text-muted-foreground">{strings.home.pillarsIntro}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {strings.home.pillars.map((pillar, index) => {
            const Icon = pillarIcons[index] ?? ShieldCheck;
            return (
              <Card key={pillar.title} className="duration-fast transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="bg-primary/10 mb-2 flex size-10 items-center justify-center rounded-md">
                    <Icon className="text-primary size-5" aria-hidden="true" />
                  </div>
                  <CardTitle>{pillar.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-body-sm text-muted-foreground">{pillar.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="home-status" className="bg-card rounded-lg border p-8">
        <h2 id="home-status" className="text-heading-md font-semibold">
          {strings.home.statusTitle}
        </h2>
        <p className="text-body-md text-muted-foreground mt-2 max-w-3xl">
          {strings.home.statusBody}
        </p>
        <Button variant="secondary" asChild className="mt-4">
          <Link href="/design-system" prefetch={false}>
            {strings.home.primaryCta}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
