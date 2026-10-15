// path: lib/auth/schemas.ts
import { z } from "zod";

import { passwordSchema } from "@/lib/auth/password-policy";
import { authRoleSchema } from "@/lib/auth/roles";
import { permissionSchema } from "@/lib/auth/permissions";
import { normalizeToCanonicalUsd, type UsdAmount } from "@/lib/money/usd";
import {
  emailSchema,
  genericUuidSchema,
  optimisticVersionSchema,
  plainTextSchema,
  safeRedirectPathSchema,
  uuidV7Schema,
} from "@/lib/validation/zod-helpers";

/**
 * Shared identity and authorization schemas. Client and server validate
 * the same strict contracts; every object rejects unknown fields.
 */

const contractColumns = {
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
  version: z.number().int().min(1),
};

const hex64Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const profileStatusSchema = z.enum([
  "pending_verification",
  "pending_approval",
  "active",
  "suspended",
  "deactivated",
]);
export type ProfileStatus = z.infer<typeof profileStatusSchema>;

export const profileRowSchema = z.strictObject({
  ...contractColumns,
  user_id: genericUuidSchema,
  display_name: z.string().min(1).max(120),
  status: profileStatusSchema,
  status_reason: z.string().nullable(),
  deactivated_at: z.string().datetime().nullable(),
});
export type ProfileRow = z.infer<typeof profileRowSchema>;

export const permissionGrantRowSchema = z.strictObject({
  ...contractColumns,
  subject_user_id: genericUuidSchema,
  permission: permissionSchema,
  granted_by: genericUuidSchema,
  command_id: uuidV7Schema.nullable(),
  reason: z.string().nullable(),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
  revoked_by: genericUuidSchema.nullable(),
});
export type PermissionGrantRow = z.infer<typeof permissionGrantRowSchema>;

export const authDeviceRowSchema = z.strictObject({
  ...contractColumns,
  user_id: genericUuidSchema,
  device_key_hash: hex64Schema,
  display_label: z.string().min(1).max(120),
  platform: z.string().nullable(),
  last_ip: z.string().nullable(),
  last_seen_at: z.string().datetime(),
  trusted_until: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
  revoked_reason: z.string().nullable(),
});
export type AuthDeviceRow = z.infer<typeof authDeviceRowSchema>;

export const authSessionRowSchema = z.strictObject({
  ...contractColumns,
  user_id: genericUuidSchema,
  device_id: uuidV7Schema.nullable(),
  provider_session_ref: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent_hash: hex64Schema.nullable(),
  last_activity_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  revoked_at: z.string().datetime().nullable(),
  revocation_reason: z.string().nullable(),
});
export type AuthSessionRow = z.infer<typeof authSessionRowSchema>;

export const authFactorSchema = z.enum(["password", "totp", "backup_code", "oauth", "recovery"]);
export type AuthFactor = z.infer<typeof authFactorSchema>;

export const authOutcomeSchema = z.enum(["success", "failure"]);
export type AuthOutcome = z.infer<typeof authOutcomeSchema>;

export const authAttemptRowSchema = z.strictObject({
  ...contractColumns,
  subject_hash: hex64Schema,
  user_id: genericUuidSchema.nullable(),
  factor: authFactorSchema,
  outcome: authOutcomeSchema,
  failure_reason_code: z.string().nullable(),
  locked_after: z.boolean(),
  ip_address: z.string().nullable(),
  user_agent_hash: hex64Schema.nullable(),
});
export type AuthAttemptRow = z.infer<typeof authAttemptRowSchema>;

export const authLockRowSchema = z.strictObject({
  ...contractColumns,
  subject_hash: hex64Schema,
  user_id: genericUuidSchema.nullable(),
  consecutive_failures: z.number().int().min(0),
  locked_until: z.string().datetime().nullable(),
  lock_count: z.number().int().min(0),
  last_failure_at: z.string().datetime().nullable(),
  unlocked_by: genericUuidSchema.nullable(),
  unlock_command_id: uuidV7Schema.nullable(),
  unlock_reason: z.string().nullable(),
});
export type AuthLockRow = z.infer<typeof authLockRowSchema>;

