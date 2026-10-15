// path: app/api/platform/email/verify/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, parseJsonBody, requestCorrelationId } from "@/lib/api/request-guard";
import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { requestIpFromHeaders } from "@/lib/auth/request-ip";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";
import { getEmailAdapter } from "@/lib/email/adapters/registry";
import { markCredentialVerified, saveEmailCredential } from "@/lib/email/credentials";
import { normalizeCredential, verifyEmailRequestSchema } from "@/lib/email/schemas";
import { ForbiddenError } from "@/lib/errors/app-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep H - stores a platform email provider credential (encrypted) and runs
 * a live connection verification. Super-admin only. The credential is encrypted
 * with the platform envelope before it is persisted; the verification outcome
 * is recorded on the credential and audited. Provider-credential management
 * beyond this (rotation, multiple tenants, UI) is Step 06's control plane.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const body = await parseJsonBody(request, verifyEmailRequestSchema);
    const context = await workingContextForRoute(request);
    if (context.role !== "super_admin") {
      throw new ForbiddenError("Only a super-admin can configure email delivery.");
    }
    const credential = normalizeCredential(body);
    const platformContext = makeTenantContext({
      companyId: PLATFORM_COMPANY_ID,
      userId: context.userId,
      role: context.role,
      correlationId,
    });
    const { id } = await saveEmailCredential(platformContext, {
      provider: body.provider,
      fromAddress: credential.from,
      credential,
    });
    const adapter = getEmailAdapter(body.provider);
    try {
      await adapter.verifyConnection(credential);
      await markCredentialVerified(id, true);
      await auditAuthLifecycle({
        action: AUTH_LIFECYCLE_AUDIT_ACTIONS.emailProviderVerified,
        resourceType: "email_credentials",
        resourceId: id,
        actorId: context.userId,
        ipAddress: requestIpFromHeaders(request.headers),
        correlationId,
        metadata: { provider: body.provider, verified: true },
      });
      return apiOk(
        { verified: true, provider: body.provider, credentialId: id },
        { correlationId },
      );
    } catch (verifyError) {
      await markCredentialVerified(id, false);
      throw verifyError;
    }
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
