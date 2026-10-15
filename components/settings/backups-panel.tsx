// path: components/settings/backups-panel.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactElement } from "react";

import { AuthRequestError, getAuth, postAuth } from "@/components/auth/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { strings } from "@/lib/i18n/strings/en";

interface BackupView {
  readonly id: string;
  readonly status: "pending" | "processing" | "ready" | "failed" | "expired";
  readonly requestedAt: string;
  readonly fulfilledAt: string | null;
  readonly expiresAt: string | null;
  readonly artifactSizeBytes: number | null;
  readonly failureReason: string | null;
}

function statusLabel(status: BackupView["status"]): string {
  const copy = strings.settings.backups;
  if (status === "pending") {
    return copy.statusPending;
  }
  if (status === "processing") {
    return copy.statusProcessing;
  }
  if (status === "ready") {
    return copy.statusReady;
  }
  if (status === "failed") {
    return copy.statusFailed;
  }
  return copy.statusExpired;
}

function statusVariant(
  status: BackupView["status"],
): "secondary" | "success" | "destructive" | "outline" {
  if (status === "ready") {
    return "success";
  }
  if (status === "failed" || status === "expired") {
    return "destructive";
  }
  if (status === "processing") {
    return "outline";
  }
  return "secondary";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Lists the workspace's backup requests, requests a new one, and downloads a ready export. */
export function BackupsPanel(): ReactElement {
  const router = useRouter();
  const [backups, setBackups] = useState<BackupView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const handleExpired = useCallback(() => {
    router.push("/login");
  }, [router]);

  const refresh = useCallback(() => {
    getAuth<{ backups: BackupView[] }>("/api/company/backups")
      .then((data) => setBackups(data.backups))
      .catch((error: unknown) => {
        if (error instanceof AuthRequestError && error.message === "Session expired") {
          handleExpired();
        } else {
          setLoadError(strings.settings.common.unknownError);
        }
      });
  }, [handleExpired]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRequest(): Promise<void> {
    setRequesting(true);
    setRequestError(null);
    try {
      const created = await postAuth<BackupView>("/api/company/backups", {});
      setBackups((current) => (current === null ? [created] : [created, ...current]));
    } catch (error) {
      if (error instanceof AuthRequestError) {
        setRequestError(error.message);
      } else {
        setRequestError(strings.settings.common.unknownError);
      }
    } finally {
      setRequesting(false);
    }
  }

  async function handleDownload(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/company/backups/${id}/download`);
      const body = (await response.json()) as { ok: boolean; data?: { snapshot: unknown } };
      if (!body.ok || body.data === undefined) {
        setRequestError(strings.settings.common.unknownError);
        return;
      }
      const blob = new Blob([JSON.stringify(body.data.snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kd-backup-${id}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setRequestError(strings.settings.common.unknownError);
    }
  }

  const copy = strings.settings.backups;
  const hasActive =
    backups !== null && backups.some((b) => b.status === "pending" || b.status === "processing");

  if (loadError !== null) {
    return (
      <p
        role="alert"
        className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
      >
        {loadError}
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-display-md">{copy.title}</h1>
        <p className="text-body-md text-muted-foreground">{strings.settings.backups.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{copy.listSection}</CardTitle>
          <CardDescription>{copy.listEmpty}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasActive ? (
            <p role="status" className="text-body-sm text-muted-foreground">
              {copy.oneActive}
            </p>
          ) : null}
          <Button
            type="button"
            size="md"
            variant="outline"
            onClick={handleRequest}
            disabled={requesting || hasActive}
            className="w-full sm:w-auto"
          >
            {requesting ? copy.requesting : copy.request}
          </Button>
          {requestError !== null ? (
            <p role="alert" className="text-destructive text-body-sm">
              {requestError}
            </p>
          ) : null}

          {backups === null ? (
            <p role="status" className="text-body-md text-muted-foreground">
              {copy.listEmpty}
            </p>
          ) : backups.length === 0 ? (
            <p role="status" className="text-body-md text-muted-foreground">
              {copy.listEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {backups.map((item) => (
                <li
                  key={item.id}
                  className="border-border flex flex-col gap-2 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                    {item.status === "ready" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(item.id)}
                      >
                        {copy.download}
                      </Button>
                    ) : null}
                  </div>
                  <dl className="text-body-sm text-muted-foreground grid grid-cols-2 gap-1">
                    <dt>{copy.requestedAt}</dt>
                    <dd className="text-right">
                      {new Date(item.requestedAt).toLocaleDateString()}
                    </dd>
                    {item.expiresAt !== null ? (
                      <>
                        <dt>{copy.expiresAt}</dt>
                        <dd className="text-right">
                          {new Date(item.expiresAt).toLocaleDateString()}
                        </dd>
                      </>
                    ) : null}
                    {item.artifactSizeBytes !== null ? (
                      <>
                        <dt>{copy.statusReady}</dt>
                        <dd className="text-right">{formatBytes(item.artifactSizeBytes)}</dd>
                      </>
                    ) : null}
                  </dl>
                  {item.failureReason !== null ? (
                    <p className="text-body-sm text-destructive">{item.failureReason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
