// path: lib/company/kyc.ts
import "server-only";

import { z } from "zod";

import {
  kycDecisionInputSchema,
  kycDecisionPayloadSchema,
  kycReviewInputSchema,
  kycResubmissionInputSchema,
  kycSubmitInputSchema,
  type KycDecision,
  type KycDetails,
  type KycSubmitInput,
} from "@/lib/auth/schemas";
import {
  requirePermission,
  requirePlatformContext,
  requireTenantContext,
} from "@/lib/auth/authorization";
import { getEncryptionKeyVersion } from "@/lib/config/env";
import { decryptData, encryptData } from "@/lib/crypto/envelope";
import { deserializeEnvelope, serializeEnvelope } from "@/lib/crypto/envelope-format";
import { sha256Hex } from "@/lib/crypto/hashes";
import {
  assertApprovedCommandFor,
  executeCommand,
  proposeAndAudit,
} from "@/lib/db/repositories/commands";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import { getFileRecord } from "@/lib/db/repositories/file-records";
import {
  PLATFORM_COMPANY_ID,
  type TenantContext,
  makeTenantContext,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-errors";
import { notifyBestEffort } from "@/lib/notifications/service";
import { type NotificationType } from "@/lib/notifications/repository";
import { downloadDecryptedFile } from "@/lib/storage/file-service";

/**
 * Substep O - KYC upload and review. A workspace owner submits a KYC
 * application (encrypted business details + Step 02 "kyc" documents); a
 * platform reviewer works it through the approval states (pending ->
 * under_review -> approved/rejected, then expired). The final decision is an
 * approval-gated kyc.decision.finalize command. A background worker expires
 * approved applications past their validity window and reminds owners before
 * expiry; a sanctions-screening hook records a verdict per application. The
 * effective status is the basis for downstream feature gating (Step 05).
 */

const DETAILS_RESOURCE_PREFIX = "kyc-application:";
const VALIDITY_INTERVAL = "interval '365 days'";
const REMINDER_WINDOW = "interval '30 days'";
const DECISION_KIND = "kyc.decision.finalize" as const;

const KYC_COLUMNS =
  "id, company_id, status, business_type, risk_level, details, details_sha256, documents, submitted_by, submitted_at, review_started_by, review_started_at, review_note, decided_by, decided_at, decision_reason, decision_command_id, valid_until, resubmission_requested_by, resubmission_requested_at, resubmission_reason, sanctions_status, created_at, updated_at, version";

const kycApplicationRowSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  status: z.enum(["pending", "under_review", "approved", "rejected", "expired"]),
  business_type: z.string(),
  risk_level: z.enum(["low", "medium", "high"]),
  details: z.instanceof(Buffer),
  details_sha256: z.string(),
  documents: z.record(z.string(), z.string()),
  submitted_by: z.string(),
  submitted_at: z.string(),
  review_started_by: z.string().nullable(),
  review_started_at: z.string().nullable(),
  review_note: z.string().nullable(),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
  decision_reason: z.string().nullable(),
  decision_command_id: z.string().nullable(),
  valid_until: z.string().nullable(),
  resubmission_requested_by: z.string().nullable(),
  resubmission_requested_at: z.string().nullable(),
  resubmission_reason: z.string().nullable(),
  sanctions_status: z.enum(["unscreened", "cleared", "flagged"]),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int().min(1),
});
type KycApplicationRow = z.infer<typeof kycApplicationRowSchema>;

export type KycApplicationStatus = KycApplicationRow["status"];

export interface KycApplicationView {
  readonly id: string;
  readonly status: KycApplicationStatus;
  readonly businessType: string;
  readonly riskLevel: KycApplicationRow["risk_level"];
  readonly details: KycDetails;
  readonly documents: Record<string, string>;
  readonly submittedAt: string;
  readonly reviewStartedAt: string | null;
  readonly reviewNote: string | null;
  readonly decisionReason: string | null;
  readonly decidedAt: string | null;
  readonly decisionCommandId: string | null;
  readonly validUntil: string | null;
  readonly resubmissionRequestedAt: string | null;
  readonly resubmissionReason: string | null;
  readonly sanctionsStatus: KycApplicationRow["sanctions_status"];
  readonly version: number;
}

