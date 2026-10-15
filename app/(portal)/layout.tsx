// path: app/(portal)/layout.tsx
import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";

import { PortalShell } from "@/components/layout/portal-shell";

/** Tokenized client pages are private links and are never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Tokenized client portal layout contract. Step 11 registers the document
 * token routes; the branded minimal chrome contract is owned by Step 01.
 */
export default function PortalLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return <PortalShell>{children}</PortalShell>;
}
