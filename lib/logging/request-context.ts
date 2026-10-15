// path: lib/logging/request-context.ts
import "server-only";

import { headers } from "next/headers";

import { CORRELATION_ID_HEADER, NONCE_HEADER } from "@/lib/logging/correlation";

const UNTRACKED_REQUEST_ID = "untracked-request";

/** Reads the correlation identifier attached to the current request by proxy. */
export async function getRequestCorrelationId(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get(CORRELATION_ID_HEADER) ?? UNTRACKED_REQUEST_ID;
}

/** Reads the per-request CSP nonce attached by proxy.ts, when present. */
export async function getRequestNonce(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get(NONCE_HEADER);
}
