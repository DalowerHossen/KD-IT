// path: app/api/platform/kyc/[applicationId]/documents/[fileId]/route.ts
import { type NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/envelope";
import { requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { downloadKycDocument, getKycApplicationForReview } from "@/lib/company/kyc";
import { NotFoundError } from "@/lib/errors/app-errors";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Substep O - previews a KYC document for an authorized reviewer. The file
 * must belong to the named application; the ciphertext is decrypted
 * server-side and returned with its original type.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string; fileId: string }> },
): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    const { applicationId, fileId } = await params;
    const validApplicationId = uuidV7Schema.parse(applicationId);
    const validFileId = uuidV7Schema.parse(fileId);
    const context = await workingContextForRoute(request);
    const application = await getKycApplicationForReview(context, validApplicationId);
    if (!Object.values(application.documents).includes(validFileId)) {
      throw new NotFoundError("This file does not belong to this KYC application.");
    }
    const document = await downloadKycDocument(context, validFileId);
    return new NextResponse(new Uint8Array(document.bytes), {
      status: 200,
      headers: {
        "content-type": document.mimeType,
        "content-disposition": `inline; filename="${document.originalName.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
