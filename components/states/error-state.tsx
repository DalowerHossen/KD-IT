// path: components/states/error-state.tsx
"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  /** Correlation or digest identifier shown for support reference. */
  readonly reference?: string;
  /** Retry handler; the button shows a busy state while it runs. */
  readonly onRetry?: () => void | Promise<void>;
  readonly className?: string;
  readonly isRetrying?: boolean;
}

/** Friendly error block with retry, reference code, and one-click reporting. */
export function ErrorState({
  title = strings.states.error.title,
  description = strings.states.error.description,
  reference,
  onRetry,
  className,
  isRetrying = false,
}: ErrorStateProps): ReactElement {
  const reportHref = buildReportHref(reference);
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/30 bg-card flex w-full flex-col items-center gap-4 rounded-lg border p-8 text-center",
        className,
      )}
    >
      <div className="bg-destructive/10 flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="text-destructive size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-heading-sm font-semibold">{title}</h2>
        <p className="text-body-sm text-muted-foreground max-w-prose">{description}</p>
      </div>
      {reference === undefined ? null : (
        <p className="bg-muted text-body-sm text-muted-foreground rounded-md px-3 py-1.5 font-mono">
          {strings.states.error.correlationLabel}: {reference}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry === undefined ? null : (
          <Button onClick={() => void onRetry()} isLoading={isRetrying}>
            <RotateCcw aria-hidden="true" />
            {strings.actions.retry}
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href={reportHref}>{strings.actions.reportError}</a>
        </Button>
      </div>
    </div>
  );
}

function buildReportHref(reference?: string): string {
  const subject =
    reference === undefined
      ? strings.states.error.reportSubjectPrefix
      : `${strings.states.error.reportSubjectPrefix} ${reference}`;
  const body = [
    strings.states.error.reportBodyIntro,
    "",
    "",
    reference === undefined ? "" : `${strings.states.error.correlationLabel}: ${reference}`,
  ].join("\n");
  return `mailto:${siteConfig.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
