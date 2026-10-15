// path: lib/api/envelope.ts
import "server-only";

import { NextResponse } from "next/server";

import { isAppError, InternalError, type AppError } from "@/lib/errors/app-errors";
import { ERROR_CODES, type ErrorCode } from "@/lib/errors/error-codes";
import { rootLogger } from "@/lib/logging/logger";
import { CORRELATION_ID_HEADER, createCorrelationId } from "@/lib/logging/correlation";

export interface ApiMeta {
  readonly correlationId: string;
  readonly timestamp: string;
}

export interface ApiSuccessBody<TData> {
  readonly ok: true;
  readonly data: TData;
  readonly meta: ApiMeta;
}

export interface ApiErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Record<string, unknown>;
    readonly correlationId: string;
    readonly timestamp: string;
  };
}

export interface EnvelopeOptions {
  readonly correlationId?: string;
  readonly status?: number;
  readonly headers?: Record<string, string>;
}

function buildHeaders(
  correlationId: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    [CORRELATION_ID_HEADER]: correlationId,
    "Cache-Control": "no-store",
    ...(extra ?? {}),
  };
}

/** Builds the standard success envelope with correlation metadata. */
export function apiOk<TData>(
  data: TData,
  options?: EnvelopeOptions,
): NextResponse<ApiSuccessBody<TData>> {
  const correlationId = options?.correlationId ?? createCorrelationId();
  const body: ApiSuccessBody<TData> = {
    ok: true,
    data,
    meta: { correlationId, timestamp: new Date().toISOString() },
  };
  return NextResponse.json(body, {
    status: options?.status ?? 200,
    headers: buildHeaders(correlationId, options?.headers),
  });
}

/**
 * Maps any thrown value to the standard error envelope. Operational errors
 * keep their message; everything else becomes a generic internal error so
 * internals are never exposed. The event is logged with correlation context.
 */
export function apiError(error: unknown, options?: EnvelopeOptions): NextResponse<ApiErrorBody> {
  const correlationId = options?.correlationId ?? createCorrelationId();
  const normalized: AppError = isAppError(error)
    ? error
    : new InternalError(undefined, { cause: error });

  const log = rootLogger.withCorrelation(correlationId);
  const logContext = {
    code: normalized.code,
    httpStatus: normalized.httpStatus,
    operational: normalized.isOperational,
  };
  if (normalized.httpStatus >= 500) {
    log.error("api.request_failed", logContext);
  } else {
    log.warn("api.request_rejected", logContext);
  }

  const body: ApiErrorBody = {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.toPublicMessage(),
      ...(normalized.code === ERROR_CODES.VALIDATION_FAILED && normalized.details
        ? { details: normalized.details }
        : {}),
      correlationId,
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(body, {
    status: normalized.httpStatus,
    headers: buildHeaders(correlationId, options?.headers),
  });
}
