// path: app/(dashboard)/settings/kyc/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { KycPanel } from "@/components/settings/kyc-panel";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.settings.kyc.title,
  description: strings.settings.kyc.subtitle,
};

/** Workspace identity verification (KYC) settings (owner). */
export default function SettingsKycPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <KycPanel />
    </div>
  );
}
