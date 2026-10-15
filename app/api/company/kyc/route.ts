// path: app/api/company/kyc/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { kycSubmitInputSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { getKycApplication, submitKycApplication } from "@/lib/company/kyc";
import { enforceAbuseProtection } from "@/lib/security/abuse-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep O - reads the workspace's most recent KYC application. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const kyc = await getKycApplication(context);
    return apiOk({ kyc }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}

/**
 * Substep O - submits (or re-submits) a KYC application. Rate-limited per IP
 * and account, human-checked, and blocked for VPN/proxy/Tor/low-reputation
 * traffic so fraudulent submissions are screened at the door.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const input = await parseJsonBody(request, kycSubmitInputSchema);
    const context = await workingContextForRoute(request);
    await enforceAbuseProtection(context, {
      ipAddress: requestIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent"),
      action: "kyc.submit",
      correlationId,
      ipScopes: ["kycSubmitPerIp"],
      deviceScopes: [],
      accountScopes: ["kycSubmitPerAccount"],
      accountKey: context.userId,
    });
    const kyc = await submitKycApplication(context, input);
    return apiOk(kyc, { correlationId, status: 201 });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
