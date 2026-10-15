// path: app/loading.tsx
import type { ReactElement } from "react";

import { LoadingState } from "@/components/states/loading-state";

/** Route-level branded loading fallback. */
export default function Loading(): ReactElement {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <LoadingState rows={4} />
    </div>
  );
}
