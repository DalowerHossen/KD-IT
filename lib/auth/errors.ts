// path: lib/auth/errors.ts
import { ForbiddenError, UnauthorizedError } from "@/lib/errors/app-errors";

/**
 * Typed authorization errors. Every message is generic by design: denials
 * never reveal which role, permission, grant, route, or account was
 * expected, so authorization failures cannot enumerate the platform.
 * Machine-readable denial reasons exist for audit metadata only and are
 * never rendered to callers.
 */
export type AuthorizationDenialReason =
  | "anonymous"
  | "scope_mismatch"
  | "role_mismatch"
  | "permission_missing"
  | "grant_missing"
  | "grant_expired"
  | "approval_missing"
  | "step_up_missing"
  | "ownership_mismatch";

export class AuthenticationRequiredError extends UnauthorizedError {
  constructor(message = "Sign in is required to continue.") {
    super(message);
  }
}

export class AuthorizationError extends ForbiddenError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
  }
}

export class ApprovalRequiredError extends ForbiddenError {
  constructor(message = "This action requires approval before it can run.") {
    super(message);
  }
}

export class StepUpRequiredError extends ForbiddenError {
  constructor(message = "Fresh verification is required before this action.") {
    super(message);
  }
}
