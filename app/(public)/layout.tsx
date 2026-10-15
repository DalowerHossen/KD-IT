// path: app/(public)/layout.tsx
import type { ReactElement, ReactNode } from "react";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";

/** Public site layout: sticky header, main landmark, and footer. */
export default function PublicLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 focus-visible:outline-none">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
