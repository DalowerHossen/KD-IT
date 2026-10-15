// path: components/ui/progress.tsx
"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export function Progress({
  className,
  value = 0,
  max = 100,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root>): ReactElement {
  const bounded = Math.min(Math.max(typeof value === "number" ? value : 0, 0), max);
  const percent = max > 0 ? (bounded / max) * 100 : 0;
  return (
    <ProgressPrimitive.Root
      value={bounded}
      max={max}
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="bg-primary duration-normal ease-standard h-full w-full flex-1 rounded-full transition-transform motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