export const assignRoleInputSchema = z.strictObject({
  companyId: uuidV7Schema,
  subjectUserId: genericUuidSchema,
  role: authRoleSchema,
  commandId: uuidV7Schema,
  expectedVersion: optimisticVersionSchema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type AssignRoleInput = z.infer<typeof assignRoleInputSchema>;

export const grantPermissionInputSchema = z.strictObject({
  companyId: uuidV7Schema,
  subjectUserId: genericUuidSchema,
  permission: permissionSchema,
  commandId: uuidV7Schema,
  validUntil: z.string().datetime().optional(),
  reason: plainTextSchema(280, "Reason").optional(),
});
export type GrantPermissionInput = z.infer<typeof grantPermissionInputSchema>;

export const revokePermissionInputSchema = z.strictObject({
  grantId: uuidV7Schema,
  expectedVersion: optimisticVersionSchema,
  commandId: uuidV7Schema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type RevokePermissionInput = z.infer<typeof revokePermissionInputSchema>;

export const updateProfileInputSchema = z.strictObject({
  displayName: plainTextSchema(120, "Display name").optional(),
  expectedVersion: optimisticVersionSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

// ---------------------------------------------------------------------------
// Substep B: authentication lifecycle inputs. Login accepts any non-empty
// password (policy errors at login would add no security); the policy
// applies everywhere a password is set. Schemas stay client-safe so pages
// validate with the same contracts as the routes.
// ---------------------------------------------------------------------------

export const signupInputSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: plainTextSchema(120, "Display name"),
  turnstileToken: z.string().max(2000).optional(),
});
export type SignupInput = z.infer<typeof signupInputSchema>;

export const loginInputSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, "A password is required.").max(256),
  next: safeRedirectPathSchema.optional(),
  turnstileToken: z.string().max(2000).optional(),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const resendVerificationInputSchema = z.strictObject({
  email: emailSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationInputSchema>;

export const recoveryRequestInputSchema = z.strictObject({
  email: emailSchema,
});
export type RecoveryRequestInput = z.infer<typeof recoveryRequestInputSchema>;

export const passwordUpdateInputSchema = z.strictObject({
  password: passwordSchema,
});
export type PasswordUpdateInput = z.infer<typeof passwordUpdateInputSchema>;

export const passwordChangeInputSchema = z.strictObject({
  currentPassword: z.string().min(1, "The current password is required.").max(256),
  newPassword: passwordSchema,
});
export type PasswordChangeInput = z.infer<typeof passwordChangeInputSchema>;

export const logoutInputSchema = z.strictObject({
  scope: z.enum(["current", "all"]),
});
export type LogoutInput = z.infer<typeof logoutInputSchema>;

export const revokeSessionInputSchema = z.strictObject({
  sessionId: genericUuidSchema,
});
export type RevokeSessionInput = z.infer<typeof revokeSessionInputSchema>;

export const authCallbackQuerySchema = z
  .strictObject({
    code: z.string().min(1).max(2000).optional(),
    token_hash: z.string().min(1).max(2000).optional(),
    type: z.enum(["signup", "recovery"]).optional(),
    // Present when the callback lands from an OAuth provider: "oauth" for a
    // sign-in, "oauth-link" for linking a provider identity to an existing
    // account. Absent for email verification and recovery links.
    mode: z.enum(["oauth", "oauth-link"]).optional(),
    next: safeRedirectPathSchema.optional(),
  })
  .refine((value) => value.code !== undefined || value.token_hash !== undefined, {
    message: "A verification code is required.",
  })
  .refine((value) => value.token_hash === undefined || value.type !== undefined, {
    message: "Link type is required.",
  });
export type AuthCallbackQuery = z.infer<typeof authCallbackQuerySchema>;

export const authSessionListItemSchema = z.strictObject({
  id: genericUuidSchema,
  deviceLabel: z.string().min(1).max(120),
  platform: z.string().max(60).nullable(),
  ipAddress: z.string().max(64).nullable(),
  createdAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  current: z.boolean(),
});
export type AuthSessionListItem = z.infer<typeof authSessionListItemSchema>;

// ---------------------------------------------------------------------------
// Substep C: membership and role management. A membership binds a user to a
// company with a role. Only an "active" membership -- reachable only through
// an approved command -- confers a role; invited, suspended, and revoked
// bindings confer none. Every mutation is command-gated and audited.
// ---------------------------------------------------------------------------

export const membershipStatusSchema = z.enum(["invited", "active", "suspended", "revoked"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const companyStatusSchema = z.enum(["active", "suspended", "archived"]);
export type CompanyStatus = z.infer<typeof companyStatusSchema>;

export const membershipRowSchema = z.strictObject({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  user_id: genericUuidSchema,
  role: authRoleSchema,
  status: membershipStatusSchema,
  invited_by: genericUuidSchema.nullable(),
  invited_at: z.string().datetime().nullable(),
  activated_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
  version: z.number().int().min(1),
});
export type MembershipRow = z.infer<typeof membershipRowSchema>;

/** Team-listing item: membership joined with the member's display name. */
export const membershipListItemSchema = z.strictObject({
  id: uuidV7Schema,
  userId: genericUuidSchema,
  displayName: z.string().min(1).max(120).nullable(),
  role: authRoleSchema,
  status: membershipStatusSchema,
  activatedAt: z.string().datetime().nullable(),
  version: z.number().int().min(1),
});
export type MembershipListItem = z.infer<typeof membershipListItemSchema>;

export const inviteMembershipInputSchema = z.strictObject({
  companyId: uuidV7Schema,
  userId: genericUuidSchema,
  role: authRoleSchema,
  commandId: uuidV7Schema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type InviteMembershipInput = z.infer<typeof inviteMembershipInputSchema>;

export const updateMembershipRoleInputSchema = z.strictObject({
  companyId: uuidV7Schema,
  membershipId: uuidV7Schema,
  role: authRoleSchema,
  expectedVersion: optimisticVersionSchema,
  commandId: uuidV7Schema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleInputSchema>;

export const suspendMembershipInputSchema = z.strictObject({
  companyId: uuidV7Schema,
  membershipId: uuidV7Schema,
  expectedVersion: optimisticVersionSchema,
  commandId: uuidV7Schema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type SuspendMembershipInput = z.infer<typeof suspendMembershipInputSchema>;

// Public proposal request bodies. The companyId and commandId are injected
// server-side (from the working context and the created command), so clients
// never name the company or a command they did not create.
export const inviteMemberRequestSchema = z.strictObject({
  userId: genericUuidSchema,
  role: authRoleSchema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const updateMemberRoleRequestSchema = z.strictObject({
  membershipId: uuidV7Schema,
  role: authRoleSchema,
  expectedVersion: optimisticVersionSchema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

export const suspendMemberRequestSchema = z.strictObject({
  membershipId: uuidV7Schema,
  expectedVersion: optimisticVersionSchema,
  reason: plainTextSchema(280, "Reason").optional(),
});
export type SuspendMemberRequest = z.infer<typeof suspendMemberRequestSchema>;

export const executeMemberCommandRequestSchema = z.strictObject({
  commandId: uuidV7Schema,
});
export type ExecuteMemberCommandRequest = z.infer<typeof executeMemberCommandRequestSchema>;

// ---------------------------------------------------------------------------
// Substep I: company onboarding (tenant provisioning).
export const companyCreateInputSchema = z.strictObject({
  legalName: plainTextSchema(200, "Legal name"),
  displayName: plainTextSchema(200, "Display name"),
  planId: uuidV7Schema.optional(),
  ownerUserId: genericUuidSchema,
});
export type CompanyCreateInput = z.infer<typeof companyCreateInputSchema>;

export const executeCompanyCommandRequestSchema = z.strictObject({
  commandId: uuidV7Schema,
});
export type ExecuteCompanyCommandRequest = z.infer<typeof executeCompanyCommandRequestSchema>;

// Substep J: notification inbox.
export const markNotificationReadRequestSchema = z.strictObject({
  notificationId: uuidV7Schema,
});
export type MarkNotificationReadRequest = z.infer<typeof markNotificationReadRequestSchema>;

// ---------------------------------------------------------------------------
// Substep K: platform coupon catalog. Money values are normalized to the
// canonical USD decimal-string contract (lib/money) at the boundary so binary
// floating point never enters the coupon pipeline.
// ---------------------------------------------------------------------------
const couponCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,40}$/, "Code must be 3-40 letters, digits, '-' or '_'.")
  .transform((value) => value.toUpperCase());

const nonNegativeUsdSchema = z
  .string()
  .transform((value) => normalizeToCanonicalUsd(value))
  .refine(
    (value): value is UsdAmount => value !== null && !value.startsWith("-"),
    "Value must be a non-negative decimal string.",
  );

export const couponIssueInputSchema = z.strictObject({
  code: couponCodeSchema,
  type: z.enum(["percent", "fixed"]),
  value: nonNegativeUsdSchema,
  maxUses: z.number().int().min(1).max(1_000_000).optional(),
  minOrderAmount: nonNegativeUsdSchema.optional(),
  appliesToPlanId: uuidV7Schema.optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
export type CouponIssueInput = z.infer<typeof couponIssueInputSchema>;

export const couponRedeemRequestSchema = z.strictObject({
  code: z
    .string()
    .min(1)
    .max(40)
    .transform((value) => value.toUpperCase()),
  orderAmount: nonNegativeUsdSchema,
  appliesToPlanId: uuidV7Schema.optional(),
});
export type CouponRedeemRequest = z.infer<typeof couponRedeemRequestSchema>;

export const couponStatusBodySchema = z.strictObject({
  status: z.enum(["active", "inactive"]),
});
export type CouponStatusBody = z.infer<typeof couponStatusBodySchema>;

// ---------------------------------------------------------------------------
// Substep L: tenant profile and invoice settings (one row per workspace).
// Optional text fields accept null (clear) or a trimmed string; required
// fields are always present. Money (tax rate) is a canonical USD string.
// ---------------------------------------------------------------------------
const settingsText = (max: number, label: string): z.ZodType<string> =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, `${label} is required.`).max(max, `${label} is too long.`));
const settingsTextOptional = (max: number, label: string): z.ZodType<string | null> =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max, `${label} is too long.`))
    .nullable();

export const companyProfileUpdateSchema = z.strictObject({
  tagline: settingsTextOptional(200, "Tagline"),
  logoUrl: settingsTextOptional(500, "Logo URL"),
  website: settingsTextOptional(300, "Website"),
  contactName: settingsTextOptional(100, "Contact name"),
  contactEmail: emailSchema.nullable(),
  addressLine1: settingsTextOptional(200, "Address line"),
  city: settingsTextOptional(100, "City"),
  region: settingsTextOptional(100, "Region"),
  postalCode: settingsTextOptional(20, "Postal code"),
  country: settingsTextOptional(200, "Country"),
  timezone: settingsText(50, "Timezone"),
  locale: settingsText(10, "Locale"),
  expectedVersion: optimisticVersionSchema.optional(),
});
export type CompanyProfileUpdate = z.infer<typeof companyProfileUpdateSchema>;

export const invoiceSettingsUpdateSchema = z.strictObject({
  invoiceNumberPrefix: settingsTextOptional(20, "Invoice number prefix"),
  issueFromName: settingsTextOptional(100, "Issue-from name"),
  issueFromEmail: emailSchema.nullable(),
  logoUrl: settingsTextOptional(500, "Logo URL"),
  taxRate: nonNegativeUsdSchema,
  paymentInstructions: settingsTextOptional(2000, "Payment instructions"),
  terms: settingsTextOptional(2000, "Terms"),
  footer: settingsTextOptional(500, "Footer"),
  defaultDueDays: z.number().int().min(1).max(365),
  expectedVersion: optimisticVersionSchema.optional(),
});
export type InvoiceSettingsUpdate = z.infer<typeof invoiceSettingsUpdateSchema>;

// ---------------------------------------------------------------------------
// Substep M: tenant custom domains. The claimed domain is normalized to
// lowercase and validated as a multi-label domain with an alphabetic TLD.
// ---------------------------------------------------------------------------
const DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/;
const domainNameSchema: z.ZodType<string> = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(4, "Enter a valid domain.")
      .max(253, "Enter a valid domain.")
      .regex(DOMAIN_PATTERN, "Enter a valid domain."),
  );

export const domainRequestSchema = z.strictObject({
  domain: domainNameSchema,
});
export type DomainRequest = z.infer<typeof domainRequestSchema>;

export const domainVerifySchema = z.strictObject({
  domainId: uuidV7Schema,
  observedToken: z.string().min(1).max(128),
});
export type DomainVerify = z.infer<typeof domainVerifySchema>;

// ---------------------------------------------------------------------------
// Substep O: KYC upload and review. The business details are encrypted at rest
// (Step 02 envelope) so the schema describes the plaintext payload; the
// supporting documents reference Step 02 "kyc" file records. ID front and ID
// back are mandatory; the business document and proof of address are optional.
// ---------------------------------------------------------------------------
export const kycBusinessTypeSchema = z.enum([
  "sole_proprietorship",
  "partnership",
  "llc",
  "corporation",
  "non_profit",
  "other",
]);
export type KycBusinessType = z.infer<typeof kycBusinessTypeSchema>;

export const kycRiskLevelSchema = z.enum(["low", "medium", "high"]);
export type KycRiskLevel = z.infer<typeof kycRiskLevelSchema>;

export const kycDecisionSchema = z.enum(["approved", "rejected"]);
export type KycDecision = z.infer<typeof kycDecisionSchema>;

export const kycDocumentsSchema = z.strictObject({
  id_front: uuidV7Schema,
  id_back: uuidV7Schema,
  business_document: uuidV7Schema.optional(),
  proof_of_address: uuidV7Schema.optional(),
});
export type KycDocuments = z.infer<typeof kycDocumentsSchema>;

export const kycDirectorSchema = z.strictObject({
  name: plainTextSchema(120, "Director name"),
  role: plainTextSchema(120, "Director role"),
});

export const kycDetailsSchema = z.strictObject({
  registrationNumber: plainTextSchema(120, "Registration number"),
  vatNumber: z.string().max(120).nullable().optional(),
  registeredAddress: plainTextSchema(500, "Registered address"),
  businessDescription: plainTextSchema(1000, "Business description").optional(),
  website: z.string().max(253).optional(),
  directors: z.array(kycDirectorSchema).min(1, "At least one director is required.").max(20),
});
export type KycDetails = z.infer<typeof kycDetailsSchema>;

export const kycSubmitInputSchema = z.strictObject({
  businessType: kycBusinessTypeSchema,
  riskLevel: kycRiskLevelSchema.optional().default("medium"),
  documents: kycDocumentsSchema,
  details: kycDetailsSchema,
});
export type KycSubmitInput = z.infer<typeof kycSubmitInputSchema>;

export const kycReviewInputSchema = z.strictObject({
  note: plainTextSchema(500, "Review note").optional(),
});
export type KycReviewInput = z.infer<typeof kycReviewInputSchema>;

export const kycDecisionInputSchema = z.strictObject({
  decision: kycDecisionSchema,
  reason: plainTextSchema(500, "Decision reason").optional(),
});
export type KycDecisionInput = z.infer<typeof kycDecisionInputSchema>;

export const kycResubmissionInputSchema = z.strictObject({
  reason: plainTextSchema(500, "Resubmission reason"),
});
export type KycResubmissionInput = z.infer<typeof kycResubmissionInputSchema>;

export const kycExecuteDecisionSchema = z.strictObject({
  commandId: uuidV7Schema,
});
export type KycExecuteDecision = z.infer<typeof kycExecuteDecisionSchema>;

// The payload carried by the kyc.decision.finalize command (approval-gated).
export const kycDecisionPayloadSchema = z.strictObject({
  applicationId: uuidV7Schema,
  decision: kycDecisionSchema,
  reason: z.string().min(1).max(500).optional(),
});
export type KycDecisionPayload = z.infer<typeof kycDecisionPayloadSchema>;

// ---------------------------------------------------------------------------
// Substep D: two-factor (TOTP), backup/recovery codes, assurance, OAuth
// account linking, and fresh reauthentication. Every MFA request names the
// factor and/or challenge server-verified against the signed-in user's own
// provider factors; clients never name other users. Schemas stay client-safe
// so the settings page validates with the same contracts as the routes.
// ---------------------------------------------------------------------------

export const mfaFactorTypeSchema = z.enum(["totp"]);
export type MfaFactorType = z.infer<typeof mfaFactorTypeSchema>;

export const mfaFactorStatusSchema = z.enum(["unverified", "verified"]);
export type MfaFactorStatus = z.infer<typeof mfaFactorStatusSchema>;

export const mfaFactorListItemSchema = z.strictObject({
  id: genericUuidSchema,
  type: z.string().min(1).max(40),
  friendlyName: z.string().min(1).max(120).nullable(),
  status: mfaFactorStatusSchema,
  createdAt: z.string().datetime().nullable(),
  lastChallengedAt: z.string().datetime().nullable(),
});
export type MfaFactorListItem = z.infer<typeof mfaFactorListItemSchema>;

export const mfaEnrollRequestSchema = z.strictObject({
  factorType: mfaFactorTypeSchema.default("totp"),
  friendlyName: plainTextSchema(120, "Friendly name").optional(),
});
export type MfaEnrollRequest = z.infer<typeof mfaEnrollRequestSchema>;

export const mfaChallengeRequestSchema = z.strictObject({
  factorId: genericUuidSchema,
});
export type MfaChallengeRequest = z.infer<typeof mfaChallengeRequestSchema>;

/** A TOTP code (6-8 digits) or a single-use recovery/backup code. */
export const mfaCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-z-]+$/i, "Enter the code from your authenticator or a backup code.")
  .min(1)
  .max(64);

export const mfaVerifyRequestSchema = z.strictObject({
  factorId: genericUuidSchema,
  challengeId: z.string().min(8).max(128),
  code: mfaCodeSchema,
});
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

export const mfaUnenrollRequestSchema = z.strictObject({
  factorId: genericUuidSchema,
});
export type MfaUnenrollRequest = z.infer<typeof mfaUnenrollRequestSchema>;

export const mfaRecoveryCodesGenerateRequestSchema = z.strictObject({
  friendlyName: plainTextSchema(120, "Friendly name").optional(),
});
export type MfaRecoveryCodesGenerateRequest = z.infer<typeof mfaRecoveryCodesGenerateRequestSchema>;

export const mfaRecoveryCodeVerifyRequestSchema = z.strictObject({
  code: mfaCodeSchema,
});
export type MfaRecoveryCodeVerifyRequest = z.infer<typeof mfaRecoveryCodeVerifyRequestSchema>;

export const mfaStatusSchema = z.strictObject({
  requiredLevel: z.enum(["aal1", "aal2"]),
  currentLevel: z.enum(["aal1", "aal2"]),
  satisfied: z.boolean(),
  factors: z.array(mfaFactorListItemSchema),
  mustEnroll: z.boolean(),
  recoveryCodesRemaining: z.number().int().min(0).nullable(),
});
export type MfaStatus = z.infer<typeof mfaStatusSchema>;

export const OAUTH_PROVIDERS = [
  "google",
  "github",
  "apple",
  "azure",
  "facebook",
  "linkedin",
  "slack",
] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export const oauthProviderSchema = z.enum(OAUTH_PROVIDERS);

export const oauthSignInRequestSchema = z.strictObject({
  provider: oauthProviderSchema,
  next: safeRedirectPathSchema.optional(),
});
export type OAuthSignInRequest = z.infer<typeof oauthSignInRequestSchema>;

export const oauthLinkRequestSchema = z.strictObject({
  provider: oauthProviderSchema,
});
export type OAuthLinkRequest = z.infer<typeof oauthLinkRequestSchema>;

export const reauthRequestSchema = z.strictObject({
  actionId: z.string().min(1).max(80),
});
export type ReauthRequest = z.infer<typeof reauthRequestSchema>;

// ---------------------------------------------------------------------------
// Substep F: permissioned account unlock.
// ---------------------------------------------------------------------------

/** A platform admin requests an unlock, attesting owner contact by email. */
export const unlockRequestInputSchema = z.strictObject({
  subjectEmail: emailSchema,
  reason: plainTextSchema(280, "Reason"),
});
export type UnlockRequestInput = z.infer<typeof unlockRequestInputSchema>;

/** Executes a fully approved unlock command. */
export const executeUnlockRequestSchema = z.strictObject({
  commandId: uuidV7Schema,
});
export type ExecuteUnlockRequest = z.infer<typeof executeUnlockRequestSchema>;

/** The immutable payload captured on the auth.account.unlock command. */
export const unlockCommandPayloadSchema = z.strictObject({
  subjectHash: hex64Schema,
  subjectUserId: genericUuidSchema.nullable(),
  subjectEmail: emailSchema,
  ownerContactConfirmed: z.literal(true),
  reason: z.string().min(3).max(280),
});
export type UnlockCommandPayload = z.infer<typeof unlockCommandPayloadSchema>;

/** Drives one stage of the command approval chain. */
export const commandActionRequestSchema = z.strictObject({
  commandId: uuidV7Schema,
  action: z.enum(["step-up", "approve-l2", "approve-l3", "final-confirm", "reject"]),
  reason: plainTextSchema(280, "Reason").optional(),
});
export type CommandActionRequest = z.infer<typeof commandActionRequestSchema>;
