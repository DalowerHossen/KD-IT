// path: app/api/company/domains/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { domainRequestSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { listDomains, requestDomain } from "@/lib/company/domains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep M - lists the workspace's custom domains. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const domains = await listDomains(context);
    return apiOk({ domains }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}

/** Substep M - requests a custom domain (starts pending for verification). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, domainRequestSchema);
    const context = await workingContextForRoute(request);
    const domain = await requestDomain(context, body);
    return apiOk(domain, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
