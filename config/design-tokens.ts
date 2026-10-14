// path: config/design-tokens.ts

/**
 * Single source of truth for the KD SOLUTION IT design system.
 *
 * the CSS-first theme in styles/globals.css mirrors these tokens, and the design system
 * reference page renders them, and scripts/export-design-tokens.mjs serializes
 * them to JSON. Later steps extend this file instead of duplicating scales.
 */

export const breakpoints = {
  xs: 375,
  sm: 430,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1920,
} as const;

export type BreakpointToken = keyof typeof breakpoints;

/** Base layout width is 320px (mobile-first, below the smallest breakpoint). */
export const minimumViewportWidth = 320;

export const spacingScale = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const radiusScale = {
  none: "0px",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  full: "9999px",
} as const;

export type RadiusToken = keyof typeof radiusScale;

export const shadowScale = {
  sm: "0 1px 2px 0 rgb(15 23 42 / 0.06)",
  md: "0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.08)",
  lg: "0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)",
  xl: "0 20px 25px -5px rgb(15 23 42 / 0.1), 0 8px 10px -6px rgb(15 23 42 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(15 23 42 / 0.25)",
} as const;

export type ShadowToken = keyof typeof shadowScale;

export const zIndexScale = {
  base: 0,
  raised: 10,
  sticky: 20,
  header: 30,
  overlay: 40,
  drawer: 50,
  modal: 60,
  popover: 70,
  toast: 80,
  tooltip: 90,
} as const;

export type ZIndexToken = keyof typeof zIndexScale;

export const motionDurations = {
  instant: "75ms",
  fast: "150ms",
  normal: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

export type MotionDurationToken = keyof typeof motionDurations;

export const motionEasings = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1.1)",
  entrance: "cubic-bezier(0, 0, 0.2, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export type MotionEasingToken = keyof typeof motionEasings;

/**
 * Semantic color tokens. Values are HSL channel triplets consumed by
 * styles/globals.css @theme as hsl(var(--token)) and defined in :root there
 * for light, dark, and high-contrast themes.
 */
export const colorTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
  "border",
  "input",
  "ring",
  "brand",
  "brand-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export type ColorToken = (typeof colorTokens)[number];

export const typographyScale = [
  { token: "display-2xl", size: "3.5rem", lineHeight: "1.1", weight: 700, usage: "Hero headings" },
  { token: "display-xl", size: "2.75rem", lineHeight: "1.15", weight: 700, usage: "Page heroes" },
  { token: "heading-lg", size: "1.875rem", lineHeight: "1.25", weight: 700, usage: "Page titles" },
  { token: "heading-md", size: "1.5rem", lineHeight: "1.3", weight: 600, usage: "Section titles" },
  { token: "heading-sm", size: "1.25rem", lineHeight: "1.4", weight: 600, usage: "Card titles" },
  { token: "body-lg", size: "1.125rem", lineHeight: "1.65", weight: 400, usage: "Lead paragraphs" },
  { token: "body-md", size: "1rem", lineHeight: "1.65", weight: 400, usage: "Default body text" },
  { token: "body-sm", size: "0.875rem", lineHeight: "1.6", weight: 400, usage: "Dense UI text" },
  {
    token: "caption",
    size: "0.75rem",
    lineHeight: "1.5",
    weight: 500,
    usage: "Labels and captions",
  },
] as const;

export type TypographyToken = (typeof typographyScale)[number]["token"];

export const layoutTokens = {
  sidebarExpandedWidth: "264px",
  sidebarCollapsedWidth: "72px",
  topbarHeight: "64px",
  contentMaxWidth: "1280px",
  formMaxWidth: "768px",
} as const;

export type LayoutToken = keyof typeof layoutTokens;

export const minimumTouchTargetPx = 44;