export interface KycDocumentFile {
  readonly kind: string;
  readonly fileId: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly extension: string;
  readonly uploadState: string;
}

export interface KycReviewView extends KycApplicationView {
  readonly companyName: string;
  readonly submittedBy: string;
  readonly documentFiles: KycDocumentFile[];
}

export interface KycQueueItem {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly status: "pending" | "under_review";
  readonly businessType: string;
  readonly riskLevel: KycApplicationRow["risk_level"];
  readonly sanctionsStatus: KycApplicationRow["sanctions_status"];
  readonly submittedAt: string;
}

export interface KycStatusView {
  readonly status: "unsubmitted" | KycApplicationStatus;
  readonly validUntil: string | null;
  readonly verified: boolean;
}

// ---------------------------------------------------------------------------
// Owner (tenant) actions.
// ---------------------------------------------------------------------------

/**
 * Submits (or re-submits) a KYC application. The business details are
 * encrypted with the Step 02 envelope keyed to the application; the documents
 * must already be uploaded as clean "kyc" files. Re-submission is permitted
 * once there is neither an application in review nor a currently-valid
 * approval (i.e. after a rejection or a lapse).
 */
export async function submitKycApplication(
  context: TenantContext,
  rawInput: KycSubmitInput,
): Promise<KycApplicationView> {
  await requireTenantContext(context);
  await requirePermission(context, "kyc.own.submit");
  const input = kycSubmitInputSchema.parse(rawInput);

  const state = await pgQuery(
    `select
       (status in ('pending', 'under_review')) as in_review,
       (status = 'approved' and (valid_until is null or valid_until > clock_timestamp())) as verified
     from app.kyc_applications
     where company_id = $1 and deleted_at is null
     order by created_at desc
     limit 1`,
    [context.companyId],
  );
  const latest = state.rows[0] as { in_review: boolean; verified: boolean } | undefined;
  if (latest?.in_review) {
    throw new ConflictError("You already have a KYC application in review.");
  }
  if (latest?.verified) {
    throw new ConflictError("Your KYC is already verified and not yet due for re-verification.");
  }

  const documents: Record<string, string> = {};
  for (const [kind, fileId] of Object.entries(input.documents)) {
    if (fileId === undefined) {
      continue;
    }
    const record = await getFileRecord(context, fileId);
    if (record.category !== "kyc") {
      throw new ValidationError("A KYC document must be uploaded with the KYC file category.");
    }
    if (record.upload_state !== "clean") {
      throw new ValidationError(
        "This document is still under security review and cannot be submitted.",
      );
    }
    documents[kind] = fileId;
  }

  const applicationId = await mintDatabaseUuidV7();
  const { artifact, sha256 } = encryptDetails(context.companyId, applicationId, input.details);

  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `insert into app.kyc_applications
           (id, company_id, business_type, risk_level, details, details_sha256, documents, submitted_by, submitted_at, status)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, clock_timestamp(), 'pending')
         returning ${KYC_COLUMNS}`,
        [
          applicationId,
          context.companyId,
          input.businessType,
          input.riskLevel,
          artifact,
          sha256,
          JSON.stringify(documents),
          context.userId,
        ],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("The KYC application could not be created.");
  }
  await appendAuditEvent(context, {
    actorType: "user",
    action: "kyc.submitted",
    resourceType: "kyc_applications",
    resourceId: applicationId,
    actorId: context.userId,
    metadata: {
      businessType: input.businessType,
      riskLevel: input.riskLevel,
      documents: Object.keys(documents),
    },
  });
  return toView(kycApplicationRowSchema.parse(row), input.details);
}

