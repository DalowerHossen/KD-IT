// path: components/auth/verify-email-panel.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactElement } from "react";

import { AuthRequestError, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/i18n/strings/en";

export interface VerifyEmailPanelProps {
  readonly showVerifiedState: boolean;
}

/**
 * Verification landing: explains the pending state, celebrates a
 * confirmed link, and offers a re-send that always reports the same
 * outcome regardless of account existence.
 */
export function VerifyEmailPanel({ showVerifiedState }: VerifyEmailPanelProps): ReactElement {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postAuth<{ sent: boolean }>("/api/auth/verify/resend", { email });
      setResent(true);
    } catch (requestError) {
      setError(
        requestError instanceof AuthRequestError
          ? requestError.message
          : strings.auth.errors.generic,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const copy = strings.auth.verifyEmail;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{showVerifiedState ? copy.verifiedTitle : copy.title}</h1>
        <p className="text-body-md text-muted-foreground">
          {showVerifiedState ? copy.verifiedBody : copy.subtitle}
        </p>
      </div>
      {resent ? (
        <p
          role="status"
          className="border-success/40 bg-success/10 text-body-sm rounded-md border p-3"
        >
          {copy.resendDone}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <h2 className="text-body-md font-medium">{copy.resendTitle}</h2>
          {error !== null ? (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-email">{copy.emailLabel}</Label>
            <Input
              id="verify-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            size="md"
            variant="outline"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? copy.resending : copy.resendSubmit}
          </Button>
        </form>
      )}
      <p className="text-center">
        <Link href="/login" prefetch={false} className="text-body-sm text-primary hover:underline">
          {strings.auth.forgotPassword.backToLogin}
        </Link>
      </p>
    </div>
  );
}
