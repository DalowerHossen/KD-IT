// path: components/brand/logo.tsx
import type { ReactElement } from "react";

import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export interface LogoProps {
  /** Full shows the wordmark; mark shows the icon glyph only. */
  readonly variant?: "full" | "mark";
  readonly className?: string;
}

/** Brand logo with gradient mark and wordmark, in light and dark safe tones. */
export function Logo({ variant = "full", className }: LogoProps): ReactElement {
  return (
    <span
      role="img"
      aria-label={strings.brand.logoLabel}
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0 rounded-md"
      >
        <rect width="32" height="32" rx="7" className="fill-primary" />
        <path
          d="M9.5 22.5V9.5h2.6v5.1l5-5.1h3.4l-5.2 5.2 5.5 7.8h-3.3l-4-5.9-1.4 1.4v4.5H9.5z"
          className="fill-primary-foreground"
        />
        <circle cx="22.4" cy="21.4" r="2.1" className="fill-primary-foreground/80" />
      </svg>
      {variant === "mark" ? null : (
        <span className="text-body-md text-foreground font-bold tracking-tight">
          {strings.brand.name}
        </span>
      )}
    </span>
  );
}