/** Reads the workspace's most recent KYC application (decrypted). */
export async function getKycApplication(
  context: TenantContext,
): Promise<KycApplicationView | null> {
  await requireTenantContext(context);
  await requirePermission(context, "kyc.own.read");
  const result = await pgQuery(
    `select ${KYC_COLUMNS} from app.kyc_applications
      where company_id = $1 and deleted_at is null
      order by created_at desc
      limit 1`,
    [context.companyId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  const parsed = kycApplicationRowSchema.parse(row);
  const details = decryptDetails(parsed.company_id, parsed.id, parsed.details);
  return toView(parsed, details);
}

// ---------------------------------------------------------------------------
// Platform review actions.
// ---------------------------------------------------------------------------

/** The cross-tenant queue of applications awaiting or in review. */
export async function listPendingKycApplications(context: TenantContext): Promise<KycQueueItem[]> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.review");
  const result = await pgQuery(
    `select k.id, k.company_id, k.status, k.business_type, k.risk_level, k.sanctions_status,
            k.submitted_at, c.display_name as company_name
       from app.kyc_applications k
       join app.companies c on c.id = k.company_id
      where k.status in ('pending', 'under_review') and k.deleted_at is null and c.deleted_at is null
      order by k.submitted_at asc, k.id asc`,
  );
  const queueRowSchema = z.object({
    id: z.string(),
    company_id: z.string(),
    status: z.enum(["pending", "under_review"]),
    business_type: z.string(),
    risk_level: z.enum(["low", "medium", "high"]),
    sanctions_status: z.enum(["unscreened", "cleared", "flagged"]),
    submitted_at: z.string(),
    company_name: z.string(),
  });
  return z
    .array(queueRowSchema)
    .parse(result.rows)
    .map((row) => ({
      id: row.id,
      companyId: row.company_id,
      companyName: row.company_name,
      status: row.status,
      businessType: row.business_type,
      riskLevel: row.risk_level,
      sanctionsStatus: row.sanctions_status,
      submittedAt: row.submitted_at,
    }));
}

/** Loads one application with its decrypted details and document files (for review). */
export async function getKycApplicationForReview(
  context: TenantContext,
  applicationId: string,
): Promise<KycReviewView> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.review");
  const result = await pgQuery(
    `select ${KYC_COLUMNS}, c.display_name as company_name
       from app.kyc_applications k
       join app.companies c on c.id = k.company_id
      where k.id = $1 and k.deleted_at is null`,
    [applicationId],
  );
  const raw = result.rows[0] as Record<string, unknown> | undefined;
  if (raw === undefined) {
    throw new NotFoundError("This KYC application was not found.");
  }
  const parsed = kycApplicationRowSchema.parse(raw);
  const details = decryptDetails(parsed.company_id, parsed.id, parsed.details);
  const documentFiles = await loadDocumentFiles(parsed.company_id, parsed.documents, context);
  return {
    ...toView(parsed, details),
    companyName: raw.company_name as string,
    submittedBy: parsed.submitted_by,
    documentFiles,
  };
}

/** Moves a pending application into review and records an internal note. */
export async function startKycReview(
  context: TenantContext,
  applicationId: string,
  rawInput: unknown,
): Promise<KycApplicationView> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.review");
  const input = kycReviewInputSchema.parse(rawInput);
  const current = await loadApplicationById(applicationId);
  if (current.status !== "pending") {
    throw new ConflictError("This application is not awaiting review.");
  }
  const updated = await updateApplication(
    context,
    applicationId,
    current.version,
    "pending",
    `set status = 'under_review',
        review_started_by = $3,
        review_started_at = clock_timestamp(),
        review_note = $4`,
    [context.userId, input.note ?? null],
  );
  await appendAuditEvent(context, {
    actorType: "user",
    action: "kyc.review_started",
    resourceType: "kyc_applications",
    resourceId: applicationId,
    actorId: context.userId,
    metadata: {},
  });
  const details = decryptDetails(updated.company_id, updated.id, updated.details);
  return toView(updated, details);
}

