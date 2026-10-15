// path: components/ui/spinner.tsx
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

const spinnerSizes = { sm: "size-4", md: "size-6", lg: "size-8" } as const;

export interface SpinnerProps extends ComponentProps<"span"> {
  readonly size?: keyof typeof spinnerSizes;
  /** Accessible label; when provided the spinner exposes role="status". */
  readonly label?: string;
}

/** Inline loading indicator that freezes under reduced-motion preferences. */
export function Spinner({ className, size = "md", label, ...props }: SpinnerProps): ReactElement {
  return (
    <span
      role={label === undefined ? undefined : "status"}
      className={cn("inline-flex items-center", className)}
      {...props}
    >
      <svg
        className={cn("animate-spin motion-reduce:animate-none", spinnerSizes[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden={label === undefined ? true : undefined}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
      {label === undefined ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}
