// path: lib/providers/session-provider.tsx
"use client";

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react";

import type { AppRole, PermissionCode } from "@/lib/navigation/route-metadata";

export interface SessionUser {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: AppRole;
  readonly permissions: readonly PermissionCode[];
}

export type SessionState =
  { readonly status: "signed-out" } | { readonly status: "signed-in"; readonly user: SessionUser };

const SIGNED_OUT_SESSION: SessionState = { status: "signed-out" };

const SessionContext = createContext<SessionState>(SIGNED_OUT_SESSION);

export interface SessionProviderProps {
  /**
   * Current session snapshot. Step 03 hydrates this from the server session;
   * until then every visitor is signed out, which is a complete and truthful
   * state for the foundation shell.
   */
  readonly session?: SessionState;
  readonly children: ReactNode;
}

export function SessionProvider({ session, children }: SessionProviderProps): ReactElement {
  const value = useMemo<SessionState>(() => session ?? SIGNED_OUT_SESSION, [session]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
