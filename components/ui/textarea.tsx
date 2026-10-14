// path: components/ui/textarea.tsx
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, ...props }: TextareaProps): ReactElement {
  return (
    <textarea
      className={cn(
        "border-input bg-background text-body-md duration-fast placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background aria-[invalid=true]:border-destructive flex min-h-24 w-full rounded-md border px-3 py-2 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
