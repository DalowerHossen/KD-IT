// path: components/navigation/not-found-search.tsx
"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NAV_MAP } from "@/config/nav-map";
import { strings } from "@/lib/i18n/strings/en";
import { sanitizePlainText } from "@/lib/validation/sanitize";

/** 404 helper search: filters the real navigation map and links out. */
export function NotFoundSearch(): ReactElement {
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();
  const matches = NAV_MAP.filter(
    (entry) =>
      entry.showInNav &&
      (entry.title.toLowerCase().includes(normalized) ||
        entry.description.toLowerCase().includes(normalized) ||
        (entry.keywords ?? []).some((keyword) => keyword.includes(normalized))),
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-left">
        <Label htmlFor="not-found-search">{strings.notFound.searchLabel}</Label>
        <Input
          id="not-found-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(sanitizePlainText(event.target.value, 80))}
          placeholder={strings.notFound.searchPlaceholder}
          maxLength={80}
        />
      </div>
      {normalized.length > 0 ? (
        matches.length > 0 ? (
          <ul className="flex w-full flex-col gap-2 text-left">
            {matches.map((entry) => (
              <li key={entry.path}>
                <Link
                  href={entry.path}
                  prefetch={false}
                  className="bg-card hover:bg-accent focus-visible:ring-ring block rounded-md border px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="text-body-md block font-medium">{entry.title}</span>
                  <span className="text-body-sm text-muted-foreground block">{entry.path}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title={strings.notFound.noResults} />
        )
      ) : null}
    </div>
  );
}
