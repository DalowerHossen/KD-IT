// path: components/navigation/shortcut-reference.tsx
"use client";

import { useEffect, useState, type ReactElement } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KEYBOARD_SHORTCUTS } from "@/config/keyboard-shortcuts";
import { strings } from "@/lib/i18n/strings/en";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

/** Keyboard shortcut catalog opened globally with the Shift+? combination. */
export function ShortcutReference(): ReactElement {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === "?" || (event.shiftKey && event.key === "?")) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-label={strings.shortcuts.title}>
        <DialogHeader>
          <DialogTitle>{strings.shortcuts.title}</DialogTitle>
          <DialogDescription>{strings.shortcuts.description}</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead className="w-40">Keys</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <TableRow key={shortcut.id}>
                <TableCell>{shortcut.label}</TableCell>
                <TableCell>
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={key}
                      className="bg-muted text-caption mr-1 inline-flex min-w-7 items-center justify-center rounded border px-1.5 py-0.5 font-mono"
                    >
                      {key}
                    </kbd>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
