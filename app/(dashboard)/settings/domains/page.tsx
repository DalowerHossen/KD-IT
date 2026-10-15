// path: app/(dashboard)/settings/domains/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { DomainsPanel } from "@/components/settings/domains-panel";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.settings.domains.title,
  description: strings.settings.domains.subtitle,
};

/** Workspace custom domain settings (admin). */
export default function SettingsDomainsPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <DomainsPanel />
    </div>
  );
}
