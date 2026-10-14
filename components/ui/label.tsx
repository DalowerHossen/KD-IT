// path: components/ui/label.tsx
"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): ReactElement {
  return (
    <LabelPrimitive.Root
      className={cn(
        "text-body-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
