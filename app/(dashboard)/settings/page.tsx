// path: app/(dashboard)/settings/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { SettingsIndex } from "@/components/settings/settings-index";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.settings.index.title,
  description: strings.settings.index.subtitle,
};

/** Settings hub for the signed-in user's workspace. The proxy redirects unauthenticated visitors. */
export default function SettingsPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <SettingsIndex />
    </div>
  );
}
