// path: components/states/page-state.tsx
import type { ReactElement, ReactNode } from "react";

import { EmptyState, type EmptyStateProps } from "@/components/states/empty-state";
import { ErrorState, type ErrorStateProps } from "@/components/states/error-state";
import { LoadingState, type LoadingStateProps } from "@/components/states/loading-state";

export type PageStateProps =
  | { readonly state: "loading"; readonly loading?: Omit<LoadingStateProps, "className"> }
  | { readonly state: "error"; readonly error: Omit<ErrorStateProps, "className"> }
  | { readonly state: "empty"; readonly empty: Omit<EmptyStateProps, "className"> }
  | { readonly state: "ready"; readonly children: ReactNode };

/**
 * Single page-state switch so every screen renders a complete loading,
 * error, empty, or ready state through one consistent contract.
 */
export function PageState(props: PageStateProps): ReactElement {
  switch (props.state) {
    case "loading":
      return <LoadingState {...props.loading} />;
    case "error":
      return <ErrorState {...props.error} />;
    case "empty":
      return <EmptyState {...props.empty} />;
    case "ready":
      return <>{props.children}</>;
  }
}
