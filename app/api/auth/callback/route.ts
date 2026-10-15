// path: app/api/auth/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";

import { requestCorrelationId } from "@/lib/api/request-guard";
import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { establishSessionMirror } from "@/lib/auth/flows/login";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { authCallbackQuerySchema } from "@/lib/auth/schemas";
import {
  createRouteHandlerClient,
  exchangeCodeForSession,
  signOutCurrentSession,
  verifyEmailLink,
} from "@/lib/auth/server-auth";
import { resolveSession } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/config/public-env";
import {
  createProfile,
  getOwnProfile,
  transitionProfileStatus,
} from "@/lib/db/repositories/profiles";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";
import { CORRELATION_ID_HEADER } from "@/lib/logging/correlation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pickParam(search: URLSearchParams, key: string): string | undefined {
  const value = search.get(key);
  return value === null ? undefined : value;
}

function redirectWithCorrelation(
  target: string,
  appUrl: string,
  correlationId: string,
): NextResponse {
  return NextResponse.redirect(new URL(target, appUrl), {
    status: 303,
    headers: { [CORRELATION_ID_HEADER]: correlationId },
  });
}

/**
 * Email-link landing for verification and recovery links. Exchanges the
 * link for a provider session, transitions verified accounts toward
 * approval, and redirects onward. Every failure shares one generic
 * invalid-link landing so link validity can never be probed.
 *
 * Re-clicks while signed in skip the exchange for verification landings:
 * exchanging would overwrite the live cookie session with an unmirrored
 * one and sign the user out. Credential-establishing links (recovery,
 * codes) always exchange.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  const appUrl = getPublicEnv().appUrl;
  const fail = (target = "/login?error=invalid-link"): NextResponse =>
    redirectWithCorrelation(target, appUrl, correlationId);
  try {
    const search = request.nextUrl.searchParams;
    const params = authCallbackQuerySchema.parse({
      code: pickParam(search, "code"),
      token_hash: pickParam(search, "token_hash"),
      type: pickParam(search, "type"),
      next: pickParam(search, "next"),
    });
    const next =
      params.next ?? (params.type === "recovery" ? "/reset-password" : "/verify-email?verified=1");

    const client = await createRouteHandlerClient();
    const ipAddress = requestIpFromHeaders(request.headers);
    if (next.startsWith("/verify-email")) {
      try {
        await resolveSession({
          client,
          headers: request.headers,
          correlationId,
          ipAddress,
        });
        return redirectWithCorrelation(next, appUrl, correlationId);
      } catch {
        // No live session: the link is the way in.
      }
    }

    let identity: Awaited<ReturnType<typeof exchangeCodeForSession>>;
    if (params.code !== undefined) {
      identity = await exchangeCodeForSession(client, params.code);
    } else if (params.token_hash !== undefined && params.type !== undefined) {
      identity = await verifyEmailLink(client, {
        tokenHash: params.token_hash,
        type: params.type,
      });
    } else {
      return fail();
    }

    // Substep D: OAuth provider callback (sign-in or account linking). The
    // PKCE code is already exchanged for a provider session; establish the
    // platform mirror so the session is usable, create and advance a profile
    // for a brand-new OAuth identity (the provider verified the email), and
    // audit the outcome.
    if (params.mode === "oauth" || params.mode === "oauth-link") {
      const flowRequest = {
        correlationId,
        ipAddress,
        userAgent: request.headers.get("user-agent"),
      };
      const session = (await client.auth.getSession()).data.session;
      if (session !== null) {
        const expiresAt =
          typeof session.expires_at === "number"
            ? new Date(session.expires_at * 1000).toISOString()
            : new Date(Date.now() + 24 * 60 * 60_000).toISOString();
        await establishSessionMirror({
          userId: identity.id,
          refreshToken: session.refresh_token,
          expiresAt,
          request: flowRequest,
          factor: "oauth",
        });
      }
      const oauthContext = makeTenantContext({
        companyId: PLATFORM_COMPANY_ID,
        userId: identity.id,
        role: "staff",
        correlationId,
      });
      if (params.mode === "oauth") {
        const existing = await getOwnProfile(oauthContext);
        if (existing === null) {
          const created = await createProfile(oauthContext, {
            userId: identity.id,
            displayName:
              identity.email !== null ? (identity.email.split("@")[0] ?? "User") : "User",
          });
          await transitionProfileStatus(oauthContext, {
            subjectUserId: identity.id,
            toStatus: "pending_approval",
            expectedVersion: created.version,
          });
        }
      }
      await auditAuthLifecycle({
        action:
          params.mode === "oauth"
            ? AUTH_LIFECYCLE_AUDIT_ACTIONS.oauthSigninInitiated
            : AUTH_LIFECYCLE_AUDIT_ACTIONS.oauthIdentityLinked,
        resourceType: "auth_oauth",
        resourceId: identity.id,
        actorId: identity.id,
        ipAddress,
        userAgent: request.headers.get("user-agent"),
        correlationId,
        metadata: { mode: params.mode },
      });
      return redirectWithCorrelation(params.next ?? "/account", appUrl, correlationId);
    }

    const context = makeTenantContext({
      companyId: PLATFORM_COMPANY_ID,
      userId: identity.id,
      role: "staff",
      correlationId,
    });
    const profile = await getOwnProfile(context);
    if (profile !== null && profile.status === "pending_verification") {
      const updated = await transitionProfileStatus(context, {
        subjectUserId: identity.id,
        toStatus: "pending_approval",
        expectedVersion: profile.version,
      });
      await auditAuthLifecycle({
        action: AUTH_LIFECYCLE_AUDIT_ACTIONS.verificationCompleted,
        resourceType: "profiles",
        resourceId: updated.id,
        actorId: identity.id,
        ipAddress,
        userAgent: request.headers.get("user-agent"),
        correlationId,
        metadata: { fromStatus: "pending_verification", toStatus: updated.status },
      });
      try {
        await signOutCurrentSession(client);
      } catch {
        // The one-time exchange session served its purpose; cleanup is best-effort.
      }
    }

    return redirectWithCorrelation(next, appUrl, correlationId);
  } catch {
    return fail();
  }
}
