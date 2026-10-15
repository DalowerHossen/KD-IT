// path: app/(dashboard)/account/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { AccountOverview } from "@/components/auth/account-overview";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.auth.account.title,
  description: strings.auth.account.subtitle,
};

/**
 * Authenticated account surface: identity, sessions, password, logout.
 * The proxy redirects unauthenticated visitors to sign-in; the client
 * composition backstops expired sessions the same way.
 */
export default function AccountPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <AccountOverview />
    </div>
  );
}
