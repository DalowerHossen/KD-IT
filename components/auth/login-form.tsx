// path: components/auth/login-form.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactElement } from "react";

import { AuthRequestError, groupIssuesByField, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/i18n/strings/en";

export interface LoginFormProps {
  /** Validated post-login target; the page guarantees it stays on-site. */
  readonly next: string;
  readonly showInvalidLinkNotice: boolean;
  readonly showResetDoneNotice: boolean;
}

/** Sign-in form: posts credentials, then navigates to the returned target. */
export function LoginForm({
  next,
  showInvalidLinkNotice,
  showResetDoneNotice,
}: LoginFormProps): ReactElement {
  const router = useRouter();
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
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const data = await postAuth<{ next: string }>("/api/auth/login", { email, password, next });
      router.push(data.next);
      router.refresh();
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

  const copy = strings.auth.login;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{copy.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.subtitle}</p>
      </div>
      {showInvalidLinkNotice ? (
        <p
          role="status"
          className="border-warning/40 bg-warning/10 text-body-sm rounded-md border p-3"
        >
          {copy.invalidLinkNotice}
        </p>
      ) : null}
      {showResetDoneNotice ? (
        <p
          role="status"
          className="border-success/40 bg-success/10 text-body-sm rounded-md border p-3"
        >
          {copy.resetDoneNotice}
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
          <Label htmlFor="login-email">{copy.emailLabel}</Label>
          <Input
            id="login-email"
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
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">{copy.passwordLabel}</Label>
            <Link
              href="/forgot-password"
              prefetch={false}
              className="text-body-sm text-primary hover:underline"
            >
              {copy.forgotLink}
            </Link>
          </div>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
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
        </div>
        <Button type="submit" size="md" className="w-full" disabled={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </form>
      <p className="text-body-sm text-muted-foreground text-center">
        {copy.signupPrompt}{" "}
        <Link href="/signup" prefetch={false} className="text-primary hover:underline">
          {copy.signupLink}
        </Link>
      </p>
    </div>
  );
}
