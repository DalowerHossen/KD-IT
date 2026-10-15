// path: components/ui/command.tsx
"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

export function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>): ReactElement {
  return (
    <CommandPrimitive
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-lg",
        className,
      )}
      {...props}
    />
  );
}

export interface CommandDialogProps extends ComponentProps<typeof Dialog> {
  /** Accessible label announced for the dialog content. */
  readonly label: string;
}

export function CommandDialog({ label, children, ...props }: CommandDialogProps): ReactElement {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0" aria-label={label}>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <Command className="[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>): ReactElement {
  return (
    <div className="flex items-center gap-2 border-b px-3" cmdk-input-wrapper="">
      <Search className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <CommandPrimitive.Input
        className={cn(
          "text-body-md placeholder:text-muted-foreground flex h-12 w-full rounded-md bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>): ReactElement {
  return (
    <CommandPrimitive.List
      className={cn("max-h-80 overflow-x-hidden overflow-y-auto p-1", className)}
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>): ReactElement {
  return (
    <CommandPrimitive.Empty
      className={cn("text-body-sm text-muted-foreground py-6 text-center", className)}
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>): ReactElement {
  return (
    <CommandPrimitive.Group
      className={cn("text-foreground overflow-hidden p-1", className)}
      {...props}
    />
  );
}

export function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>): ReactElement {
  return (
    <CommandPrimitive.Separator className={cn("bg-border -mx-1 my-1 h-px", className)} {...props} />
  );
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>): ReactElement {
  return (
    <CommandPrimitive.Item
      className={cn(
        "text-body-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground relative flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      className={cn("text-caption text-muted-foreground ml-auto tracking-widest", className)}
      {...props}
    />
  );
}
