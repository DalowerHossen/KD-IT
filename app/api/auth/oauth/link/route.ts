// path: app/api/auth/oauth/link/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { oauthLinkRequestSchema } from "@/lib/auth/schemas";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { resolveSessionForRoute } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/config/public-env";
import { ExternalServiceError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Links an OAuth provider identity to the signed-in account. Requires a
 * fully authenticated (aal2) session: the caller is already who they claim
 * to be, so the new provider identity is attached to their account. Returns
 * the provider authorization URL; the provider redirects back to
 * /api/auth/callback?mode=oauth-link where the link is confirmed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, oauthLinkRequestSchema);
    const { client } = await resolveSessionForRoute(request, requestIpFromHeaders(request.headers));
    const appUrl = getPublicEnv().appUrl;
    const redirectTo = `${appUrl}/api/auth/callback?mode=oauth-link`;
    const { data, error } = await client.auth.linkIdentity({
      provider: input.provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error !== null || data === null || data.url === undefined) {
      throw new ExternalServiceError("Unable to link that account. Try again.");
    }
    return apiOk({ url: data.url }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
