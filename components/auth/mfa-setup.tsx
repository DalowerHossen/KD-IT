// path: components/auth/mfa-setup.tsx
"use client";

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { AuthRequestError, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/i18n/strings/en";

const t = strings.mfa;

interface EnrollResult {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
}

/**
 * TOTP enrollment for a session that must reach aal2 but has no verified
 * second factor. Starts enrollment (QR + secret), verifies the first code to
 * activate the factor, and offers backup-code generation. Completing it
 * upgrades the session to aal2.
 */
export function MfaSetup(): ReactElement {
  const router = useRouter();
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<readonly string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setEnrolling(true);
        setError(null);
      }
      try {
        const result = await postAuth<EnrollResult>("/api/auth/mfa/enroll", {
          factorType: "totp",
        });
        if (!cancelled) {
          setEnroll(result);
        }
      } catch (enrollError) {
        if (!cancelled) {
          setError(
            enrollError instanceof AuthRequestError
              ? enrollError.message
              : strings.auth.errors.generic,
          );
        }
      } finally {
        if (!cancelled) {
          setEnrolling(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || enroll === null) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await postAuth<{ challengeId: string }>("/api/auth/mfa/challenge", {
        factorId: enroll.factorId,
      });
      await postAuth("/api/auth/mfa/verify", {
        factorId: enroll.factorId,
        challengeId: challenge.challengeId,
        code: code.trim(),
      });
      setDone(true);
      try {
        const generated = await postAuth<{ codes: string[] }>(
          "/api/auth/mfa/recovery-codes/generate",
          {
            friendlyName: "Backup codes",
          },
        );
        setBackupCodes(generated.codes);
      } catch {
        setBackupCodes(null);
      }
    } catch (verifyError) {
      setError(
        verifyError instanceof AuthRequestError ? verifyError.message : strings.auth.errors.generic,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{t.enroll.title}</h1>
        <p className="text-body-md text-muted-foreground">{t.status.enrollmentRequired}</p>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
        >
          {error}
        </p>
      ) : null}

      {done ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.enroll.done}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {backupCodes !== null && backupCodes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-body-sm text-muted-foreground">{t.backupCodes.showOnce}</p>
                <ul className="text-body-sm grid grid-cols-2 gap-1 font-mono">
                  {backupCodes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button
              type="button"
              size="md"
              className="w-full"
              onClick={() => router.push("/account")}
            >
              {t.verify.submit}
            </Button>
          </CardContent>
        </Card>
      ) : enroll === null ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          {enrolling ? t.enroll.verifying : t.enroll.title}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.enroll.step1}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Image
              src={`data:image/svg+xml;utf-8,${enroll.qrCode}`}
              alt="Authenticator QR code"
              width={192}
              height={192}
              unoptimized
              className="mx-auto h-48 w-48"
            />
            <div className="flex flex-col gap-1.5">
              <Label>{t.enroll.secret}</Label>
              <code className="border-input bg-muted text-body-sm rounded-md border p-2 break-all">
                {enroll.secret}
              </code>
            </div>
            <form onSubmit={handleVerify} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mfa-setup-code">{t.enroll.codeLabel}</Label>
                <Input
                  id="mfa-setup-code"
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
                {busy ? t.enroll.verifying : t.enroll.verify}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
