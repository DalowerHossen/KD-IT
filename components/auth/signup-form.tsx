// path: components/auth/signup-form.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";

import { AuthRequestError, groupIssuesByField, postAuth } from "@/components/auth/auth-client";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupInputSchema } from "@/lib/auth/schemas";
import { strings } from "@/lib/i18n/strings/en";

/**
 * Registration form. Validates against the shared signup schema before
 * sending, so policy feedback is instant; the server re-validates the
 * same schema before the provider ever sees the password.
 */
export function SignupForm(): ReactElement {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const parsed = signupInputSchema.safeParse({ displayName, email, password });
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
      await postAuth<{ sent: boolean }>("/api/auth/signup", parsed.data);
      router.push("/verify-email");
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

  const copy = strings.auth.signup;
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
          <Label htmlFor="signup-name">{copy.displayNameLabel}</Label>
          <Input
            id="signup-name"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-invalid={fieldErrors.displayName !== undefined}
          />
          {fieldErrors.displayName !== undefined ? (
            <p role="alert" className="text-destructive text-body-sm">
              {fieldErrors.displayName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-email">{copy.emailLabel}</Label>
          <Input
            id="signup-email"
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-password">{copy.passwordLabel}</Label>
          <Input
            id="signup-password"
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
      <p className="text-body-sm text-muted-foreground text-center">
        {copy.loginPrompt}{" "}
        <Link href="/login" prefetch={false} className="text-primary hover:underline">
          {copy.loginLink}
        </Link>
      </p>
    </div>
  );
}
