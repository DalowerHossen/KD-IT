// path: components/auth/account-overview.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactElement } from "react";

import { AuthRequestError, getAuth } from "@/components/auth/auth-client";
import { LogoutButton } from "@/components/auth/logout-button";
import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { SessionList } from "@/components/auth/session-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { strings } from "@/lib/i18n/strings/en";

interface AccountIdentity {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly status: string;
}

/**
 * Authenticated account surface: identity header, live sessions,
 * password change, and logout scopes. Any authentication failure returns
 * to sign-in; the proxy already guards the route, so this is the
 * client-side backstop for expired sessions.
 */
export function AccountOverview(): ReactElement {
  const router = useRouter();
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExpired = useCallback(() => {
    router.push("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    getAuth<AccountIdentity>("/api/auth/me")
      .then((data) => {
        if (!cancelled) {
          setIdentity(data);
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        if (loadError instanceof AuthRequestError) {
          handleExpired();
        } else {
          setError(strings.auth.errors.generic);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handleExpired]);

  const copy = strings.auth.account;
  if (error !== null) {
    return (
      <p
        role="alert"
        className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
      >
        {error}
      </p>
    );
  }
  if (identity === null) {
    return (
      <p role="status" className="text-body-md text-muted-foreground">
        {copy.subtitle}
      </p>
    );
  }
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{copy.title}</h1>
        <p className="text-body-md text-muted-foreground">
          {copy.signedInAs} {identity.displayName}
          {identity.email !== null ? ` (${identity.email})` : ""} {copy.statusLabel}:{" "}
          {identity.status}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{copy.sessionsTitle}</CardTitle>
          <CardDescription>{copy.sessionsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionList onExpired={handleExpired} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{copy.passwordTitle}</CardTitle>
          <CardDescription>{copy.passwordSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3 sm:flex-row">
        <LogoutButton scope="current" />
        <LogoutButton scope="all" />
      </div>
    </div>
  );
}
