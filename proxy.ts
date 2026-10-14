// path: proxy.ts
import { NextResponse, type NextRequest } from "next/server";

import {
  CORRELATION_ID_HEADER,
  NONCE_HEADER,
  createCorrelationId,
  isValidCorrelationId,
} from "@/lib/logging/correlation";

/**
 * Request proxy (Next.js 16 successor to middleware). Runs before rendering:
 * generates the per-request CSP nonce and correlation identifier, attaches
 * the nonce-based Content Security Policy, and propagates correlation to
 * both the downstream render and the response.
 */
function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  /**
   * Nonces cannot unlock style ATTRIBUTES, only <style>/<link> elements.
   * React style props (Progress translate, chart legend swatches, motion
   * initial states) render as style attributes, so 'unsafe-inline' is kept
   * alongside the nonce: nonce-aware browsers ignore it for elements (the
   * nonce governs those) while it continues to permit attributes.
   */
  const styleSources = ["'self'", `'nonce-${nonce}'`, "'unsafe-inline'"];
  const connectSources = ["'self'", ...(isDevelopment ? ["ws:", "wss:"] : [])];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `style-src ${styleSources.join(" ")}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDevelopment) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const incomingCorrelationId = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = isValidCorrelationId(incomingCorrelationId)
    ? incomingCorrelationId
    : createCorrelationId();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CORRELATION_ID_HEADER, correlationId);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|design-tokens.json).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
