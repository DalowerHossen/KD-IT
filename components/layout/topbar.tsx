// path: components/layout/topbar.tsx
"use client";

import { LogOut, PanelLeft, Settings } from "lucide-react";
import type { ReactElement } from "react";

import { NavBreadcrumbs } from "@/components/layout/nav-breadcrumbs";
import { CommandTrigger } from "@/components/navigation/command-trigger";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { strings } from "@/lib/i18n/strings/en";

export interface ShellUser {
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl?: string;
  readonly roleLabel?: string;
}

export interface TopbarProps {
  /** When provided, renders the mobile menu button wired to this handler. */
  readonly onMobileMenuClick?: () => void;
  /** When provided, renders the account menu; callbacks carry the actions. */
  readonly user?: ShellUser;
  readonly onOpenSettings?: () => void;
  readonly onSignOut?: () => void;
}

/** Sticky application top bar: breadcrumbs, command palette, theme, account. */
export function Topbar({
  onMobileMenuClick,
  user,
  onOpenSettings,
  onSignOut,
}: TopbarProps): ReactElement {
  return (
    <header
      aria-label={strings.shell.topbarLabel}
      className="z-header h-topbar bg-card/80 sticky top-0 flex items-center gap-2 border-b px-3 backdrop-blur-sm sm:px-4"
    >
      {onMobileMenuClick === undefined ? null : (
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMobileMenuClick}
          aria-label={strings.actions.openMenu}
        >
          <PanelLeft aria-hidden="true" />
        </Button>
      )}
      <div className="hidden min-w-0 flex-1 items-center md:flex">
        <NavBreadcrumbs />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <CommandTrigger />
        <ThemeToggle />
        {user === undefined ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.shell.userMenuLabel}
                className="rounded-full"
              >
                <Avatar className="size-9">
                  {user.avatarUrl === undefined ? null : (
                    <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                  )}
                  <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <span className="flex flex-col gap-0.5">
                  <span className="text-body-sm text-foreground font-semibold">
                    {user.displayName}
                  </span>
                  <span className="text-caption text-muted-foreground font-normal">
                    {user.email}
                  </span>
                  {user.roleLabel === undefined ? null : (
                    <span className="text-caption text-muted-foreground font-normal">
                      {user.roleLabel}
                    </span>
                  )}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {onOpenSettings === undefined ? null : (
                <DropdownMenuItem onClick={onOpenSettings}>
                  <Settings aria-hidden="true" />
                  {strings.shell.accountSettings}
                </DropdownMenuItem>
              )}
              {onSignOut === undefined ? null : (
                <DropdownMenuItem onClick={onSignOut}>
                  <LogOut aria-hidden="true" />
                  {strings.shell.signOut}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
