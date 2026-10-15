// path: components/design-system/state-demos.tsx
"use client";

import { useState, type ReactElement } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/i18n/strings/en";

type DemoPhase = "loading" | "error" | "empty" | "ready";

/** Cycles through every page state to prove loading, error, empty, ready. */
export function PageStateDemo(): ReactElement {
  const [phase, setPhase] = useState<DemoPhase>("ready");
  const [retrying, setRetrying] = useState(false);

  const runSequence = (): void => {
    setPhase("loading");
    window.setTimeout(() => setPhase("error"), 700);
  };

  const retry = (): void => {
    setRetrying(true);
    window.setTimeout(() => {
      setRetrying(false);
      setPhase("ready");
    }, 700);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={runSequence}>
          Simulate failing request
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPhase("empty")}>
          Show empty state
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPhase("ready")}>
          Show ready state
        </Button>
      </div>
      {phase === "loading" ? <LoadingState /> : null}
      {phase === "error" ? (
        <ErrorState
          title={strings.designSystem.errorDemo.title}
          description={strings.designSystem.errorDemo.description}
          reference="demo-correlation-id"
          onRetry={retry}
          isRetrying={retrying}
        />
      ) : null}
      {phase === "empty" ? (
        <EmptyState
          action={
            <Button size="sm" onClick={() => setPhase("ready")}>
              Restore content
            </Button>
          }
        />
      ) : null}
      {phase === "ready" ? (
        <p className="bg-card text-body-sm text-muted-foreground rounded-lg border p-6">
          {strings.designSystem.errorDemo.recoveredLabel}
        </p>
      ) : null}
      <EmptyState
        className="lg:hidden"
        compact
        title="Static empty example"
        description="Compact variant used in dense regions."
      />
    </div>
  );
}
