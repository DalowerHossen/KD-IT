// path: app/api/platform/domains/verify/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { domainVerifySchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { verifyDomain } from "@/lib/company/domains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep M - verifies custom-domain ownership (platform). The observed DNS
 * record value is matched against the domain's token: a match activates the
 * domain, a mismatch rejects it with a failure reason.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, domainVerifySchema);
    const context = await workingContextForRoute(request);
    const domain = await verifyDomain(context, body);
    return apiOk(domain, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
