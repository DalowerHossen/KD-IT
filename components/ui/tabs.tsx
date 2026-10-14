// path: components/ui/tabs.tsx
"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>): ReactElement {
  return (
    <TabsPrimitive.List
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-11 items-center justify-center rounded-md p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>): ReactElement {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "text-body-sm focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex h-9 items-center justify-center rounded-sm px-3 py-1 font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>): ReactElement {
  return (
    <TabsPrimitive.Content
      className={cn(
        "focus-visible:ring-ring mt-4 focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
