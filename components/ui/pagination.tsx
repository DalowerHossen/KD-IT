// path: components/ui/pagination.tsx
"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export interface PaginationProps {
  /** One-based current page. */
  readonly page: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
  readonly className?: string;
}

/** Builds the visible page window with ellipsis gaps around the current page. */
export function buildPageWindow(page: number, totalPages: number): readonly (number | "gap")[] {
  const total = Math.max(totalPages, 1);
  const current = Math.min(Math.max(page, 1), total);
  const candidates = new Set<number>([1, total, current - 1, current, current + 1]);
  const pages = [...candidates]
    .filter((entry) => entry >= 1 && entry <= total)
    .sort((a, b) => a - b);
  const window: (number | "gap")[] = [];
  let previous = 0;
  for (const entry of pages) {
    if (previous !== 0 && entry - previous > 1) {
      window.push("gap");
    }
    window.push(entry);
    previous = entry;
  }
  return window;
}

/** Numbered pagination with 44px targets and aria-current semantics. */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps): ReactElement {
  const total = Math.max(totalPages, 1);
  const current = Math.min(Math.max(page, 1), total);
  const windowPages = buildPageWindow(current, total);

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn("flex items-center gap-1", className)}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(current - 1)}
        disabled={current <= 1}
        aria-label={strings.actions.previous}
      >
        <ChevronLeft aria-hidden="true" />
        <span className="hidden sm:inline">{strings.actions.previous}</span>
      </Button>
      {windowPages.map((entry, index) =>
        entry === "gap" ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="text-muted-foreground flex size-9 items-center justify-center"
          >
            <MoreHorizontal className="size-4" />
          </span>
        ) : (
          <Button
            key={entry}
            variant={entry === current ? "default" : "ghost"}
            size="sm"
            onClick={() => onPageChange(entry)}
            aria-label={`Page ${entry}`}
            aria-current={entry === current ? "page" : undefined}
          >
            {entry}
          </Button>
        ),
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(current + 1)}
        disabled={current >= total}
        aria-label={strings.actions.next}
      >
        <span className="hidden sm:inline">{strings.actions.next}</span>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
