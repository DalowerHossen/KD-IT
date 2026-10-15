// path: components/settings/settings-index.tsx
import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { strings } from "@/lib/i18n/strings/en";

interface AreaLink {
  readonly href: string;
  readonly title: string;
  readonly description: string;
}

function areaLinks(): AreaLink[] {
  const copy = strings.settings;
  return [
    {
      href: "/settings/profile",
      title: copy.index.profile.title,
      description: copy.index.profile.description,
    },
    {
      href: "/settings/invoice",
      title: copy.index.invoice.title,
      description: copy.index.invoice.description,
    },
    {
      href: "/settings/domains",
      title: copy.index.domains.title,
      description: copy.index.domains.description,
    },
    {
      href: "/settings/backups",
      title: copy.index.backups.title,
      description: copy.index.backups.description,
    },
    { href: "/settings/kyc", title: copy.index.kyc.title, description: copy.index.kyc.description },
    {
      href: "/settings/notifications",
      title: copy.index.notifications.title,
      description: copy.index.notifications.description,
    },
    { href: "/team", title: strings.team.title, description: strings.team.subtitle },
    {
      href: "/account",
      title: strings.auth.account.title,
      description: strings.auth.account.subtitle,
    },
    { href: "/security/mfa", title: strings.mfa.title, description: strings.mfa.subtitle },
  ];
}

/** Settings hub linking to each settings area (server component; no data fetched). */
export function SettingsIndex(): ReactElement {
  const copy = strings.settings;
  const links = areaLinks();
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-display-md">{copy.index.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.index.subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <Card key={link.href} className="hover:bg-accent/40 transition-colors">
            <CardContent className="flex flex-col gap-1">
              <a
                href={link.href}
                className="text-body-md font-semibold hover:underline"
                aria-label={link.title}
              >
                {link.title}
              </a>
              <p className="text-body-sm text-muted-foreground">{link.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
