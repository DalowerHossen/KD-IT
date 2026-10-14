// path: components/ui/tag.tsx
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export interface TagProps {
  readonly label: ReactNode;
  /** When provided, renders a remove button announcing "Remove <label>". */
  readonly onRemove?: () => void;
  readonly className?: string;
}

/** Removable tag chip used for filters, categories, and selections. */
export function Tag({ label, onRemove, className }: TagProps): ReactElement {
  return (
    <span
      className={cn(
        "bg-secondary text-body-sm text-secondary-foreground inline-flex h-8 items-center gap-1 rounded-full border pr-2 pl-3",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {onRemove === undefined ? null : (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${strings.actions.removeTag} ${typeof label === "string" ? label : ""}`}
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring inline-flex size-6 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
