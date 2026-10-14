// path: components/design-system/chart-section.tsx
"use client";

import { useEffect, useState, type ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/charts/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  colorTokens,
  motionDurations,
  motionEasings,
  radiusScale,
  shadowScale,
  spacingScale,
  typographyScale,
  zIndexScale,
} from "@/config/design-tokens";
import { strings } from "@/lib/i18n/strings/en";

const chartConfig: ChartConfig = {
  tokens: { label: "Tokens", themeColor: "hsl(var(--chart-1))" },
};

const chartData = [
  { group: "Color", tokens: colorTokens.length },
  { group: "Type", tokens: typographyScale.length },
  { group: "Space", tokens: spacingScale.length },
  { group: "Radius", tokens: Object.keys(radiusScale).length },
  { group: "Shadow", tokens: Object.keys(shadowScale).length },
  { group: "Z-index", tokens: Object.keys(zIndexScale).length },
  {
    group: "Motion",
    tokens: Object.keys(motionDurations).length + Object.keys(motionEasings).length,
  },
];

/** Theme-aware bar chart computed from the design-token source of truth. */
export function ChartSection(): ReactElement {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.designSystem.chartDemo.title}</CardTitle>
        <CardDescription>{strings.designSystem.chartDemo.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="group"
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                borderColor: "hsl(var(--border))",
                borderRadius: "0.5rem",
                color: "hsl(var(--popover-foreground))",
                fontSize: "0.875rem",
              }}
            />
            <Bar
              dataKey="tokens"
              fill="var(--color-tokens)"
              radius={[6, 6, 0, 0]}
              isAnimationActive={!reducedMotion}
              aria-label={strings.designSystem.chartDemo.yAxisLabel}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
