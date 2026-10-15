// path: components/charts/chart.tsx
"use client";

import type { CSSProperties, ComponentProps, ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils/cn";

/**
 * Themed chart container. Series colors are declared through a typed config
 * that feeds CSS variables, keeping charts consistent in light, dark, and
 * high-contrast themes. Animations are disabled under reduced-motion.
 */
export interface ChartSeriesConfig {
  readonly label: string;
  readonly color?: string;
  /** Theme-aware color as a CSS variable, e.g. "hsl(var(--chart-1))". */
  readonly themeColor?: string;
}

export type ChartConfig = Record<string, ChartSeriesConfig>;

export interface ChartContainerProps extends Omit<ComponentProps<"div">, "children"> {
  readonly config: ChartConfig;
  readonly children: ReactNode;
}

function configToStyle(config: ChartConfig): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, series] of Object.entries(config)) {
    if (series.color !== undefined) {
      style[`--color-${key}`] = series.color;
    } else if (series.themeColor !== undefined) {
      style[`--color-${key}`] = series.themeColor;
    }
  }
  return style as CSSProperties;
}

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: ChartContainerProps): ReactElement {
  return (
    <div
      data-chart-container=""
      style={configToStyle(config)}
      className={cn(
        "text-caption [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-tooltip-cursor]:fill-muted/40 flex aspect-video w-full items-center justify-center",
        className,
      )}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export interface ChartLegendItem {
  readonly dataKey: string;
  readonly color: string;
}

/** Compact legend row rendered above or below a chart. */
export function ChartLegend({
  items,
  className,
}: {
  readonly items: readonly ChartLegendItem[];
  readonly className?: string;
}): ReactElement {
  return (
    <ul className={cn("text-body-sm flex flex-wrap items-center gap-3", className)}>
      {items.map((item) => (
        <li key={item.dataKey} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.dataKey}</span>
        </li>
      ))}
    </ul>
  );
}
