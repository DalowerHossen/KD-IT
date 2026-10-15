// path: components/auth/auth-client.ts
import { strings } from "@/lib/i18n/strings/en";

/**
 * Client-side envelope reader for the authentication APIs. Successful
 * responses resolve to their data payload; failures throw an
 * AuthRequestError carrying the server's operational message plus any
 * field-level validation issues. Network failures map to one generic
 * message so callers never render fetch internals.
 */
export interface AuthFieldIssue {
  readonly path: string;
  readonly message: string;
}

export class AuthRequestError extends Error {
  readonly issues: readonly AuthFieldIssue[];

  constructor(message: string, issues?: readonly AuthFieldIssue[]) {
    super(message);
    this.name = "AuthRequestError";
    this.issues = issues ?? [];
  }
}

interface EnvelopeSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

interface EnvelopeFailure {
  readonly ok: false;
  readonly error: {
    readonly message: string;
    readonly details?: { readonly issues?: readonly AuthFieldIssue[] };
  };
}

function isFailureBody(value: unknown): value is EnvelopeFailure {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const body = value as { ok?: unknown; error?: unknown };
  return (
    body.ok === false &&
    typeof body.error === "object" &&
    body.error !== null &&
    typeof (body.error as { message?: unknown }).message === "string"
  );
}

async function parseAuthResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new AuthRequestError(strings.auth.errors.generic);
  }
  if (isFailureBody(body)) {
    const issues = body.error.details?.issues;
    throw new AuthRequestError(
      body.error.message || strings.auth.errors.generic,
      Array.isArray(issues) ? issues : [],
    );
  }
  const success = body as Partial<EnvelopeSuccess<T>>;
  if (success.ok !== true || success.data === undefined) {
    throw new AuthRequestError(strings.auth.errors.generic);
  }
  return success.data;
}

/** POSTs JSON to an auth API and resolves to the data payload. */
export async function postAuth<T>(path: string, payload: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthRequestError(strings.auth.errors.generic);
  }
  return parseAuthResponse<T>(response);
}

/** GETs an auth API and resolves to the data payload. */
export async function getAuth<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "GET" });
  } catch {
    throw new AuthRequestError(strings.auth.errors.generic);
  }
  return parseAuthResponse<T>(response);
}

/** Groups field issues by their top-level path for form display. */
export function groupIssuesByField(issues: readonly AuthFieldIssue[]): Record<string, string> {
  const grouped: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.split(".")[0] ?? issue.path;
    if (grouped[field] === undefined) {
      grouped[field] = issue.message;
    }
  }
  return grouped;
}
