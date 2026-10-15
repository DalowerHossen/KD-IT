// path: lib/company/profile.ts
import "server-only";

import { z } from "zod";

import { companyProfileUpdateSchema, type CompanyProfileUpdate } from "@/lib/auth/schemas";
import { requirePermission } from "@/lib/auth/authorization";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantContextSettings } from "@/lib/db/tenant-context";
import { ConflictError, NotFoundError } from "@/lib/errors/app-errors";

/**
 * Substep L - the workspace profile (public branding, contact, address, and
 * locale). One row per company; the workspace name (display_name / legal_name)
 * is read from app.companies (the single source of truth set at onboarding)
 * and merged in. Owner-gated through company.profile.read /
 * company.profile.update. Updates are full-replace and optimistic: a stale
 * expectedVersion or a concurrent writer is detected and rejected.
 */

const PROFILE_DATA_COLUMNS =
  "tagline, logo_url, website, contact_name, contact_email, address_line1, city, region, postal_code, country, timezone, locale";

const companyProfileSchema = z.object({
  displayName: z.string().min(1).max(200),
  legalName: z.string().min(1).max(200),
  tagline: z.string().max(200).nullable(),
  logoUrl: z.string().max(500).nullable(),
  website: z.string().max(300).nullable(),
  contactName: z.string().max(100).nullable(),
  contactEmail: z.string().max(254).nullable(),
  addressLine1: z.string().max(200).nullable(),
  city: z.string().max(100).nullable(),
  region: z.string().max(100).nullable(),
  postalCode: z.string().max(20).nullable(),
  country: z.string().max(200).nullable(),
  timezone: z.string().min(2).max(50),
  locale: z.string().min(2).max(10),
  version: z.number().int().min(1).nullable(),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

function toProfile(row: Record<string, unknown>): CompanyProfile {
  return companyProfileSchema.parse({
    displayName: row.display_name,
    legalName: row.legal_name,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    website: row.website,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    addressLine1: row.address_line1,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    timezone: row.timezone,
    locale: row.locale,
    version: row.version,
  });
}

export async function getCompanyProfile(context: TenantContext): Promise<CompanyProfile> {
  await requirePermission(context, "company.profile.read");
  const result = await pgQuery(
    `select c.display_name, c.legal_name,
            p.tagline, p.logo_url, p.website, p.contact_name, p.contact_email,
            p.address_line1, p.city, p.region, p.postal_code, p.country,
            p.timezone, p.locale, p.version
       from app.companies c
       left join app.company_profiles p
         on p.company_id = c.id and p.deleted_at is null
      where c.id = $1 and c.deleted_at is null`,
    [context.companyId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new NotFoundError("This workspace was not found.");
  }
  return toProfile(row);
}

export async function updateCompanyProfile(
  context: TenantContext,
  input: CompanyProfileUpdate,
): Promise<CompanyProfile> {
  await requirePermission(context, "company.profile.update");
  const v = companyProfileUpdateSchema.parse(input);

  const updated = await withPgTransaction(async (client) => {
    const existing = await client.query(
      `select version from app.company_profiles where company_id = $1 and deleted_at is null`,
      [context.companyId],
    );
    if (existing.rows.length > 0) {
      const expected = v.expectedVersion ?? (existing.rows[0].version as number);
      const res = await client.query(
        `update app.company_profiles
            set tagline = $3, logo_url = $4, website = $5, contact_name = $6, contact_email = $7,
                address_line1 = $8, city = $9, region = $10, postal_code = $11, country = $12,
                timezone = $13, locale = $14
          where company_id = $1 and version = $2
          returning ${PROFILE_DATA_COLUMNS}, version`,
        [
          context.companyId,
          expected,
          v.tagline,
          v.logoUrl,
          v.website,
          v.contactName,
          v.contactEmail,
          v.addressLine1,
          v.city,
          v.region,
          v.postalCode,
          v.country,
          v.timezone,
          v.locale,
        ],
      );
      if (res.rows.length === 0) {
        throw new ConflictError("This workspace's profile changed; reload and try again.");
      }
      return res.rows[0];
    }
    const res = await client.query(
      `insert into app.company_profiles (company_id, ${PROFILE_DATA_COLUMNS})
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning ${PROFILE_DATA_COLUMNS}, version`,
      [
        context.companyId,
        v.tagline,
        v.logoUrl,
        v.website,
        v.contactName,
        v.contactEmail,
        v.addressLine1,
        v.city,
        v.region,
        v.postalCode,
        v.country,
        v.timezone,
        v.locale,
      ],
    );
    return res.rows[0];
  }, tenantContextSettings(context));

  const profile = toProfile(updated);
  await appendAuditEvent(context, {
    actorType: "user",
    action: "company.profile.updated",
    resourceType: "company_profiles",
    resourceId: context.companyId,
    actorId: context.userId,
    metadata: { company_id: context.companyId },
  });
  return profile;
}
