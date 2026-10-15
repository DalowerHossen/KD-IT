// path: components/ui/use-toast.ts
"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY_MS = 5000;

export interface ToasterToast extends Omit<ToastProps, "title" | "description"> {
  readonly id: string;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ToastActionElement;
}

type ToastInput = Omit<ToasterToast, "id">;

interface ToastState {
  readonly toasts: readonly ToasterToast[];
}

const listeners = new Set<(state: ToastState) => void>();
let memoryState: ToastState = { toasts: [] };
let count = 0;

function nextId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return `toast-${count}`;
}

function emit(): void {
  for (const listener of listeners) {
    listener(memoryState);
  }
}

function removeToast(toastId: string): void {
  memoryState = { toasts: memoryState.toasts.filter((toast) => toast.id !== toastId) };
  emit();
}

function addToast(props: ToastInput): string {
  const id = nextId();
  const toast: ToasterToast = {
    ...props,
    id,
    onOpenChange: (open: boolean) => {
      if (!open) {
        removeToast(id);
      }
    },
  };
  memoryState = { toasts: [toast, ...memoryState.toasts].slice(0, TOAST_LIMIT) };
  emit();
  return id;
}

function subscribe(listener: (state: ToastState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastState {
  return memoryState;
}

/** Imperative toast entry point used by client code. */
export function toast(props: ToastInput): { readonly id: string; readonly dismiss: () => void } {
  const id = addToast(props);
  return { id, dismiss: () => removeToast(id) };
}

export function useToast(): {
  readonly toasts: readonly ToasterToast[];
  readonly toast: typeof toast;
  readonly dismiss: (toastId: string) => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const timers = state.toasts.map((toastEntry) =>
      window.setTimeout(() => removeToast(toastEntry.id), TOAST_REMOVE_DELAY_MS),
    );
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [state.toasts]);

  return { toasts: state.toasts, toast, dismiss: removeToast };
}
