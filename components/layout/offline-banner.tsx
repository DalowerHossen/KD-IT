// path: components/layout/offline-banner.tsx
"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { strings } from "@/lib/i18n/strings/en";

/** Offline detection banner announced politely when connectivity drops. */
export function OfflineBanner(): ReactElement | null {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = (): void => setIsOffline(!window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      className="z-raised border-warning/50 bg-warning text-body-sm text-warning-foreground sticky top-0 flex items-center justify-center gap-2 border-b px-4 py-2 text-center font-medium"
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span>
        {strings.offline.title}. {strings.offline.description}
      </span>
    </div>
  );
}
