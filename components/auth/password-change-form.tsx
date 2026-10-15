// path: components/auth/password-change-form.tsx
"use client";

import { useState, type FormEvent, type ReactElement } from "react";

import { AuthRequestError, groupIssuesByField, postAuth } from "@/components/auth/auth-client";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordChangeInputSchema } from "@/lib/auth/schemas";
import { strings } from "@/lib/i18n/strings/en";

/**
 * Authenticated password change with current-password confirmation. The
 * server re-authenticates, enforces policy, breach, and reuse checks, and
 * revokes every other session before this form reports success.
 */
export function PasswordChangeForm(): ReactElement {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const parsed = passwordChangeInputSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setFieldErrors(
        groupIssuesByField(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
      setError(null);
      setChanged(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setChanged(false);
    try {
      await postAuth<{ changed: boolean; revokedSessions: number }>(
        "/api/auth/password/change",
        parsed.data,
      );
      setCurrentPassword("");
      setNewPassword("");
      setChanged(true);
    } catch (requestError) {
      if (requestError instanceof AuthRequestError) {
        setFieldErrors(groupIssuesByField(requestError.issues));
        setError(requestError.issues.length > 0 ? null : requestError.message);
      } else {
        setError(strings.auth.errors.generic);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const copy = strings.auth.account;
  return (
    <div className="flex flex-col gap-4">
      {changed ? (
        <p
          role="status"
          className="border-success/40 bg-success/10 text-body-sm rounded-md border p-3"
        >
          {copy.changeDone}
        </p>
      ) : null}
      {error !== null ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
        >
          {error}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password-current">{copy.currentPasswordLabel}</Label>
          <Input
            id="password-current"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            aria-invalid={fieldErrors.currentPassword !== undefined}
          />
          {fieldErrors.currentPassword !== undefined ? (
            <p role="alert" className="text-destructive text-body-sm">
              {fieldErrors.currentPassword}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password-new">{copy.newPasswordLabel}</Label>
          <Input
            id="password-new"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-invalid={fieldErrors.newPassword !== undefined}
          />
          {fieldErrors.newPassword !== undefined ? (
            <p role="alert" className="text-destructive text-body-sm">
              {fieldErrors.newPassword}
            </p>
          ) : null}
          <PasswordStrengthMeter password={newPassword} />
        </div>
        <Button type="submit" size="md" className="w-full sm:w-auto" disabled={submitting}>
          {submitting ? copy.changing : copy.changeSubmit}
        </Button>
      </form>
    </div>
  );
}
