// path: components/auth/logout-button.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";

import { AuthRequestError, postAuth } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/i18n/strings/en";

export interface LogoutButtonProps {
  readonly scope: "current" | "all";
}

/** Signs out of this device or every device, then returns to sign-in. */
export function LogoutButton({ scope }: LogoutButtonProps): ReactElement {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setError(null);
    try {
      await postAuth<{ signedOut: boolean }>("/api/auth/logout", { scope });
    } catch (requestError) {
      if (!(requestError instanceof AuthRequestError)) {
        setError(strings.auth.errors.generic);
        setSigningOut(false);
        return;
      }
    }
    router.push("/login");
    router.refresh();
  }

  const copy = strings.auth.account;
  return (
    <div className="flex flex-col gap-2">
      {error !== null ? (
        <p role="alert" className="text-destructive text-body-sm">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant={scope === "all" ? "destructive" : "outline"}
        size="md"
        disabled={signingOut}
        onClick={() => void handleClick()}
      >
        {signingOut ? copy.loggingOut : scope === "all" ? copy.logoutAllLabel : copy.logoutLabel}
      </Button>
    </div>
  );
}
