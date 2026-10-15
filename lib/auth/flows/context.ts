// path: lib/auth/flows/context.ts
import "server-only";

import type { NextRequest } from "next/server";

import { requestIpFromHeaders } from "@/lib/auth/request-ip";

/**
 * Request signals shared by every authentication flow. Routes build this
 * once from the request (correlation id, resolved caller IP, raw user
 * agent); flows hash or drop what they must not persist.
 */
export interface AuthFlowRequest {
  readonly correlationId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/** Builds the shared flow request from a route request and correlation id. */
export function buildFlowRequest(request: NextRequest, correlationId: string): AuthFlowRequest {
  return {
    correlationId,
    ipAddress: requestIpFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent"),
  };
}
