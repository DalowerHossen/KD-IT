// path: components/states/empty-state.tsx
import { Inbox } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps {
  readonly title?: string;
  readonly description?: string;
  /** Primary call-to-action, typically a link or a create button. */
  readonly action?: ReactNode;
  /** Compact layout for dense areas such as tables and sidebars. */
  readonly compact?: boolean;
  readonly className?: string;
}

/** Empty content placeholder with illustration and an actionable CTA. */
export function EmptyState({
  title = strings.states.empty.title,
  description = strings.states.empty.description,
  action,
  compact = false,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div
      className={cn(
        "bg-card flex w-full flex-col items-center gap-4 rounded-lg border border-dashed text-center",
        compact ? "p-6" : "p-10",
        className,
      )}
    >
      <div
        className={cn(
          "bg-muted flex items-center justify-center rounded-full",
          compact ? "size-10" : "size-14",
        )}
      >
        <Inbox
          className={cn("text-muted-foreground", compact ? "size-5" : "size-7")}
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className={cn("font-semibold", compact ? "text-body-md" : "text-heading-sm")}>
          {title}
        </h2>
        <p className="text-body-sm text-muted-foreground max-w-prose">{description}</p>
      </div>
      {action}
    </div>
  );
}
