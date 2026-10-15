// path: components/team/team-manager.tsx
"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from "react";

import {
  AuthRequestError,
  getAuth,
  groupIssuesByField,
  postAuth,
} from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_ROLES } from "@/lib/auth/roles";
import { type MembershipListItem } from "@/lib/auth/schemas";
import { strings } from "@/lib/i18n/strings/en";

const t = strings.team;

function roleLabel(role: string): string {
  return t.roles[role as keyof typeof t.roles] ?? role;
}

function statusLabel(status: string): string {
  return t.statusValues[status as keyof typeof t.statusValues] ?? status;
}

interface MembersData {
  readonly members: readonly MembershipListItem[];
}

/**
 * Team management surface: lists the working company's members and proposes
 * invites, role changes, and suspensions. Every mutation is an approval
 * command -- the UI reports "proposed, pending approval" and reloads the list
 * so approved changes appear once executed.
 */
export function TeamManager(): ReactElement {
  const [members, setMembers] = useState<readonly MembershipListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAuth<MembersData>("/api/company/members");
      setMembers(data.members);
      setError(null);
    } catch (loadError) {
      if (loadError instanceof AuthRequestError) {
        setError(loadError.message);
      } else {
        setError(strings.auth.errors.generic);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Invite form state.
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<string>(AUTH_ROLES.at(-1) ?? "staff");
  const [inviteReason, setInviteReason] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteDone, setInviteDone] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Per-member action state (single in-flight action).
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});

  async function handleInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (inviteBusy) return;
    setInviteBusy(true);
    setInviteError(null);
    setInviteDone(false);
    try {
      await postAuth("/api/company/members/invite", {
        userId: inviteUserId,
        role: inviteRole,
        ...(inviteReason.trim() === "" ? {} : { reason: inviteReason.trim() }),
      });
      setInviteDone(true);
      setInviteUserId("");
      setInviteReason("");
      await load();
    } catch (inviteRequestError) {
      if (inviteRequestError instanceof AuthRequestError) {
        const fieldErrors = groupIssuesByField(inviteRequestError.issues);
        setInviteError(Object.values(fieldErrors)[0] ?? inviteRequestError.message);
      } else {
        setInviteError(strings.auth.errors.generic);
      }
    } finally {
      setInviteBusy(false);
    }
  }

  async function proposeRole(membershipId: string, role: string, version: number): Promise<void> {
    if (busyId !== null) return;
    setBusyId(membershipId);
    setNotices((prev) => ({ ...prev, [membershipId]: "" }));
    try {
      await postAuth("/api/company/members/update-role", {
        membershipId,
        role,
        expectedVersion: version,
      });
      setNotices((prev) => ({ ...prev, [membershipId]: t.proposed }));
      await load();
    } catch (actionError) {
      setNotices((prev) => ({
        ...prev,
        [membershipId]:
          actionError instanceof AuthRequestError
            ? actionError.message
            : strings.auth.errors.generic,
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function proposeSuspend(membershipId: string, version: number): Promise<void> {
    if (busyId !== null) return;
    setBusyId(membershipId);
    setNotices((prev) => ({ ...prev, [membershipId]: "" }));
    try {
      await postAuth("/api/company/members/suspend", {
        membershipId,
        expectedVersion: version,
      });
      setNotices((prev) => ({ ...prev, [membershipId]: t.proposed }));
      await load();
    } catch (actionError) {
      setNotices((prev) => ({
        ...prev,
        [membershipId]:
          actionError instanceof AuthRequestError
            ? actionError.message
            : strings.auth.errors.generic,
      }));
    } finally {
      setBusyId(null);
    }
  }

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

      <Card>
        <CardHeader>
          <CardTitle>{t.membersTitle}</CardTitle>
          <CardDescription>{t.membersEmpty}</CardDescription>
        </CardHeader>
        <CardContent>
          {members === null ? (
            <p role="status" className="text-body-sm text-muted-foreground">
              {t.membersEmpty}
            </p>
          ) : members.length === 0 ? (
            <p role="status" className="text-body-sm text-muted-foreground">
              {t.membersEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="border-input flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-body-md font-medium">
                      {member.displayName ?? member.userId}
                      <span className="bg-muted text-body-sm ml-2 rounded-full px-2 py-0.5">
                        {statusLabel(member.status)}
                      </span>
                    </p>
                    <p className="text-body-sm text-muted-foreground">
                      {t.roleLabel}: {roleLabel(member.role)}
                    </p>
                    {notices[member.id] !== undefined && notices[member.id] !== "" ? (
                      <p role="status" className="text-body-sm text-muted-foreground">
                        {notices[member.id]}
                      </p>
                    ) : null}
                  </div>
                  {member.status === "active" || member.status === "invited" ? (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`${t.changeRoleLabel}: ${member.displayName ?? member.userId}`}
                        className="border-input bg-background text-body-sm h-9 rounded-md border px-2"
                        defaultValue={member.role}
                        disabled={busyId !== null}
                        onChange={(event) =>
                          void proposeRole(member.id, event.target.value, member.version)
                        }
                      >
                        {AUTH_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId !== null}
                        onClick={() => void proposeSuspend(member.id, member.version)}
                      >
                        {t.suspendLabel}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.inviteTitle}</CardTitle>
          <CardDescription>{t.inviteSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-4" noValidate>
            {inviteDone ? (
              <p
                role="status"
                className="border-success/40 bg-success/10 text-body-sm rounded-md border p-3"
              >
                {t.invited}
              </p>
            ) : null}
            {inviteError !== null ? (
              <p
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
              >
                {inviteError}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-invite-user">{t.userIdLabel}</Label>
              <Input
                id="team-invite-user"
                name="userId"
                type="text"
                required
                value={inviteUserId}
                onChange={(event) => setInviteUserId(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-invite-role">{t.roleSelectLabel}</Label>
              <select
                id="team-invite-role"
                name="role"
                className="border-input bg-background text-body-sm h-11 rounded-md border px-3"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
              >
                {AUTH_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-invite-reason">{t.reasonLabel}</Label>
              <Input
                id="team-invite-reason"
                name="reason"
                type="text"
                value={inviteReason}
                onChange={(event) => setInviteReason(event.target.value)}
              />
            </div>
            <Button type="submit" size="md" className="w-full sm:w-auto" disabled={inviteBusy}>
              {inviteBusy ? t.inviting : t.inviteSubmit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
