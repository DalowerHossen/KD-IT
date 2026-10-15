// path: app/api/company/invoice-settings/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { invoiceSettingsUpdateSchema } from "@/lib/auth/schemas";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { getInvoiceSettings, updateInvoiceSettings } from "@/lib/company/invoice-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Substep L - reads the workspace invoice settings (defaults when unset). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const context = await workingContextForRoute(request);
    const settings = await getInvoiceSettings(context);
    return apiOk(settings, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}

/** Substep L - replaces the workspace invoice settings (owner, optimistic). */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, invoiceSettingsUpdateSchema);
    const context = await workingContextForRoute(request);
    const settings = await updateInvoiceSettings(context, body);
    return apiOk(settings, { correlationId });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
