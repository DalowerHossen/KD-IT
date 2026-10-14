// path: components/navigation/command-palette.tsx
"use client";

import { Copy, MoonStar } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactElement } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { toast } from "@/components/ui/use-toast";
import { NAV_MAP } from "@/config/nav-map";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";
import { sanitizePlainText } from "@/lib/validation/sanitize";

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Global command palette (Ctrl+K / Cmd+K). Searches the central navigation
 * map with fuzzy matching and offers safe global actions. The query is
 * capped and sanitized before matching.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): ReactElement {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [query, setQuery] = useState("");

  /** Event-driven query reset whenever the palette closes. */
  const handleOpenChange = useCallback(
    (next: boolean): void => {
      if (!next) {
        setQuery("");
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handleOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleOpenChange, open]);

  const navigate = useCallback(
    (path: string): void => {
      handleOpenChange(false);
      router.push(path);
    },
    [handleOpenChange, router],
  );

  const toggleTheme = useCallback((): void => {
    handleOpenChange(false);
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [handleOpenChange, resolvedTheme, setTheme]);

  const copySupportEmail = useCallback(async (): Promise<void> => {
    handleOpenChange(false);
    try {
      await navigator.clipboard.writeText(siteConfig.supportEmail);
      toast({ title: strings.commandPalette.copiedConfirmation, variant: "success" });
    } catch {
      toast({ title: strings.commandPalette.copyFailed, variant: "destructive" });
    }
  }, [handleOpenChange]);

  const visiblePages = NAV_MAP.filter((entry) => entry.showInNav);

  return (
    <CommandDialog
      label={strings.commandPalette.dialogLabel}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <CommandInput
        placeholder={strings.commandPalette.inputPlaceholder}
        value={query}
        onValueChange={(value) => setQuery(sanitizePlainText(value, 80))}
        maxLength={80}
      />
      <CommandList>
        <CommandEmpty>{strings.commandPalette.emptyResults}</CommandEmpty>
        <CommandGroup heading={strings.commandPalette.pagesGroup}>
          {visiblePages.map((entry) => {
            const Icon = entry.icon;
            return (
              <CommandItem
                key={entry.path}
                value={`${entry.title} ${entry.description} ${(entry.keywords ?? []).join(" ")}`}
                onSelect={() => navigate(entry.path)}
              >
                {Icon === undefined ? null : <Icon aria-hidden="true" />}
                <span>{entry.title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={strings.commandPalette.actionsGroup}>
          <CommandItem value={strings.commandPalette.toggleThemeAction} onSelect={toggleTheme}>
            <MoonStar aria-hidden="true" />
            <span>{strings.commandPalette.toggleThemeAction}</span>
          </CommandItem>
          <CommandItem
            value={strings.commandPalette.copySupportEmailAction}
            onSelect={() => void copySupportEmail()}
          >
            <Copy aria-hidden="true" />
            <span>{strings.commandPalette.copySupportEmailAction}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
