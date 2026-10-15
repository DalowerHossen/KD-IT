// path: lib/auth/permissions.ts
import { z } from "zod";

import { type AdminStaffBundle, type AuthRole } from "@/lib/auth/roles";

/**
 * Central typed permission registry. Every permission code in the platform
 * is listed exactly once here; later steps add codes through this registry
 * and the database validates rows against it at the application boundary.
 * Codes follow the domain.action convention with optional sub-actions.
 */
export const PERMISSION_CODES = [
  "profile.self.read",
  "profile.self.update",
  "session.self.read",
  "session.self.revoke",
  "session.staff.read",
  "session.staff.revoke",
  "device.self.read",
  "device.self.revoke",
  "device.staff.read",
  "mfa.self.manage",
  "notify.read",
  "notify.preferences.update",
  "team.read",
  "team.invite",
  "team.suspend",
  "team.permissions.manage",
  "team.ownership.transfer",
  "company.profile.read",
  "company.profile.update",
  "company.settings.update",
  "company.security.update",
  "company.directory.read",
  "smtp.tenant.manage",
  "smtp.platform.manage",
  "smtp.test",
  "domain.read",
  "domain.request",
  "domain.verify",
  "billing.plan.read",
  "billing.subscription.manage",
  "billing.coupon.manage",
  "billing.entitlement.read",
  "kyc.own.submit",
  "kyc.own.read",
  "kyc.review",
  "kyc.admin.read",
  "kyc.decide",
  "security.timeline.read",
  "security.account.unlock",
  "backup.request",
  "backup.read",
  "approval.read",
  "approval.l2.decide",
  "approval.l3.decide",
  "bundle.kyc_reviewer",
  "bundle.payment_processor",
  "bundle.support_agent",
  "bundle.content_manager",
  "bundle.compliance_officer",
  "bundle.fraud_analyst",
  "bundle.finance_analyst",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const permissionSchema = z.enum(PERMISSION_CODES);

export type PermissionScope = "platform" | "tenant";

export interface PermissionMetadata {
  readonly scope: PermissionScope;
  readonly description: string;
}

const PERMISSION_METADATA: Readonly<Record<PermissionCode, PermissionMetadata>> = {
  "profile.self.read": { scope: "tenant", description: "Read the signed-in identity profile." },
  "profile.self.update": { scope: "tenant", description: "Update the signed-in identity profile." },
  "session.self.read": { scope: "tenant", description: "List the signed-in sessions." },
  "session.self.revoke": { scope: "tenant", description: "Revoke the signed-in sessions." },
  "session.staff.read": { scope: "tenant", description: "List staff sessions in the company." },
  "session.staff.revoke": { scope: "tenant", description: "Revoke staff sessions in the company." },
  "device.self.read": { scope: "tenant", description: "List the signed-in devices." },
  "device.self.revoke": { scope: "tenant", description: "Revoke the signed-in devices." },
  "device.staff.read": { scope: "tenant", description: "List staff devices in the company." },
  "mfa.self.manage": { scope: "tenant", description: "Manage two-factor enrollment for self." },
  "notify.read": { scope: "tenant", description: "Read in-app notifications." },
  "notify.preferences.update": { scope: "tenant", description: "Update notification preferences." },
  "team.read": { scope: "tenant", description: "Read the company team roster." },
  "team.invite": { scope: "tenant", description: "Invite staff to the company." },
  "team.suspend": { scope: "tenant", description: "Suspend or reactivate company staff." },
  "team.permissions.manage": {
    scope: "tenant",
    description: "Grant or revoke staff permissions.",
  },
  "team.ownership.transfer": { scope: "tenant", description: "Transfer company ownership." },
  "company.profile.read": { scope: "tenant", description: "Read the company profile." },
  "company.profile.update": { scope: "tenant", description: "Propose company profile changes." },
  "company.settings.update": { scope: "tenant", description: "Propose company settings changes." },
  "company.security.update": { scope: "tenant", description: "Propose company security changes." },
  "company.directory.read": {
    scope: "platform",
    description: "Read the tenant company directory.",
  },
  "smtp.tenant.manage": { scope: "tenant", description: "Manage the company SMTP configuration." },
  "smtp.platform.manage": {
    scope: "platform",
    description: "Manage the platform SMTP configuration.",
  },
  "smtp.test": { scope: "tenant", description: "Run a non-destructive SMTP connection test." },
  "domain.read": { scope: "tenant", description: "Read company custom domains." },
  "domain.request": { scope: "tenant", description: "Request a company custom domain." },
  "domain.verify": { scope: "platform", description: "Verify custom domain ownership." },
  "billing.plan.read": { scope: "platform", description: "Read platform subscription plans." },
  "billing.subscription.manage": { scope: "tenant", description: "Manage company subscriptions." },
  "billing.coupon.manage": { scope: "platform", description: "Manage platform coupons." },
  "billing.entitlement.read": { scope: "tenant", description: "Read company entitlements." },
  "kyc.own.submit": { scope: "tenant", description: "Submit the company KYC application." },
  "kyc.own.read": { scope: "tenant", description: "Read the company KYC application." },
  "kyc.review": { scope: "platform", description: "Review KYC applications." },
  "kyc.admin.read": { scope: "platform", description: "Read KYC applications for operations." },
  "kyc.decide": { scope: "platform", description: "Record final KYC decisions." },
  "security.timeline.read": { scope: "platform", description: "Read account security timelines." },
  "security.account.unlock": { scope: "platform", description: "Propose locked-account unlocks." },
  "backup.request": { scope: "tenant", description: "Request an encrypted company backup." },
  "backup.read": { scope: "tenant", description: "Read company backup status." },
  "approval.read": { scope: "tenant", description: "Read approval commands and history." },
  "approval.l2.decide": { scope: "platform", description: "Record CEO-level approval decisions." },
  "approval.l3.decide": {
    scope: "platform",
    description: "Record super-admin final approval decisions.",
  },
  "bundle.kyc_reviewer": { scope: "platform", description: "KYC review permission bundle." },
  "bundle.payment_processor": {
    scope: "platform",
    description: "Payment operations permission bundle.",
  },
  "bundle.support_agent": {
    scope: "platform",
    description: "Support operations permission bundle.",
  },
  "bundle.content_manager": {
    scope: "platform",
    description: "Content operations permission bundle.",
  },
  "bundle.compliance_officer": {
    scope: "platform",
    description: "Compliance operations permission bundle.",
  },
  "bundle.fraud_analyst": { scope: "platform", description: "Fraud review permission bundle." },
  "bundle.finance_analyst": {
    scope: "platform",
    description: "Finance reporting permission bundle.",
  },
};

/** Metadata for a registry permission code. */
export function permissionMetadata(code: PermissionCode): PermissionMetadata {
  return PERMISSION_METADATA[code];
}

/**
 * Role inheritance without string duplication: each tier composes the tier
 * below it with spread, so a code string appears once per tier at most.
 * Tenant and platform tiers never mix: composition only flows inside one
 * scope, which keeps least privilege exact for admin_staff and staff.
 */
const STAFF_BASE_PERMISSIONS: readonly PermissionCode[] = [
  "profile.self.read",
  "profile.self.update",
  "session.self.read",
  "session.self.revoke",
  "device.self.read",
  "device.self.revoke",
  "mfa.self.manage",
  "notify.read",
  "notify.preferences.update",
  "team.read",
  "approval.read",
];

const OWNER_BASE_PERMISSIONS: readonly PermissionCode[] = [
  ...STAFF_BASE_PERMISSIONS,
  "session.staff.read",
  "session.staff.revoke",
  "device.staff.read",
  "team.invite",
  "team.suspend",
  "team.permissions.manage",
  "team.ownership.transfer",
  "company.profile.read",
  "company.profile.update",
  "company.settings.update",
  "company.security.update",
  "smtp.tenant.manage",
  "smtp.test",
  "domain.read",
  "domain.request",
  "billing.subscription.manage",
  "billing.entitlement.read",
  "kyc.own.submit",
  "kyc.own.read",
  "backup.request",
  "backup.read",
];

const ADMIN_STAFF_BASE_PERMISSIONS: readonly PermissionCode[] = [
  "profile.self.read",
  "profile.self.update",
  "session.self.read",
  "session.self.revoke",
  "device.self.read",
  "device.self.revoke",
  "mfa.self.manage",
  "notify.read",
  "notify.preferences.update",
  "approval.read",
];

const CEO_BASE_PERMISSIONS: readonly PermissionCode[] = [
  ...ADMIN_STAFF_BASE_PERMISSIONS,
  "company.profile.update",
  "company.settings.update",
  "company.security.update",
  "company.directory.read",
  "smtp.platform.manage",
  "smtp.test",
  "domain.read",
  "domain.verify",
  "billing.plan.read",
  "billing.subscription.manage",
  "billing.coupon.manage",
  "billing.entitlement.read",
  "kyc.review",
  "kyc.admin.read",
  "security.timeline.read",
  "security.account.unlock",
  "approval.l2.decide",
  "backup.read",
];

const SUPER_ADMIN_BASE_PERMISSIONS: readonly PermissionCode[] = [
  ...CEO_BASE_PERMISSIONS,
  "approval.l3.decide",
  "kyc.decide",
];

export const ROLE_PERMISSIONS: Readonly<Record<AuthRole, readonly PermissionCode[]>> = {
  super_admin: SUPER_ADMIN_BASE_PERMISSIONS,
  ceo: CEO_BASE_PERMISSIONS,
  admin_staff: ADMIN_STAFF_BASE_PERMISSIONS,
  owner: OWNER_BASE_PERMISSIONS,
  staff: STAFF_BASE_PERMISSIONS,
};

/** Default permissions held by a role before explicit grants. */
export function resolveRolePermissions(role: AuthRole): readonly PermissionCode[] {
  return ROLE_PERMISSIONS[role];
}

/** True when the role holds the permission by default. */
export function roleHasPermission(role: AuthRole, code: PermissionCode): boolean {
  return resolveRolePermissions(role).includes(code);
}

/**
 * Permissions unlocked by each admin_staff bundle. A bundle code held as an
 * explicit grant expands to these permissions during evaluation. Bundles
 * with no Step 03 permission stay empty here and are extended by the step
 * that owns their domain.
 */
export const BUNDLE_PERMISSIONS: Readonly<Record<AdminStaffBundle, readonly PermissionCode[]>> = {
  kyc_reviewer: ["kyc.review", "kyc.admin.read"],
  payment_processor: ["billing.subscription.manage", "billing.entitlement.read"],
  support_agent: ["security.timeline.read", "company.directory.read"],
  content_manager: [],
  compliance_officer: ["security.timeline.read", "approval.read", "kyc.admin.read"],
  fraud_analyst: ["security.timeline.read"],
  finance_analyst: ["billing.plan.read", "billing.entitlement.read"],
};

const BUNDLE_GRANT_CODES: Readonly<Record<AdminStaffBundle, PermissionCode>> = {
  kyc_reviewer: "bundle.kyc_reviewer",
  payment_processor: "bundle.payment_processor",
  support_agent: "bundle.support_agent",
  content_manager: "bundle.content_manager",
  compliance_officer: "bundle.compliance_officer",
  fraud_analyst: "bundle.fraud_analyst",
  finance_analyst: "bundle.finance_analyst",
};

/** Grant code that assigns a bundle through the permission-grant store. */
export function bundleGrantCode(bundle: AdminStaffBundle): PermissionCode {
  return BUNDLE_GRANT_CODES[bundle];
}

/**
 * Expands held bundle-grant codes into their permissions in deterministic
 * registry order. Non-bundle codes pass through untouched by callers.
 */
export function expandBundlePermissions(
  held: readonly PermissionCode[],
): readonly PermissionCode[] {
  const expanded = new Set<PermissionCode>();
  const bundles: readonly AdminStaffBundle[] = [
    "kyc_reviewer",
    "payment_processor",
    "support_agent",
    "content_manager",
    "compliance_officer",
    "fraud_analyst",
    "finance_analyst",
  ];
  for (const bundle of bundles) {
    if (held.includes(BUNDLE_GRANT_CODES[bundle])) {
      for (const code of BUNDLE_PERMISSIONS[bundle]) {
        expanded.add(code);
      }
    }
  }
  return [...expanded];
}

export interface SubjectPermissionInput {
  readonly role: AuthRole;
  readonly explicitGrants: readonly PermissionCode[];
}

/**
 * Resolves the effective permission set for a subject: role defaults plus
 * explicit grants plus bundle expansion. Order is deterministic: role
 * order first, then grant order, then bundle order.
 */
export function resolveSubjectPermissions(
  input: SubjectPermissionInput,
): readonly PermissionCode[] {
  const resolved = new Set<PermissionCode>(resolveRolePermissions(input.role));
  for (const code of input.explicitGrants) {
    resolved.add(code);
  }
  for (const code of expandBundlePermissions(input.explicitGrants)) {
    resolved.add(code);
  }
  return [...resolved];
}