/** Asks the owner to re-submit a rejected application. */
export async function requestKycResubmission(
  context: TenantContext,
  applicationId: string,
  rawInput: unknown,
): Promise<KycApplicationView> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.review");
  const input = kycResubmissionInputSchema.parse(rawInput);
  const current = await loadApplicationById(applicationId);
  if (current.status !== "rejected") {
    throw new ConflictError("Only a rejected application can be requested for resubmission.");
  }
  const updated = await updateApplication(
    context,
    applicationId,
    current.version,
    "rejected",
    `set resubmission_requested_by = $3,
        resubmission_requested_at = clock_timestamp(),
        resubmission_reason = $4`,
    [context.userId, input.reason],
  );
  await appendAuditEvent(context, {
    actorType: "user",
    action: "kyc.resubmission_requested",
    resourceType: "kyc_applications",
    resourceId: applicationId,
    actorId: context.userId,
    metadata: {},
  });
  await notifyOwner(
    context,
    updated,
    "kyc.submission_requested",
    "KYC resubmission requested",
    "Your KYC application was rejected and a resubmission is requested. Update your documents and resubmit.",
  );
  const details = decryptDetails(updated.company_id, updated.id, updated.details);
  return toView(updated, details);
}

export interface KycDocumentBytes {
  readonly bytes: Buffer;
  readonly mimeType: string;
  readonly originalName: string;
}

/** Previews (decrypts) a KYC document for an authorized reviewer. */
export async function downloadKycDocument(
  context: TenantContext,
  fileId: string,
): Promise<KycDocumentBytes> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.admin.read");
  const loaded = await pgQuery(
    `select id, company_id, category, mime_type, original_name
       from app.file_records where id = $1 and deleted_at is null`,
    [fileId],
  );
  const row = loaded.rows[0] as
    | { id: string; company_id: string; category: string; mime_type: string; original_name: string }
    | undefined;
  if (row === undefined) {
    throw new NotFoundError("This file was not found.");
  }
  if (row.category !== "kyc") {
    throw new ForbiddenError("This file is not a KYC document.");
  }
  const ownerContext = ownerContextFor(row.company_id, context);
  const { bytes } = await downloadDecryptedFile(ownerContext, fileId);
  return { bytes, mimeType: row.mime_type, originalName: row.original_name };
}

// ---------------------------------------------------------------------------
// Decision (approval-gated via the command engine).
// ---------------------------------------------------------------------------

/** Proposes a kyc.decision.finalize command for a pending/under-review application. */
export async function proposeKycDecision(
  context: TenantContext,
  applicationId: string,
  rawInput: unknown,
): Promise<{ commandId: string }> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.decide");
  const input = kycDecisionInputSchema.parse(rawInput);
  const current = await loadApplicationById(applicationId);
  if (current.status !== "pending" && current.status !== "under_review") {
    throw new ConflictError("This application has already been decided.");
  }
  return proposeAndAudit(context, {
    companyId: PLATFORM_COMPANY_ID,
    kind: DECISION_KIND,
    payload: {
      applicationId,
      decision: input.decision,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  });
}

/** Applies a fully-approved decision: approve (with a validity window) or reject. */
export async function executeKycDecision(
  context: TenantContext,
  commandId: string,
): Promise<KycApplicationView> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.decide");
  const approved = await assertApprovedCommandFor(context, commandId, DECISION_KIND);
  const payload = kycDecisionPayloadSchema.parse(approved.payload);
  const current = await loadApplicationById(payload.applicationId);
  if (current.status !== "pending" && current.status !== "under_review") {
    throw new ConflictError("This application has already been decided.");
  }
  const decision: KycDecision = payload.decision;
  const updated = await updateApplication(
    context,
    payload.applicationId,
    current.version,
    "pending | under_review",
    `set status = $3,
        decided_by = $4,
        decided_at = clock_timestamp(),
        decision_reason = $5,
        decision_command_id = $6,
        valid_until = case when $3 = 'approved' then clock_timestamp() + ${VALIDITY_INTERVAL} else null end`,
    [decision, context.userId, payload.reason ?? null, commandId],
  );
  await executeCommand(context, commandId, { applicationId: payload.applicationId, decision });
  await appendAuditEvent(context, {
    actorType: "user",
    action: decision === "approved" ? "kyc.approved" : "kyc.rejected",
    resourceType: "kyc_applications",
    resourceId: payload.applicationId,
    actorId: context.userId,
    metadata: { decision, commandId, validUntil: updated.valid_until },
  });
  await notifyOwner(
    context,
    updated,
    decision === "approved" ? "kyc.approved" : "kyc.rejected",
    decision === "approved" ? "KYC approved" : "KYC rejected",
    decision === "approved"
      ? "Your KYC application has been approved. Merchant-of-record and other gated features are now available."
      : "Your KYC application was rejected. Review the reason and resubmit when ready.",
  );
  const details = decryptDetails(updated.company_id, updated.id, updated.details);
  return toView(updated, details);
}

