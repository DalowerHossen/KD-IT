// path: components/auth/mfa-settings.tsx
"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import { AuthRequestError, getAuth, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { strings } from "@/lib/i18n/strings/en";

const t = strings.mfa;

interface MfaStatusData {
  readonly requiredLevel: string;
  readonly currentLevel: string;
  readonly satisfied: boolean;
  readonly mustEnroll: boolean;
  readonly factors: readonly {
    readonly id: string;
    readonly type: string;
    readonly friendlyName: string | null;
    readonly status: string;
  }[];
  readonly recoveryCodesRemaining: number | null;
}

interface RecoveryStatusData {
  readonly total: number;
  readonly remaining: number;
}

/**
 * Security settings surface for the signed-in (aal2) user: shows the 2FA
 * posture, lists enrolled factors with removal, and manages backup codes.
 * Removal is step-up gated server-side; a stale session is re-prompted.
 */
export function MfaSettings(): ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<readonly string[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getAuth<MfaStatusData>("/api/auth/mfa/status");
      setStatus(data);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof AuthRequestError ? loadError.message : strings.auth.errors.generic,
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAuth<MfaStatusData>("/api/auth/mfa/status");
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(
          loadError instanceof AuthRequestError ? loadError.message : strings.auth.errors.generic,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function typeLabel(type: string): string {
    const key = type as keyof typeof t.factorType;
    return t.factorType[key] ?? type;
  }

  function statusLabel(status: string): string {
    const key = status as keyof typeof t.factorStatus;
    return t.factorStatus[key] ?? status;
  }

  async function handleUnenroll(factorId: string): Promise<void> {
    if (busyId !== null) return;
    setBusyId(factorId);
    setNotice(null);
    setError(null);
    try {
      await postAuth("/api/auth/mfa/unenroll", { factorId });
      setNotice(t.removed);
      await load();
    } catch (unenrollError) {
      setError(
        unenrollError instanceof AuthRequestError
          ? unenrollError.message
          : strings.auth.errors.generic,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (generating) return;
    setGenerating(true);
    setNotice(null);
    setError(null);
    try {
      const result = await postAuth<{ codes: string[] }>("/api/auth/mfa/recovery-codes/generate", {
        friendlyName: "Backup codes",
      });
      setBackupCodes(result.codes);
      const remaining = await getAuth<RecoveryStatusData>("/api/auth/mfa/recovery-codes");
      setStatus((prev) =>
        prev === null ? prev : { ...prev, recoveryCodesRemaining: remaining.remaining },
      );
    } catch (generateError) {
      setError(
        generateError instanceof AuthRequestError
          ? generateError.message
          : strings.auth.errors.generic,
      );
    } finally {
      setGenerating(false);
    }
  }

  const hasVerifiedTotp =
    status !== null && status.factors.some((f) => f.type === "totp" && f.status === "verified");

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{t.title}</h1>
        <p className="text-body-md text-muted-foreground">{t.subtitle}</p>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
        >
          {error}
        </p>
      ) : null}
      {notice !== null ? (
        <p
          role="status"
          className="border-success/40 bg-success/10 text-body-sm rounded-md border p-3"
        >
          {notice}
        </p>
      ) : null}

      {status !== null ? (
        <p className="text-body-sm" data-state={status.satisfied ? "on" : "off"}>
          {status.satisfied ? t.status.protected : t.status.off}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.factors}</CardTitle>
          <CardDescription>{t.noFactors}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === null ? (
            <p role="status" className="text-body-sm text-muted-foreground">
              {t.noFactors}
            </p>
          ) : status.factors.length === 0 ? (
            <p role="status" className="text-body-sm text-muted-foreground">
              {t.noFactors}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {status.factors.map((factor) => (
                <li
                  key={factor.id}
                  className="border-input flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <p className="text-body-md font-medium">
                      {typeLabel(factor.type)}
                      {factor.friendlyName !== null ? `: ${factor.friendlyName}` : ""}
                    </p>
                    <p className="text-body-sm text-muted-foreground">
                      {statusLabel(factor.status)}
                    </p>
                  </div>
                  {factor.type !== "recovery_code" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId !== null}
                      onClick={() => void handleUnenroll(factor.id)}
                    >
                      {t.remove}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {!hasVerifiedTotp ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.enroll.title}</CardTitle>
            <CardDescription>{t.status.enrollmentRequired}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" size="md" onClick={() => router.push("/mfa/setup")}>
              {t.enroll.verify}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.backupCodes.title}</CardTitle>
          <CardDescription>{t.backupCodes.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status !== null && status.recoveryCodesRemaining !== null ? (
            <p className="text-body-sm text-muted-foreground">
              {status.recoveryCodesRemaining} {t.backupCodes.remaining}
            </p>
          ) : null}
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
            variant="outline"
            className="w-full sm:w-auto"
            disabled={generating || !hasVerifiedTotp}
            onClick={() => void handleGenerate()}
          >
            {generating ? t.backupCodes.generating : t.backupCodes.generate}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
