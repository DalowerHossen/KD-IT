// path: app/error.tsx
"use client";

import type { ReactElement } from "react";

import { ErrorState } from "@/components/states/error-state";
import { Logo } from "@/components/brand/logo";

export interface RouteErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

/** Route segment error boundary with retry and one-click reporting. */
export default function RouteError({ error, reset }: RouteErrorProps): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16">
      <Logo />
      <div className="w-full max-w-xl">
        <ErrorState
          {...(error.digest === undefined ? {} : { reference: error.digest })}
          onRetry={() => reset()}
        />
      </div>
    </div>
  );
}
