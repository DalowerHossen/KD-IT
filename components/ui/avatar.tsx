// path: components/ui/avatar.tsx
"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

/** Derives up to two initials for the avatar fallback from a display name. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

export function Avatar({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Root>): ReactElement {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "border-border relative flex size-10 shrink-0 overflow-hidden rounded-full border",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  alt = "",
  ...props
}: ComponentProps<typeof AvatarPrimitive.Image>): ReactElement {
  return (
    <AvatarPrimitive.Image
      alt={alt}
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>): ReactElement {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "bg-muted text-body-sm flex size-full items-center justify-center rounded-full font-medium",
        className,
      )}
      {...props}
    />
  );
}
