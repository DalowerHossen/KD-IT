// path: app/api/auth/oauth/signin/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { buildFlowRequest } from "@/lib/auth/flows/context";
import { oauthSignInRequestSchema } from "@/lib/auth/schemas";
import { createRouteHandlerClient } from "@/lib/auth/server-auth";
import { getPublicEnv } from "@/lib/config/public-env";
import { ExternalServiceError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Initiates OAuth sign-in for a configured provider and returns the provider
 * authorization URL. The client navigates the browser to that URL; the
 * provider redirects back to /api/auth/callback?mode=oauth where the PKCE
 * code is exchanged and the session mirror is established.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, oauthSignInRequestSchema);
    const client = await createRouteHandlerClient();
    const appUrl = getPublicEnv().appUrl;
    const next = input.next ?? "/account";
    const redirectTo = `${appUrl}/api/auth/callback?mode=oauth&next=${encodeURIComponent(next)}`;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: input.provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error !== null || data === null || data.url === undefined) {
      throw new ExternalServiceError("Unable to start sign-in. Try again.");
    }
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.oauthSigninInitiated,
      resourceType: "auth_oauth",
      ipAddress: buildFlowRequest(request, correlationId).ipAddress,
      userAgent: request.headers.get("user-agent"),
      correlationId,
      metadata: { provider: input.provider },
    });
    return apiOk({ url: data.url }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
