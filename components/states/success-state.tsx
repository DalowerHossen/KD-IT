// path: components/states/success-state.tsx
import { CheckCircle2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export interface SuccessStateProps {
  readonly title?: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

/** Confirmation block after a completed action, announced politely. */
export function SuccessState({
  title = strings.states.success.title,
  description = strings.states.success.description,
  action,
  className,
}: SuccessStateProps): ReactElement {
  return (
    <div
      aria-live="polite"
      className={cn(
        "border-success/40 bg-card flex w-full flex-col items-center gap-4 rounded-lg border p-8 text-center",
        className,
      )}
    >
      <div className="bg-success/10 flex size-12 items-center justify-center rounded-full">
        <CheckCircle2 className="text-success size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-heading-sm font-semibold">{title}</h2>
        <p className="text-body-sm text-muted-foreground max-w-prose">{description}</p>
      </div>
      {action}
    </div>
  );
}
