// path: components/theme/theme-toggle.tsx
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/lib/i18n/strings/en";

const themeOptions = [
  { value: "light", label: strings.actions.themeLight, icon: Sun },
  { value: "dark", label: strings.actions.themeDark, icon: Moon },
  { value: "system", label: strings.actions.themeSystem, icon: Monitor },
] as const;

const emptySubscribe = (): (() => void) => () => undefined;

/** Light, dark, and system theme menu with a hydration-safe placeholder. */
export function ThemeToggle(): ReactElement {
  const { setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return <Skeleton className="size-11 rounded-md" aria-hidden="true" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={strings.actions.toggleTheme}>
          <Sun
            className="scale-100 transition-transform motion-reduce:transition-none dark:scale-0"
            aria-hidden="true"
          />
          <Moon
            className="absolute scale-0 transition-transform motion-reduce:transition-none dark:scale-100"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            aria-pressed={theme === option.value}
          >
            <option.icon aria-hidden="true" />
            {option.label}
            {theme === option.value ? <span className="sr-only"> (active)</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
