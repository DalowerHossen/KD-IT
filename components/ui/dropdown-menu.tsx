// path: components/ui/dropdown-menu.tsx
"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>): ReactElement {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 z-50 min-w-44 overflow-hidden rounded-md border p-1 shadow-md motion-reduce:animate-none",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  readonly inset?: boolean;
}): ReactElement {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "text-body-sm focus:bg-accent focus:text-accent-foreground relative flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 py-2 transition-colors outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 sm:min-h-9 sm:py-1.5 [&_svg]:size-4 [&_svg]:shrink-0",
        inset === true && "pl-8",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>): ReactElement {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("text-caption text-muted-foreground px-2 py-1.5 font-semibold", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>): ReactElement {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export function DropdownMenuShortcut({
  className,
  ...props
}: ComponentProps<"span">): ReactElement {
  return (
    <span
      className={cn("text-caption text-muted-foreground ml-auto tracking-widest", className)}
      {...props}
    />
  );
}
