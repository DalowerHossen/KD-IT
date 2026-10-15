// path: app/api/platform/companies/create/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { companyCreateInputSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { proposeCompanyCreation } from "@/lib/company/onboarding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep I - proposes creating a new tenant company. Super-admin/ceo only.
 * Creates an admin.company.create approval command; the company and its owner
 * binding are provisioned only after the command is fully approved and
 * executed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, companyCreateInputSchema);
    const context = await workingContextForRoute(request);
    const { commandId } = await proposeCompanyCreation(context, body);
    return apiOk({ commandId, status: "proposed" }, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
