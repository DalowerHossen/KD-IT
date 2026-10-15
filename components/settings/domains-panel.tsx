// path: components/settings/domains-panel.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from "react";

import { AuthRequestError, getAuth, postAuth } from "@/components/auth/auth-client";
import { TextField } from "@/components/settings/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { strings } from "@/lib/i18n/strings/en";

interface DomainView {
  readonly id: string;
  readonly domain: string;
  readonly status: "pending" | "verified" | "rejected";
  readonly recordName: string;
  readonly recordType: "TXT";
  readonly recordValue: string;
  readonly verifiedAt: string | null;
  readonly failureReason: string | null;
}

function statusLabel(status: DomainView["status"]): string {
  const copy = strings.settings.domains;
  if (status === "pending") {
    return copy.statusPending;
  }
  if (status === "verified") {
    return copy.statusVerified;
  }
  return copy.statusRejected;
}

function statusVariant(status: DomainView["status"]): "secondary" | "success" | "destructive" {
  if (status === "verified") {
    return "success";
  }
  if (status === "rejected") {
    return "destructive";
  }
  return "secondary";
}

/** Lists the workspace's custom domains and claims new ones. */
export function DomainsPanel(): ReactElement {
  const router = useRouter();
  const [domains, setDomains] = useState<DomainView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const handleExpired = useCallback(() => {
    router.push("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    getAuth<{ domains: DomainView[] }>("/api/company/domains")
      .then((data) => {
        if (!cancelled) {
          setDomains(data.domains);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof AuthRequestError && error.message === "Session expired") {
          handleExpired();
        } else {
          setLoadError(strings.settings.common.unknownError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handleExpired]);

  async function handleRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (requesting) {
      return;
    }
    setRequesting(true);
    setRequestError(null);
    try {
      const created = await postAuth<DomainView>("/api/company/domains", { domain });
      setDomains((current) => (current === null ? current : [created, ...current]));
      setDomain("");
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

  const copy = strings.settings;

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
        <h1 className="text-display-md">{copy.domains.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.domains.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{copy.domains.requestSection}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleRequest}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            noValidate
          >
            <div className="flex-1">
              <TextField
                id="domain-input"
                label={copy.domains.domainLabel}
                placeholder={copy.domains.domainPlaceholder}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                aria-label={copy.domains.domainLabel}
              />
            </div>
            <Button
              type="submit"
              size="md"
              disabled={requesting || domain.trim() === ""}
              className="w-full sm:w-auto"
            >
              {requesting ? copy.domains.requesting : copy.domains.request}
            </Button>
          </form>
          {requestError !== null ? (
            <p role="alert" className="text-destructive text-body-sm mt-2">
              {requestError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.domains.listSection}</CardTitle>
          <CardDescription>{copy.domains.listEmpty}</CardDescription>
        </CardHeader>
        <CardContent>
          {domains === null ? (
            <p role="status" className="text-body-md text-muted-foreground">
              {copy.domains.listEmpty}
            </p>
          ) : domains.length === 0 ? (
            <p role="status" className="text-body-md text-muted-foreground">
              {copy.domains.listEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {domains.map((item) => (
                <li
                  key={item.id}
                  className="border-border flex flex-col gap-2 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-md font-medium">{item.domain}</span>
                    <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                  </div>
                  {item.status === "pending" ? (
                    <div className="text-body-sm text-muted-foreground flex flex-col gap-1">
                      <span>{copy.domains.instructions}</span>
                      <code className="bg-muted text-body-sm rounded px-2 py-1 break-all">
                        {item.recordName} = {item.recordValue}
                      </code>
                    </div>
                  ) : null}
                  {item.status === "verified" && item.verifiedAt !== null ? (
                    <p className="text-body-sm text-muted-foreground">
                      {copy.domains.verifiedAt} {new Date(item.verifiedAt).toLocaleDateString()}
                    </p>
                  ) : null}
                  {item.status === "rejected" && item.failureReason !== null ? (
                    <p className="text-body-sm text-destructive">
                      {copy.domains.failureReason}: {item.failureReason}
                    </p>
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
