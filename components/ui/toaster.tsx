// path: components/ui/toaster.tsx
"use client";

import type { ReactElement } from "react";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

/** Centralized toast outlet mounted once in the root layout. */
export function Toaster(): ReactElement {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right" duration={5000}>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid flex-1 gap-1">
            {title === undefined ? null : <ToastTitle>{title}</ToastTitle>}
            {description === undefined ? null : <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