// ---------------------------------------------------------------------------
// Worker operations (platform).
// ---------------------------------------------------------------------------

/** Expires approved applications past their validity window. */
export async function expireKycApplications(context: TenantContext): Promise<number> {
  await requirePlatformContext(context);
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.kyc_applications
            set status = 'expired'
          where status = 'approved' and valid_until is not null and valid_until <= clock_timestamp()
          returning ${KYC_COLUMNS}`,
      ),
    tenantContextSettings(context),
  );
  const apps = z.array(kycApplicationRowSchema).parse(result.rows);
  for (const app of apps) {
    await notifyOwner(
      context,
      app,
      "kyc.expired",
      "KYC expired",
      "Your KYC verification has expired. Resubmit to restore merchant-of-record and other gated features.",
    );
  }
  if (apps.length > 0) {
    await appendAuditEvent(context, {
      actorType: "service",
      action: "kyc.expired",
      resourceType: "kyc_applications",
      resourceId: "batch",
      actorId: context.userId,
      metadata: { count: apps.length },
    });
  }
  return apps.length;
}

/** Reminds owners whose approval lapses within the reminder window. */
export async function remindExpiringKycApplications(context: TenantContext): Promise<number> {
  await requirePlatformContext(context);
  const result = await pgQuery(
    `select ${KYC_COLUMNS} from app.kyc_applications
      where status = 'approved' and valid_until is not null
        and valid_until > clock_timestamp()
        and valid_until <= clock_timestamp() + ${REMINDER_WINDOW}
        and deleted_at is null`,
  );
  const apps = z.array(kycApplicationRowSchema).parse(result.rows);
  for (const app of apps) {
    await notifyOwner(
      context,
      app,
      "kyc.expiring",
      "KYC expiring soon",
      "Your KYC verification is expiring within 30 days. Resubmit to keep merchant-of-record and other gated features active.",
    );
  }
  return apps.length;
}

/** Records a sanctions-screening verdict (the sanctions workflow hook). */
export async function setKycSanctionsStatus(
  context: TenantContext,
  applicationId: string,
  status: "unscreened" | "cleared" | "flagged",
): Promise<KycApplicationView> {
  await requirePlatformContext(context);
  await requirePermission(context, "kyc.admin.read");
  const current = await loadApplicationById(applicationId);
  const updated = await updateApplication(
    context,
    applicationId,
    current.version,
    null,
    `set sanctions_status = $3`,
    [status],
  );
  await appendAuditEvent(context, {
    actorType: "service",
    action: "kyc.sanctions_updated",
    resourceType: "kyc_applications",
    resourceId: applicationId,
    actorId: context.userId,
    metadata: { status },
  });
  const details = decryptDetails(updated.company_id, updated.id, updated.details);
  return toView(updated, details);
}

/** Effective KYC status for downstream feature gating (Step 05). */
export async function getKycStatus(context: TenantContext): Promise<KycStatusView> {
  const result = await pgQuery(
    `select status, valid_until,
            (status = 'approved' and (valid_until is null or valid_until > clock_timestamp())) as verified
       from app.kyc_applications
      where company_id = $1 and deleted_at is null
      order by created_at desc
      limit 1`,
    [context.companyId],
  );
  const row = result.rows[0] as
    { status: KycApplicationStatus; valid_until: string | null; verified: boolean } | undefined;
  if (row === undefined) {
    return { status: "unsubmitted", validUntil: null, verified: false };
  }
  return { status: row.status, validUntil: row.valid_until, verified: row.verified };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

async function loadApplicationById(applicationId: string): Promise<KycApplicationRow> {
  const result = await pgQuery(
    `select ${KYC_COLUMNS} from app.kyc_applications where id = $1 and deleted_at is null`,
    [applicationId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new NotFoundError("This KYC application was not found.");
  }
  return kycApplicationRowSchema.parse(row);
}

/**
 * Optimistic-locked update. `whereStatus` is null for an unconditional
 * (version-locked) update, or a SQL boolean fragment matched against the
 * current status (e.g. 'pending'). Extra parameters follow the two position
 * anchors ($1 = id, $2 = expected version).
 */
async function updateApplication(
  context: TenantContext,
  applicationId: string,
  expectedVersion: number,
  whereStatus: string | null,
  setClause: string,
  extraParams: readonly unknown[],
): Promise<KycApplicationRow> {
  const statusPredicate = whereStatus === null ? "true" : `status in (${whereStatus})`;
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.kyc_applications
            set ${setClause}
          where id = $1 and version = $2 and ${statusPredicate}
          returning ${KYC_COLUMNS}`,
        [applicationId, expectedVersion, ...extraParams],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("This KYC application changed concurrently. Reload and retry.");
  }
  return kycApplicationRowSchema.parse(row);
}

