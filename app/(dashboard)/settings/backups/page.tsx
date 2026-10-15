// path: app/(dashboard)/settings/backups/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { BackupsPanel } from "@/components/settings/backups-panel";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.settings.backups.title,
  description: strings.settings.backups.subtitle,
};

/** Workspace encrypted backup settings (owner). */
export default function SettingsBackupsPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <BackupsPanel />
    </div>
  );
}
