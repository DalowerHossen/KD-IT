// path: components/ui/input.tsx
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export type InputProps = ComponentProps<"input">;

export function Input({ className, type = "text", ...props }: InputProps): ReactElement {
  return (
    <input
      type={type}
      className={cn(
        "border-input bg-background text-body-md duration-fast placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 flex h-11 w-full rounded-md border px-3 py-2 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
