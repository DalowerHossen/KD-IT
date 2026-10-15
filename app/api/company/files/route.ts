// path: app/api/company/files/route.ts
import type { NextRequest, NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/envelope";
import { assertSameOrigin, requestCorrelationId } from "@/lib/api/request-guard";
import { workingContextForRoute } from "@/lib/auth/working-context";
import { fileCategorySchema } from "@/lib/files/validation";
import { ValidationError } from "@/lib/errors/app-errors";
import { uploadEncryptedFile } from "@/lib/storage/file-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Tenant file upload: validates + encrypts the file through the Step 02
 * storage pipeline and returns the created file record. Used by the KYC
 * verification flow (category "kyc") and other tenant surfaces that need a
 * file reference.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = requestCorrelationId(request);
  try {
    assertSameOrigin(request);
    const context = await workingContextForRoute(request);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("A file is required.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError("The file exceeds the 100 MB limit.");
    }
    const categoryRaw = formData.get("category");
    const category = fileCategorySchema.parse(
      typeof categoryRaw === "string" && categoryRaw.length > 0 ? categoryRaw : "other",
    );
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadEncryptedFile(context, {
      originalFilename: file.name,
      declaredMime: file.type !== "" ? file.type : "application/octet-stream",
      category,
      bytes,
    });
    return apiOk(uploaded, { correlationId, status: 201 });
  } catch (error) {
    return apiError(error, { correlationId });
  }
}
