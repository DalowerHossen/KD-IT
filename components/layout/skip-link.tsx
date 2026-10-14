// path: components/layout/skip-link.tsx
import type { ReactElement } from "react";

import { strings } from "@/lib/i18n/strings/en";

/** Keyboard-first skip link targeting the #main-content landmark. */
export function SkipLink(): ReactElement {
  return (
    <a
      href="#main-content"
      className="focus:bg-primary focus:text-body-sm focus:text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:font-medium focus:outline-none"
    >
      {strings.shell.skipToContent}
    </a>
  );
}
