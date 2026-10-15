// path: config/keyboard-shortcuts.ts
import { strings } from "@/lib/i18n/strings/en";

export interface KeyboardShortcut {
  readonly id: string;
  readonly label: string;
  /** Human-readable key combos, e.g. ["Ctrl", "K"]. */
  readonly keys: readonly string[];
}

/**
 * Global keyboard shortcut reference. Rendered by the shortcuts dialog and
 * enforced by the components that implement each binding.
 */
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  {
    id: "open-command-palette",
    label: strings.shortcuts.openPaletteLabel,
    keys: ["Ctrl", "K"],
  },
  {
    id: "open-shortcut-reference",
    label: strings.shortcuts.openShortcutsLabel,
    keys: ["Shift", "?"],
  },
  {
    id: "dismiss-overlay",
    label: strings.shortcuts.dismissLabel,
    keys: ["Escape"],
  },
  {
    id: "navigate-focus",
    label: strings.shortcuts.navigationLabel,
    keys: ["Tab"],
  },
  {
    id: "activate-element",
    label: strings.shortcuts.activateLabel,
    keys: ["Enter"],
  },
];
