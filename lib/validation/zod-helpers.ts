// path: lib/validation/zod-helpers.ts
import { z } from "zod";

import { isSafeRelativePath, sanitizePlainText } from "@/lib/validation/sanitize";

/** UUID v7 identifier; authoritative identifiers are generated in PostgreSQL. */
export const uuidV7Schema = z.uuid({ version: "v7" });

export const genericUuidSchema = z.uuid();

/** Email address normalized to lowercase on both client and server. */
export const emailSchema = z
  .email({ message: "Enter a valid email address." })
  .max(254, "Email addresses are limited to 254 characters.")
  .transform((value) => value.trim().toLowerCase());

/**
 * Plain free-text string with normalization applied before length rules, so
 * invisible control characters can never inflate or hide content.
 */
export function plainTextSchema(maxLength: number, label: string): z.ZodType<string> {
  return z
    .string()
    .transform((value) => sanitizePlainText(value, maxLength))
    .pipe(z.string().min(1, `${label} is required.`).max(maxLength));
}

/** Same-origin redirect target such as /settings after sign-in. */
export const safeRedirectPathSchema = z
  .string()
  .max(2048)
  .refine(isSafeRelativePath, "Redirect targets must stay on this site.");

/** Opaque client-supplied idempotency key for retryable mutations. */
export const idempotencyKeySchema = z
  .string()
  .min(8, "Idempotency keys must be at least 8 characters.")
  .max(128, "Idempotency keys are limited to 128 characters.")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Idempotency keys may contain letters, digits, dashes, and underscores.",
  );

/** Integer optimistic-lock version echoed back by clients on mutation. */
export const optimisticVersionSchema = z.number().int().min(1);

export const paginationQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Builds a strict sort schema from an allowlist of column names. */
export function sortQuerySchema<TColumn extends string>(
  columns: readonly TColumn[],
): z.ZodType<{ readonly column: TColumn; readonly direction: "asc" | "desc" }> {
  const columnSchema = z.enum(columns as [TColumn, ...TColumn[]]);
  return z.strictObject({
    column: columnSchema.default(columns[0] as TColumn),
    direction: z.enum(["asc", "desc"]).default("asc"),
  }) as z.ZodType<{ readonly column: TColumn; readonly direction: "asc" | "desc" }>;
}

/**
 * Safe parse helper that returns a discriminated union instead of throwing,
 * for API boundaries that need to build a typed error envelope.
 */
export function parseBoundary<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
):
  | { readonly success: true; readonly data: z.infer<TSchema> }
  | { readonly success: false; readonly issues: readonly string[] } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return { success: true, data: parsed.data };
}
