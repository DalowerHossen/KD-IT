// path: app/(dashboard)/team/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { TeamManager } from "@/components/team/team-manager";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.team.title,
  description: strings.team.subtitle,
};

/**
 * Team management for the caller's working company. The proxy and the
 * working-context guard require an authenticated session with an active role;
 * the client surface backstops expired sessions the same way.
 */
export default function TeamPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <TeamManager />
    </div>
  );
}
