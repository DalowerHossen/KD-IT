// path: app/api/health/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiOk, type ApiSuccessBody } from "@/lib/api/envelope";
import { getServerEnv } from "@/lib/config/env";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";
import {
  CORRELATION_ID_HEADER,
  createCorrelationId,
  isValidCorrelationId,
} from "@/lib/logging/correlation";
import { rootLogger } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface HealthPayload {
  readonly status: string;
  readonly service: string;
  readonly version: string;
  readonly environment: string;
  readonly timestamp: string;
}

/**
 * Liveness endpoint for uptime monitoring. Responds through the standard
 * envelope with correlation, and logs one structured event per check.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiSuccessBody<HealthPayload>>> {
  const incoming = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = isValidCorrelationId(incoming) ? incoming : createCorrelationId();
  const environment = getServerEnv().NODE_ENV;

  rootLogger.withCorrelation(correlationId).info("health.check", {
    service: siteConfig.name,
    version: siteConfig.version,
  });

  const payload: HealthPayload = {
    status: strings.health.statusOk,
    service: siteConfig.name,
    version: siteConfig.version,
    environment,
    timestamp: new Date().toISOString(),
  };

  return apiOk(payload, { correlationId });
}
