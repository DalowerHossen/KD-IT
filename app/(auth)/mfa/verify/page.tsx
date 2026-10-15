// path: app/(auth)/mfa/verify/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { MfaVerify } from "@/components/auth/mfa-verify";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.mfa.verify.title,
  description: strings.mfa.verify.prompt,
};

/**
 * Post-login 2FA challenge. Reached when a password login leaves the session
 * at aal1 but the user's roles require aal2. Verifying a TOTP or backup code
 * upgrades the session; the session gate then admits onward navigation.
 */
export default function MfaVerifyPage(): ReactElement {
  return (
    <div className="flex w-full flex-col items-start px-2 py-6">
      <MfaVerify />
    </div>
  );
}
