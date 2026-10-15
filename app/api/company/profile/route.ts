// path: app/api/company/profile/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { companyProfileUpdateSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { getCompanyProfile, updateCompanyProfile } from "@/lib/company/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep L - reads the workspace profile (name merged from the company). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const profile = await getCompanyProfile(context);
    return apiOk(profile, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}

/** Substep L - replaces the workspace profile (owner, optimistic). */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, companyProfileUpdateSchema);
    const context = await workingContextForRoute(request);
    const profile = await updateCompanyProfile(context, body);
    return apiOk(profile, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
