// path: components/design-system/data-display-section.tsx
"use client";

import { useMemo, useState, type ReactElement } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { spacingScale } from "@/config/design-tokens";
import { strings } from "@/lib/i18n/strings/en";

const PAGE_SIZE = 5;

interface SpacingRow {
  readonly token: string;
  readonly pixels: number;
  readonly rem: string;
}

const SPACING_ROWS: readonly SpacingRow[] = spacingScale.map((px) => ({
  token: `space-${px}`,
  pixels: px,
  rem: `${px / 16}rem`,
}));

/** Token table with text filter, pagination, and a tab-based layout variant. */
export function DataDisplaySection(): ReactElement {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return SPACING_ROWS.filter((row) => row.token.includes(query));
  }, [filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const applyFilter = (value: string): void => {
    setFilter(value);
    setPage(1);
  };

  const table = (
    <Table>
      <TableCaption>{strings.designSystem.tableDemo.caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{strings.designSystem.tableDemo.tokenColumn}</TableHead>
          <TableHead>{strings.designSystem.tableDemo.pixelsColumn}</TableHead>
          <TableHead>{strings.designSystem.tableDemo.remColumn}</TableHead>
          <TableHead>{strings.designSystem.tableDemo.exampleColumn}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleRows.map((row) => (
          <TableRow key={row.token}>
            <TableCell className="font-medium">{row.token}</TableCell>
            <TableCell>{row.pixels}px</TableCell>
            <TableCell>
              <code className="text-caption">{row.rem}</code>
            </TableCell>
            <TableCell>
              <span
                className="bg-primary/80 inline-block rounded-sm"
                style={{ width: row.pixels, height: 12 }}
                aria-hidden="true"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <Label htmlFor="token-filter">{strings.designSystem.tableDemo.filterLabel}</Label>
        <Input
          id="token-filter"
          value={filter}
          onChange={(event) => applyFilter(event.target.value)}
          placeholder={strings.designSystem.tableDemo.filterPlaceholder}
          className="mt-1.5"
          maxLength={40}
        />
      </div>
      {visibleRows.length === 0 ? (
        <EmptyState
          compact
          title={strings.states.emptyFiltered.title}
          description={strings.states.emptyFiltered.description}
          action={
            <Button variant="outline" size="sm" onClick={() => applyFilter("")}>
              {strings.actions.clear}
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="grid">Grid</TabsTrigger>
          </TabsList>
          <TabsContent value="table">{table}</TabsContent>
          <TabsContent value="grid">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRows.map((row) => (
                <div key={row.token} className="bg-card rounded-lg border p-4">
                  <p className="text-body-sm font-medium">{row.token}</p>
                  <p className="text-caption text-muted-foreground">
                    {row.pixels}px / {row.rem}
                  </p>
                  <span
                    className="bg-primary/80 mt-2 inline-block rounded-sm"
                    style={{ width: row.pixels, height: 12 }}
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
      {filteredRows.length > PAGE_SIZE ? (
        <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
      ) : null}
    </div>
  );
}
