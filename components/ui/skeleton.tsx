// path: components/ui/skeleton.tsx
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export function Skeleton({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-muted animate-pulse rounded-md motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
