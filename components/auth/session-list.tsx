// path: components/auth/session-list.tsx
"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";

import { AuthRequestError, getAuth, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { type AuthSessionListItem } from "@/lib/auth/schemas";
import { strings } from "@/lib/i18n/strings/en";

export interface SessionListProps {
  readonly onExpired: () => void;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Live-session list with per-device revocation. The current session is
 * marked and has no revoke button: signing this device out is the logout
 * action, which also clears cookies instead of only revoking the mirror.
 */
export function SessionList({ onExpired }: SessionListProps): ReactElement {
  const [sessions, setSessions] = useState<readonly AuthSessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAuth<{ sessions: AuthSessionListItem[] }>("/api/auth/sessions");
      setSessions(data.sessions);
      setError(null);
    } catch (loadError) {
      if (loadError instanceof AuthRequestError) {
        onExpired();
      } else {
        setError(strings.auth.errors.generic);
      }
    }
  }, [onExpired]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAuth<{ sessions: AuthSessionListItem[] }>("/api/auth/sessions");
        if (!cancelled) {
          setSessions(data.sessions);
          setError(null);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        if (loadError instanceof AuthRequestError) {
          onExpired();
        } else {
          setError(strings.auth.errors.generic);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onExpired]);

  async function handleRevoke(sessionId: string): Promise<void> {
    if (revokingId !== null) {
      return;
    }
    setRevokingId(sessionId);
    setError(null);
    try {
      await postAuth<{ revoked: boolean }>("/api/auth/sessions/revoke", { sessionId });
      await load();
    } catch (revokeError) {
      if (revokeError instanceof AuthRequestError) {
        onExpired();
      } else {
        setError(strings.auth.errors.generic);
      }
    } finally {
      setRevokingId(null);
    }
  }

  const copy = strings.auth.account;
  if (sessions === null && error === null) {
    return (
      <p role="status" className="text-body-sm text-muted-foreground">
        {copy.sessionsSubtitle}
      </p>
    );
  }
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
  const others = (sessions ?? []).filter((session) => !session.current);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {(sessions ?? []).map((session) => (
          <li
            key={session.id}
            className="border-input flex items-center justify-between gap-4 rounded-md border p-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-body-md font-medium">
                {session.deviceLabel}
                {session.current ? (
                  <span className="bg-success/15 text-success text-body-sm ml-2 rounded-full px-2 py-0.5">
                    {copy.currentBadge}
                  </span>
                ) : null}
              </p>
              <p className="text-body-sm text-muted-foreground">
                {copy.lastActiveLabel}: {formatDateTime(session.lastActivityAt)}
                {session.ipAddress !== null ? ` - ${session.ipAddress}` : ""}
              </p>
            </div>
            {!session.current ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={revokingId !== null}
                onClick={() => void handleRevoke(session.id)}
              >
                {revokingId === session.id ? copy.revokingLabel : copy.revokeLabel}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {others.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{copy.sessionsEmpty}</p>
      ) : null}
    </div>
  );
}
