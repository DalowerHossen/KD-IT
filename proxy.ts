// path: proxy.ts
import { NextResponse, type NextRequest } from "next/server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";

import {
  CORRELATION_ID_HEADER,
  NONCE_HEADER,
  createCorrelationId,
  isValidCorrelationId,
} from "@/lib/logging/correlation";

/** Builds the nonce-based Content Security Policy for the response. */
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

/**
 * Request proxy (Next.js 16 successor to middleware). Runs before rendering:
 * generates the per-request CSP nonce and correlation identifier, refreshes
 * the Supabase cookie session, guards the account surface behind sign-in,
 * and propagates correlation to both the downstream render and the response.
 *
 * Step 03 substep B session posture: public pages fail open when the
 * provider is unreachable (the session simply does not refresh), while
 * /account fails closed to sign-in whenever no provider user resolves.
 * Reads public env directly so a misconfigured provider degrades to the
 * sign-in redirect instead of faulting every page.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
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

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let authenticatedUserId: string | null = null;
  if (supabaseUrl !== undefined && supabaseAnonKey !== undefined) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
            pendingCookies.push(cookie);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
        },
      },
    });
    try {
      authenticatedUserId = (await supabase.auth.getUser()).data.user?.id ?? null;
    } catch {
      authenticatedUserId = null;
    }
  }

  // Substep B/D session posture: the account and the 2FA/security surfaces
  // fail closed to sign-in whenever no provider user resolves.
  const protectedPrefix = ["/account", "/mfa", "/security"].find((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );
  if (protectedPrefix !== undefined && authenticatedUserId === null) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of pendingCookies) {
      redirect.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    redirect.headers.set("Content-Security-Policy", contentSecurityPolicy);
    redirect.headers.set(CORRELATION_ID_HEADER, correlationId);
    return redirect;
  }

  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
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
