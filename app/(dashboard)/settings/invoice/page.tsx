// path: app/(dashboard)/settings/invoice/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { InvoiceSettingsForm } from "@/components/settings/invoice-settings-form";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.settings.invoice.title,
  description: strings.settings.invoice.subtitle,
};

/** Workspace invoice settings (owner, optimistic). */
export default function SettingsInvoicePage(): ReactElement {
  return (
    <div className="max-w-content mx-auto flex w-full flex-col px-4 py-10 sm:px-6 lg:px-8">
      <InvoiceSettingsForm />
    </div>
  );
}
