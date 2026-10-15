// path: app/(dashboard)/settings/notifications/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { NotificationsPanel } from "@/components/settings/notifications-panel";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.settings.notifications.title,
  description: strings.settings.notifications.subtitle,
};

/** The signed-in user's notification inbox. */
export default function SettingsNotificationsPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <NotificationsPanel />
    </div>
  );
}
