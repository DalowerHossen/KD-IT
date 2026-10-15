// path: components/ui/toast.tsx
"use client";

import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";

import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export const ToastProvider = ToastPrimitives.Provider;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Viewport>): ReactElement {
  return (
    <ToastPrimitives.Viewport
      className={cn(
        "fixed right-0 bottom-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:top-auto sm:right-4 sm:bottom-4 sm:w-[420px] sm:max-w-[calc(100vw-2rem)]",
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full motion-reduce:transition-none motion-reduce:data-[state=open]:animate-none",
  {
    variants: {
      variant: {
        default: "border bg-card text-card-foreground",
        success: "border-success/40 bg-success text-success-foreground",
        destructive: "border-destructive/40 bg-destructive text-destructive-foreground",
        warning: "border-warning/40 bg-warning text-warning-foreground",
        info: "border-info/40 bg-info text-info-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ToastProps
  extends ComponentProps<typeof ToastPrimitives.Root>, VariantProps<typeof toastVariants> {}

export function Toast({ className, variant, ...props }: ToastProps): ReactElement {
  return <ToastPrimitives.Root className={cn(toastVariants({ variant }), className)} {...props} />;
}

export function ToastAction({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Action>): ReactElement {
  return (
    <ToastPrimitives.Action
      className={cn(
        "text-body-sm hover:bg-background/10 focus:ring-ring inline-flex h-9 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 font-medium transition-colors focus:ring-2 focus:outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function ToastClose(props: ComponentProps<typeof ToastPrimitives.Close>): ReactElement {
  return (
    <ToastPrimitives.Close
      aria-label={strings.actions.close}
      className="focus:ring-ring absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:outline-none"
      toast-close=""
      {...props}
    >
      <X className="size-4" aria-hidden="true" />
    </ToastPrimitives.Close>
  );
}

export function ToastTitle({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Title>): ReactElement {
  return (
    <ToastPrimitives.Title
      className={cn("text-body-sm leading-tight font-semibold", className)}
      {...props}
    />
  );
}

export function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Description>): ReactElement {
  return (
    <ToastPrimitives.Description className={cn("text-body-sm opacity-90", className)} {...props} />
  );
}

export type ToastActionElement = ReactElement<typeof ToastAction>;
