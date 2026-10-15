// path: app/(dashboard)/settings/profile/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { ProfileForm } from "@/components/settings/profile-form";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.settings.profile.title,
  description: strings.settings.profile.subtitle,
};

/** Workspace profile settings (owner, optimistic). */
export default function SettingsProfilePage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <ProfileForm />
    </div>
  );
}