async function loadDocumentFiles(
  companyId: string,
  documents: Record<string, string>,
  context: TenantContext,
): Promise<KycDocumentFile[]> {
  const ownerContext = ownerContextFor(companyId, context);
  const files: KycDocumentFile[] = [];
  for (const [kind, fileId] of Object.entries(documents)) {
    const record = await getFileRecord(ownerContext, fileId);
    files.push({
      kind,
      fileId: record.id,
      originalName: record.original_name,
      mimeType: record.mime_type,
      byteSize: Number.parseInt(record.byte_size, 10),
      extension: record.extension,
      uploadState: record.upload_state,
    });
  }
  return files;
}

/** A workspace-scoped context so a platform reviewer can act on the tenant's rows. */
function ownerContextFor(companyId: string, context: TenantContext): TenantContext {
  return makeTenantContext({
    companyId,
    userId: context.userId,
    role: "super_admin",
    correlationId: context.correlationId,
  });
}

function encryptDetails(
  companyId: string,
  applicationId: string,
  details: KycDetails,
): { artifact: Buffer; sha256: string } {
  const envelope = encryptData(
    {
      companyId,
      resourceId: `${DETAILS_RESOURCE_PREFIX}${applicationId}`,
      category: "kyc",
      keyVersion: getEncryptionKeyVersion(),
    },
    Buffer.from(JSON.stringify(details), "utf8"),
  );
  return { artifact: serializeEnvelope(envelope), sha256: sha256Hex(envelope.ciphertext) };
}

function decryptDetails(companyId: string, applicationId: string, artifact: Buffer): KycDetails {
  const envelope = deserializeEnvelope(artifact);
  const plaintext = decryptData(
    { companyId, resourceId: `${DETAILS_RESOURCE_PREFIX}${applicationId}`, category: "kyc" },
    envelope,
  );
  return JSON.parse(plaintext.toString("utf8")) as KycDetails;
}

function toView(row: KycApplicationRow, details: KycDetails): KycApplicationView {
  return {
    id: row.id,
    status: row.status,
    businessType: row.business_type,
    riskLevel: row.risk_level,
    details,
    documents: row.documents,
    submittedAt: row.submitted_at,
    reviewStartedAt: row.review_started_at,
    reviewNote: row.review_note,
    decisionReason: row.decision_reason,
    decidedAt: row.decided_at,
    decisionCommandId: row.decision_command_id,
    validUntil: row.valid_until,
    resubmissionRequestedAt: row.resubmission_requested_at,
    resubmissionReason: row.resubmission_reason,
    sanctionsStatus: row.sanctions_status,
    version: row.version,
  };
}

async function mintDatabaseUuidV7(): Promise<string> {
  const result = await pgQuery("select app.uuid_v7()::text as id");
  const row = result.rows[0] as { id: string } | undefined;
  return z.string().parse(row?.id);
}

async function notifyOwner(
  context: TenantContext,
  app: KycApplicationRow,
  type: NotificationType,
  title: string,
  body: string,
): Promise<void> {
  const ownerContext = ownerContextFor(app.company_id, context);
  await notifyBestEffort(ownerContext, {
    userId: app.submitted_by,
    type,
    title,
    body,
    relatedId: app.id,
  });
}
