// path: components/ui/separator.tsx
"use client";

import * as SeparatorPrimitive from "@radix-ui/react-separator";
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>): ReactElement {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
