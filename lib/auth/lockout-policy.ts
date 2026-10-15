// path: lib/auth/lockout-policy.ts
import "server-only";

/**
 * Substep E - account-lock policy. Two consecutive authentication failures
 * (password and 2FA share a single sequence) open an exact two-hour lock
 * window. These constants are the single source of truth for the threshold
 * and duration so the PL/pgSQL writer and the application flows always agree.
 */
export const AUTH_LOCK_FAILURE_THRESHOLD = 2;
/** Exactly two hours, in milliseconds (for display and JS-side checks). */
export const AUTH_LOCK_DURATION_MS = 2 * 60 * 60 * 1000;
/** The interval literal passed to the database writer. */
export const AUTH_LOCK_INTERVAL_SQL = "2 hours";

/**
 * True while a lock window is open at the given instant. A null/invalid
 * locked_until is never active.
 */
export function isLockActive(
  lockedUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (lockedUntil === null || lockedUntil === undefined) {
    return false;
  }
  const until = new Date(lockedUntil).getTime();
  if (Number.isNaN(until)) {
    return false;
  }
  return until > now.getTime();
}
