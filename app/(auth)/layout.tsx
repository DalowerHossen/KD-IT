// path: app/(auth)/layout.tsx
import type { ReactElement, ReactNode } from "react";

import { AuthShell } from "@/components/layout/auth-shell";

/**
 * Authentication layout contract. Step 03 registers its authentication
 * pages inside this group; the split-screen shell contract is owned by
 * Step 01 and previewed on the design system page.
 */
export default function AuthLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return <AuthShell>{children}</AuthShell>;
}
