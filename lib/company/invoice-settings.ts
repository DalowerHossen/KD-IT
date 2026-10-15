// path: lib/company/invoice-settings.ts
import "server-only";

import { z } from "zod";

import { invoiceSettingsUpdateSchema, type InvoiceSettingsUpdate } from "@/lib/auth/schemas";
import { requirePermission } from "@/lib/auth/authorization";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantContextSettings } from "@/lib/db/tenant-context";
import { usdToDecimal } from "@/lib/money/decimal";
import { ConflictError, ValidationError } from "@/lib/errors/app-errors";

/**
 * Substep L - the workspace invoice settings (numbering prefix, issue-from,
 * tax rate, and text blocks) consumed by the Step 04 document engine. One row
 * per company; a missing row reads back as the defaults so settings are always
 * present. Owner-gated through company.settings.update. Updates are
 * full-replace and optimistic.
 */

const INVOICE_DATA_COLUMNS =
  "invoice_number_prefix, issue_from_name, issue_from_email, logo_url, tax_rate, payment_instructions, terms, footer, default_due_days";

const invoiceSettingsSchema = z.object({
  invoiceNumberPrefix: z.string().max(20).nullable(),
  issueFromName: z.string().max(100).nullable(),
  issueFromEmail: z.string().max(254).nullable(),
  logoUrl: z.string().max(500).nullable(),
  taxRate: z.string(),
  paymentInstructions: z.string().max(2000).nullable(),
  terms: z.string().max(2000).nullable(),
  footer: z.string().max(500).nullable(),
  defaultDueDays: z.number().int().min(1).max(365),
  version: z.number().int().min(1).nullable(),
});
export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  invoiceNumberPrefix: null,
  issueFromName: null,
  issueFromEmail: null,
  logoUrl: null,
  taxRate: "0.0000",
  paymentInstructions: null,
  terms: null,
  footer: null,
  defaultDueDays: 30,
  version: null,
};

function toSettings(row: Record<string, unknown>): InvoiceSettings {
  return invoiceSettingsSchema.parse({
    invoiceNumberPrefix: row.invoice_number_prefix,
    issueFromName: row.issue_from_name,
    issueFromEmail: row.issue_from_email,
    logoUrl: row.logo_url,
    taxRate: row.tax_rate,
    paymentInstructions: row.payment_instructions,
    terms: row.terms,
    footer: row.footer,
    defaultDueDays: row.default_due_days,
    version: row.version,
  });
}

export async function getInvoiceSettings(context: TenantContext): Promise<InvoiceSettings> {
  await requirePermission(context, "company.settings.update");
  const result = await pgQuery(
    `select ${INVOICE_DATA_COLUMNS}, version
       from app.company_invoice_settings
      where company_id = $1 and deleted_at is null`,
    [context.companyId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return DEFAULT_INVOICE_SETTINGS;
  }
  return toSettings(row);
}

export async function updateInvoiceSettings(
  context: TenantContext,
  input: InvoiceSettingsUpdate,
): Promise<InvoiceSettings> {
  await requirePermission(context, "company.settings.update");
  const v = invoiceSettingsUpdateSchema.parse(input);
  if (usdToDecimal(v.taxRate).gt(100)) {
    throw new ValidationError("Tax rate must be between 0 and 100.");
  }

  const updated = await withPgTransaction(async (client) => {
    const existing = await client.query(
      `select version from app.company_invoice_settings where company_id = $1 and deleted_at is null`,
      [context.companyId],
    );
    if (existing.rows.length > 0) {
      const expected = v.expectedVersion ?? (existing.rows[0].version as number);
      const res = await client.query(
        `update app.company_invoice_settings
            set invoice_number_prefix = $3, issue_from_name = $4, issue_from_email = $5, logo_url = $6,
                tax_rate = $7::numeric, payment_instructions = $8, terms = $9, footer = $10,
                default_due_days = $11
          where company_id = $1 and version = $2
          returning ${INVOICE_DATA_COLUMNS}, version`,
        [
          context.companyId,
          expected,
          v.invoiceNumberPrefix,
          v.issueFromName,
          v.issueFromEmail,
          v.logoUrl,
          v.taxRate,
          v.paymentInstructions,
          v.terms,
          v.footer,
          v.defaultDueDays,
        ],
      );
      if (res.rows.length === 0) {
        throw new ConflictError("This workspace's invoice settings changed; reload and try again.");
      }
      return res.rows[0];
    }
    const res = await client.query(
      `insert into app.company_invoice_settings (company_id, ${INVOICE_DATA_COLUMNS})
       values ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10)
       returning ${INVOICE_DATA_COLUMNS}, version`,
      [
        context.companyId,
        v.invoiceNumberPrefix,
        v.issueFromName,
        v.issueFromEmail,
        v.logoUrl,
        v.taxRate,
        v.paymentInstructions,
        v.terms,
        v.footer,
        v.defaultDueDays,
      ],
    );
    return res.rows[0];
  }, tenantContextSettings(context));

  const settings = toSettings(updated);
  await appendAuditEvent(context, {
    actorType: "user",
    action: "company.invoice_settings.updated",
    resourceType: "company_invoice_settings",
    resourceId: context.companyId,
    actorId: context.userId,
    metadata: { company_id: context.companyId, taxRate: settings.taxRate },
  });
  return settings;
}
