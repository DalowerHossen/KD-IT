// path: app/(auth)/mfa/setup/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { MfaSetup } from "@/components/auth/mfa-setup";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.mfa.enroll.title,
  description: strings.mfa.enroll.step1,
};

/**
 * Mandatory 2FA enrollment. Reached when a login requires aal2 but the user
 * has no verified second factor. Completing enrollment activates the TOTP
 * factor, offers backup codes, and upgrades the session to aal2.
 */
export default function MfaSetupPage(): ReactElement {
  return (
    <div className="flex w-full flex-col items-start px-2 py-6">
      <MfaSetup />
    </div>
  );
}
