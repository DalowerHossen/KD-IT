// path: config/nav-map.ts
import {
  CircleUserRound,
  Home,
  KeyRound,
  LayoutGrid,
  LockKeyhole,
  LogIn,
  MailCheck,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";

import { strings } from "@/lib/i18n/strings/en";
import type { NavSection, RouteMeta } from "@/lib/navigation/route-metadata";

/**
 * Central navigation map: the single source of truth for routes, breadcrumb
 * labels, command palette entries, and menu composition. Every implemented
 * route is registered here, and scripts/check-nav-routes.mjs proves that no
 * registered path or internal link is dead. Page-owning steps register their
 * complete routes here; routes without pages are never registered.
 */
export const NAV_MAP: readonly RouteMeta[] = [
  {
    path: "/",
    title: "Home",
    description: "KD SOLUTION IT platform overview and foundation status.",
    section: "public",
    icon: Home,
    showInNav: true,
    keywords: ["start", "overview", "platform"],
  },
  {
    path: "/design-system",
    title: strings.designSystem.title,
    description: strings.designSystem.description,
    section: "public",
    icon: LayoutGrid,
    showInNav: true,
    keywords: ["tokens", "components", "primitives", "reference"],
  },
  {
    path: "/login",
    title: strings.auth.login.title,
    description: strings.auth.login.subtitle,
    section: "auth",
    icon: LogIn,
    showInNav: false,
    keywords: ["sign in", "login", "authentication"],
  },
  {
    path: "/signup",
    title: strings.auth.signup.title,
    description: strings.auth.signup.subtitle,
    section: "auth",
    icon: UserPlus,
    showInNav: false,
    keywords: ["sign up", "register", "account"],
  },
  {
    path: "/forgot-password",
    title: strings.auth.forgotPassword.title,
    description: strings.auth.forgotPassword.subtitle,
    section: "auth",
    icon: KeyRound,
    showInNav: false,
    keywords: ["recovery", "reset", "password"],
  },
  {
    path: "/reset-password",
    title: strings.auth.resetPassword.title,
    description: strings.auth.resetPassword.subtitle,
    section: "auth",
    icon: LockKeyhole,
    showInNav: false,
    keywords: ["recovery", "reset", "password"],
  },
  {
    path: "/verify-email",
    title: strings.auth.verifyEmail.title,
    description: strings.auth.verifyEmail.subtitle,
    section: "auth",
    icon: MailCheck,
    showInNav: false,
    keywords: ["verification", "email", "confirm"],
  },
  {
    path: "/account",
    title: strings.auth.account.title,
    description: strings.auth.account.subtitle,
    section: "dashboard",
    icon: CircleUserRound,
    showInNav: false,
    keywords: ["account", "sessions", "password", "profile"],
  },
  {
    path: "/team",
    title: strings.team.title,
    description: strings.team.subtitle,
    section: "dashboard",
    icon: Users,
    showInNav: true,
    keywords: ["team", "members", "roles", "invite", "access"],
  },
  {
    path: "/security/mfa",
    title: strings.mfa.title,
    description: strings.mfa.subtitle,
    section: "dashboard",
    icon: KeyRound,
    showInNav: true,
    keywords: ["security", "two-factor", "2fa", "totp", "mfa", "backup codes"],
  },
  {
    path: "/settings",
    title: strings.settings.index.title,
    description: strings.settings.index.subtitle,
    section: "dashboard",
    icon: Settings,
    showInNav: true,
    keywords: [
      "settings",
      "workspace",
      "configuration",
      "profile",
      "invoice",
      "domains",
      "backups",
      "kyc",
      "notifications",
    ],
  },
  {
    path: "/settings/profile",
    title: strings.settings.profile.title,
    description: strings.settings.profile.subtitle,
    section: "dashboard",
    icon: Settings,
    showInNav: false,
    keywords: ["profile", "company", "contact", "address", "preferences"],
  },
  {
    path: "/settings/invoice",
    title: strings.settings.invoice.title,
    description: strings.settings.invoice.subtitle,
    section: "dashboard",
    icon: Settings,
    showInNav: false,
    keywords: ["invoice", "billing", "tax", "terms", "footer"],
  },
  {
    path: "/settings/domains",
    title: strings.settings.domains.title,
    description: strings.settings.domains.subtitle,
    section: "dashboard",
    icon: Settings,
    showInNav: false,
    keywords: ["domain", "custom domain", "dns", "verification", "txt record"],
  },
  {
    path: "/settings/backups",
    title: strings.settings.backups.title,
    description: strings.settings.backups.subtitle,
    section: "dashboard",
    icon: Settings,
    showInNav: false,
    keywords: ["backup", "export", "download", "restore", "archive"],
  },
  {
    path: "/settings/kyc",
    title: strings.settings.kyc.title,
    description: strings.settings.kyc.subtitle,
    section: "dashboard",
    icon: Settings,
    showInNav: false,
    keywords: ["kyc", "identity", "verification", "sanctions", "documents"],
  },
  {
    path: "/settings/notifications",
    title: strings.settings.notifications.title,
    description: strings.settings.notifications.subtitle,
    section: "dashboard",
    icon: Settings,
    showInNav: false,
    keywords: ["notifications", "inbox", "alerts", "activity"],
  },
];

/** Composes visible navigation sections for a shell from the map. */
export function getNavSection(section: RouteMeta["section"]): NavSection {
  return {
    id: section,
    items: NAV_MAP.filter((entry) => entry.section === section && entry.showInNav),
  };
}
