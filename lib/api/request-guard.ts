// path: lib/api/request-guard.ts
import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";

import { getPublicEnv } from "@/lib/config/public-env";
import { BadRequestError, ForbiddenError, ValidationError } from "@/lib/errors/app-errors";
import {
  CORRELATION_ID_HEADER,
  createCorrelationId,
  isValidCorrelationId,
} from "@/lib/logging/correlation";

/** Correlation id for a route handler: inbound when valid, else minted. */
export function requestCorrelationId(request: NextRequest): string {
  const incoming = request.headers.get(CORRELATION_ID_HEADER);
  return isValidCorrelationId(incoming) ? incoming : createCorrelationId();
}

/**
 * Same-origin guard for cookie-authenticated browser mutations. Requests
 * carrying an Origin or Referer must match the configured application
 * origin; callers without either header (non-browser clients) pass
 * through. Combined with HttpOnly, Secure, SameSite cookies this stops
 * cross-site request forgery without a double-submit token round trip.
 */
export function assertSameOrigin(request: NextRequest): void {
  const appOrigin = new URL(getPublicEnv().appUrl).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ForbiddenError("Request origin is not allowed.");
    }
    if (parsed.origin !== appOrigin) {
      throw new ForbiddenError("Request origin is not allowed.");
    }
    return;
  }
  const referer = request.headers.get("referer");
  if (referer !== null) {
    let parsed: URL;
    try {
      parsed = new URL(referer);
    } catch {
      throw new ForbiddenError("Request origin is not allowed.");
    }
    if (parsed.origin !== appOrigin) {
      throw new ForbiddenError("Request origin is not allowed.");
    }
  }
}

/**
 * Reads a JSON body and validates it against a schema. Malformed JSON
 * and schema violations become 400 errors with field-level detail;
 * validated payloads flow straight into the flows.
 */
export async function parseJsonBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = (await request.json()) as unknown;
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError("Request validation failed.", {
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  return result.data;
}
