// path: components/design-system/token-section.tsx
import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

/** Renders the full token system directly from config/design-tokens.ts. */
export function TokenSections(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-heading-sm mb-3 font-semibold">
          {strings.designSystem.sections.colors}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {colorTokens.map((token) => (
            <div key={token} className="flex flex-col gap-2">
              <div
                className="h-14 rounded-md border shadow-sm"
                style={{ backgroundColor: `hsl(var(--${token}))` }}
                aria-hidden="true"
              />
              <div className="flex flex-col">
                <span className="text-body-sm font-medium">{token}</span>
                <code className="text-caption text-muted-foreground">--{token}</code>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-heading-sm mb-3 font-semibold">
          {strings.designSystem.sections.typography}
        </h3>
        <Card>
          <CardContent className="flex flex-col divide-y p-0">
            {typographyScale.map((entry) => (
              <div
                key={entry.token}
                className="flex flex-wrap items-baseline justify-between gap-3 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="text-caption text-muted-foreground font-mono">
                    {entry.token} / {entry.size} / {entry.weight}
                  </p>
                  <p
                    style={{ fontSize: entry.size, lineHeight: entry.lineHeight }}
                    className="truncate font-semibold"
                  >
                    The quick brown fox
                  </p>
                </div>
                <p className="text-body-sm text-muted-foreground">{entry.usage}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-sm mb-3 font-semibold">
          {strings.designSystem.sections.spacing}
        </h3>
        <div className="flex flex-wrap items-end gap-4">
          {spacingScale.map((px) => (
            <div key={px} className="flex flex-col items-center gap-1.5">
              <div
                className="bg-primary/80 rounded-sm"
                style={{ width: px, height: px }}
                aria-hidden="true"
              />
              <span className="text-caption text-muted-foreground">{px}px</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-heading-sm mb-3 font-semibold">
            {strings.designSystem.sections.radius}
          </h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(radiusScale).map(([token, value]) => (
              <div key={token} className="flex flex-col items-center gap-1.5">
                <div
                  className="border-primary bg-primary/10 size-16 border-2"
                  style={{ borderRadius: value }}
                  aria-hidden="true"
                />
                <span className="text-caption text-muted-foreground">
                  {token} ({value})
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-heading-sm mb-3 font-semibold">
            {strings.designSystem.sections.shadow}
          </h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(shadowScale).map(([token, value]) => (
              <div key={token} className="flex flex-col items-center gap-1.5">
                <div
                  className="bg-card size-16 rounded-md border"
                  style={{ boxShadow: value }}
                  aria-hidden="true"
                />
                <span className="text-caption text-muted-foreground">{token}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-heading-sm mb-3 font-semibold">
            {strings.designSystem.sections.elevation}
          </h3>
          <TokenTable
            caption="Z-index scale"
            headers={["Token", "Value"]}
            rows={Object.entries(zIndexScale).map(([token, value]) => [token, String(value)])}
          />
        </div>
        <div>
          <h3 className="text-heading-sm mb-3 font-semibold">
            {strings.designSystem.sections.motionTokens}
          </h3>
          <TokenTable
            caption="Motion durations"
            headers={["Token", "Value"]}
            rows={Object.entries(motionDurations).map(([token, value]) => [token, value])}
          />
          <div className="h-4" />
          <TokenTable
            caption="Motion easings"
            headers={["Token", "Value"]}
            rows={Object.entries(motionEasings).map(([token, value]) => [token, value])}
          />
        </div>
      </div>
    </div>
  );
}

function TokenTable({
  caption,
  headers,
  rows,
}: {
  readonly caption: string;
  readonly headers: readonly [string, string];
  readonly rows: readonly (readonly [string, string])[];
}): ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{headers[0]}</TableHead>
          <TableHead>{headers[1]}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([token, value]) => (
          <TableRow key={`${caption}-${token}`}>
            <TableCell className="font-medium">{token}</TableCell>
            <TableCell>
              <code className="text-caption">{value}</code>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <caption className="sr-only">{caption}</caption>
    </Table>
  );
}
