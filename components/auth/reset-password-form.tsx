// path: components/auth/reset-password-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";

import { AuthRequestError, groupIssuesByField, postAuth } from "@/components/auth/auth-client";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordUpdateInputSchema } from "@/lib/auth/schemas";
import { strings } from "@/lib/i18n/strings/en";

/**
 * Recovery-completion form, reached from the reset link. The link session
 * lives in cookies, so the form only carries the new password; the server
 * re-validates the shared schema, resets, and destroys every session.
 */
export function ResetPasswordForm(): ReactElement {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const parsed = passwordUpdateInputSchema.safeParse({ password });
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
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await postAuth<{ reset: boolean }>("/api/auth/recovery/confirm", parsed.data);
      router.push("/login?reset=1");
    } catch (requestError) {
      if (requestError instanceof AuthRequestError) {
        setFieldErrors(groupIssuesByField(requestError.issues));
        setError(requestError.issues.length > 0 ? null : requestError.message);
      } else {
        setError(strings.auth.errors.generic);
      }
      setSubmitting(false);
    }
  }

  const copy = strings.auth.resetPassword;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{copy.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.subtitle}</p>
      </div>
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
          <Label htmlFor="reset-password">{copy.passwordLabel}</Label>
          <Input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password !== undefined}
          />
          {fieldErrors.password !== undefined ? (
            <p role="alert" className="text-destructive text-body-sm">
              {fieldErrors.password}
            </p>
          ) : null}
          <PasswordStrengthMeter password={password} />
        </div>
        <Button type="submit" size="md" className="w-full" disabled={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </form>
    </div>
  );
}
