// path: lib/config/site.ts

/**
 * Static site identity shared by metadata, shells, and emails.
 * Values here are product facts, not environment secrets.
 */
export const siteConfig = {
  name: "KD SOLUTION IT",
  tagline: "Invoicing, payments, payroll, and accounting in one secure platform.",
  description:
    "KD SOLUTION IT is a multi-tenant platform for invoicing, payments, payroll, accounting, and business operations, with English-only product surfaces and USD accounting.",
  supportEmail: "support@kdsolutionit.com",
  version: "0.1.0",
} as const;

export type SiteConfig = typeof siteConfig;
