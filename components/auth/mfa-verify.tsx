// path: components/auth/mfa-verify.tsx
"use client";

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { AuthRequestError, getAuth, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/i18n/strings/en";

const t = strings.mfa;

interface MfaStatusData {
  readonly factors: readonly {
    readonly id: string;
    readonly type: string;
    readonly status: string;
  }[];
}

/**
 * Post-login 2FA challenge. The session is authenticated at aal1; this
 * surface verifies a TOTP code (challenge + verify) or a single-use backup
 * code to reach aal2, then sends the user onward.
 */
export function MfaVerify(): ReactElement {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAuth<MfaStatusData>("/api/auth/mfa/status");
        if (cancelled) {
          return;
        }
        const totp = data.factors.find((f) => f.type === "totp" && f.status === "verified");
        setFactorId(totp === undefined ? null : totp.id);
      } catch {
        if (!cancelled) {
          setFactorId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || factorId === null) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await postAuth<{ challengeId: string }>("/api/auth/mfa/challenge", {
        factorId,
      });
      await postAuth("/api/auth/mfa/verify", {
        factorId,
        challengeId: challenge.challengeId,
        code: code.trim(),
      });
      router.push("/account");
    } catch (submitError) {
      setError(
        submitError instanceof AuthRequestError ? submitError.message : strings.auth.errors.generic,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleBackup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await postAuth("/api/auth/mfa/verify-recovery-code", {
        code: backupCode.trim(),
      });
      router.push("/account");
    } catch (backupError) {
      setError(
        backupError instanceof AuthRequestError ? backupError.message : strings.auth.errors.generic,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{t.verify.title}</h1>
        <p className="text-body-md text-muted-foreground">{t.verify.prompt}</p>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
        >
          {error}
        </p>
      ) : null}

      {factorId === null ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.verify.backupPrompt}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBackup} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mfa-backup-code">{t.verify.backupLabel}</Label>
                <Input
                  id="mfa-backup-code"
                  name="backupCode"
                  type="text"
                  required
                  value={backupCode}
                  onChange={(event) => setBackupCode(event.target.value)}
                />
              </div>
              <Button type="submit" size="md" className="w-full" disabled={busy}>
                {t.verify.backupSubmit}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t.enroll.codeLabel}</CardTitle>
              <CardDescription>{t.verify.prompt}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mfa-code">{t.verify.codeLabel}</Label>
                  <Input
                    id="mfa-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
                <Button type="submit" size="md" className="w-full" disabled={busy}>
                  {busy ? t.verify.submitting : t.verify.submit}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t.verify.backupPrompt}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBackup} className="flex flex-col gap-4" noValidate>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mfa-backup-code-alt">{t.verify.backupLabel}</Label>
                  <Input
                    id="mfa-backup-code-alt"
                    name="backupCodeAlt"
                    type="text"
                    required
                    value={backupCode}
                    onChange={(event) => setBackupCode(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  size="md"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                >
                  {t.verify.backupSubmit}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
