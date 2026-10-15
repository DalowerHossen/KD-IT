// path: components/states/loading-state.tsx
import type { ReactElement } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export interface LoadingStateProps {
  readonly title?: string;
  readonly description?: string;
  /** Number of skeleton rows rendered below the header area. */
  readonly rows?: number;
  readonly className?: string;
}

/** Branded loading placeholder announced as busy to assistive technology. */
export function LoadingState({
  title = strings.states.loading.title,
  description = strings.states.loading.description,
  rows = 3,
  className,
}: LoadingStateProps): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("bg-card flex w-full flex-col gap-6 rounded-lg border p-6", className)}
    >
      <div className="flex items-center gap-3">
        <Spinner size="md" />
        <div className="flex flex-col">
          <span className="text-body-md font-medium">{title}</span>
          <span className="text-body-sm text-muted-foreground">{description}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={cn("h-12 w-full", index === rows - 1 && "w-2/3")} />
        ))}
      </div>
    </div>
  );
}
