// path: lib/auth/request-ip.ts
import "server-only";

import { isIP } from "node:net";

/**
 * Caller IP resolution for session signals. Reads the leftmost valid entry
 * of X-Forwarded-For, then X-Real-IP. This contract covers direct and
 * single-proxy deployments; Step 03 substep E adds approved-proxy
 * validation, allowlists, and network-risk enforcement on top of it.
 */

/** Leftmost valid IP in a forwarded-for chain, or null. */
export function firstForwardedIp(headerValue: string | null): string | null {
  if (headerValue === null) {
    return null;
  }
  const first = headerValue.split(",")[0];
  if (first === undefined) {
    return null;
  }
  const candidate = first.trim().replace(/^\[|\]$/g, "");
  if (candidate === "" || isIP(candidate) === 0) {
    return null;
  }
  return candidate;
}

/** Best-effort caller IP from request headers, or null when absent. */
export function requestIpFromHeaders(headers: Headers): string | null {
  const forwarded = firstForwardedIp(headers.get("x-forwarded-for"));
  if (forwarded !== null) {
    return forwarded;
  }
  const real = headers.get("x-real-ip");
  if (real !== null) {
    const candidate = real.trim().replace(/^\[|\]$/g, "");
    if (candidate !== "" && isIP(candidate) !== 0) {
      return candidate;
    }
  }
  return null;
}
