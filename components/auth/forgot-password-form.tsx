// path: components/auth/forgot-password-form.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactElement } from "react";

import { AuthRequestError, groupIssuesByField, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/i18n/strings/en";

/**
 * Recovery-request form. Always lands on the same confirmation state so
 * the page can never distinguish registered addresses from unknown ones.
 */
export function ForgotPasswordForm(): ReactElement {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await postAuth<{ sent: boolean }>("/api/auth/recovery/request", { email });
      setSent(true);
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

  const copy = strings.auth.forgotPassword;
  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-md">{copy.successTitle}</h1>
          <p className="text-body-md text-muted-foreground">{copy.successBody}</p>
        </div>
        <Link href="/login" prefetch={false} className="text-body-sm text-primary hover:underline">
          {copy.backToLogin}
        </Link>
      </div>
    );
  }
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
          <Label htmlFor="forgot-email">{copy.emailLabel}</Label>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.email !== undefined}
          />
          {fieldErrors.email !== undefined ? (
            <p role="alert" className="text-destructive text-body-sm">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="md" className="w-full" disabled={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </form>
      <p className="text-center">
        <Link href="/login" prefetch={false} className="text-body-sm text-primary hover:underline">
          {copy.backToLogin}
        </Link>
      </p>
    </div>
  );
}
