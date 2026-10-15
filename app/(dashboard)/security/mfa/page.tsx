// path: app/(dashboard)/security/mfa/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { MfaSettings } from "@/components/auth/mfa-settings";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.mfa.title,
  description: strings.mfa.subtitle,
};

/**
 * Two-factor settings for the signed-in user. Requires a fully authenticated
 * (aal2) session; the proxy and the MFA API backstops enforce sign-in.
 */
export default function MfaSettingsPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <MfaSettings />
    </div>
  );
}
