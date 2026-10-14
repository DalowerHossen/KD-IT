// path: components/navigation/command-trigger.tsx
"use client";

import { Search } from "lucide-react";
import { useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/navigation/command-palette";
import { strings } from "@/lib/i18n/strings/en";

/** Search-style trigger button that opens the global command palette. */
export function CommandTrigger(): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={strings.actions.openCommandPalette}
        aria-keyshortcuts="Control+K Meta+K"
        className="text-muted-foreground w-40 justify-start gap-2 shadow-none sm:w-56"
      >
        <Search aria-hidden="true" />
        <span className="hidden truncate sm:inline">{strings.commandPalette.triggerLabel}</span>
        <kbd className="bg-muted text-caption text-muted-foreground ml-auto hidden rounded border px-1.5 font-mono sm:inline">
          Ctrl K
        </kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
