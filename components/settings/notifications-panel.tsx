// path: components/settings/notifications-panel.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactElement } from "react";

import { AuthRequestError, getAuth, postAuth } from "@/components/auth/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { strings } from "@/lib/i18n/strings/en";

interface NotificationRow {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}

function timeAgo(
  iso: string,
  t: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string },
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return t.justNow;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t.minutesAgo.replace("%s", String(minutes));
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t.hoursAgo.replace("%s", String(hours));
  }
  const days = Math.floor(hours / 24);
  return t.daysAgo.replace("%s", String(days));
}

/** Lists the signed-in user's notification inbox and marks items read. */
export function NotificationsPanel(): ReactElement {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  const copy = strings.settings.notifications;
  const common = strings.settings.common;

  const handleExpired = useCallback(() => {
    router.push("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    getAuth<{ notifications: NotificationRow[]; unread: number }>("/api/notifications")
      .then((data) => {
        if (!cancelled) {
          setNotifications(data.notifications);
          setUnread(data.unread);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof AuthRequestError && error.message === "Session expired") {
          handleExpired();
        } else {
          setLoadError(common.unknownError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handleExpired, common.unknownError]);

  async function handleMarkRead(id: string): Promise<void> {
    setMarking(id);
    try {
      await postAuth<{ ok: boolean }>("/api/notifications/mark-read", { notificationId: id });
      setNotifications((current) =>
        current === null
          ? current
          : current.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnread((current) => (current === null || current <= 0 ? current : current - 1));
    } catch {
      /* the list still reflects server truth on the next load */
    } finally {
      setMarking(null);
    }
  }

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
  if (!loaded) {
    return (
      <p role="status" className="text-body-md text-muted-foreground">
        {copy.subtitle}
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-display-md">{copy.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{copy.title}</span>
            {unread !== null && unread > 0 ? (
              <Badge variant="secondary" aria-label={`${unread} ${copy.unread}`}>
                {unread} {copy.unread}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications === null || notifications.length === 0 ? (
            <p role="status" className="text-body-md text-muted-foreground">
              {copy.empty}
            </p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {notifications.map((item) => {
                const isUnread = item.readAt === null;
                return (
                  <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`text-body-md ${isUnread ? "font-semibold" : "text-muted-foreground font-normal"}`}
                      >
                        {item.title}
                      </span>
                      {item.body !== null ? (
                        <span className="text-body-sm text-muted-foreground">{item.body}</span>
                      ) : null}
                      <span className="text-body-sm text-muted-foreground">
                        {timeAgo(item.createdAt, copy)}
                      </span>
                    </div>
                    {isUnread ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleMarkRead(item.id)}
                        disabled={marking === item.id}
                      >
                        {copy.markRead}
                      </Button>
                    ) : (
                      <span className="text-body-sm text-muted-foreground">{copy.readLabel}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
