// path: components/settings/invoice-settings-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from "react";

import {
  AuthRequestError,
  getAuth,
  groupIssuesByField,
  postAuth,
} from "@/components/auth/auth-client";
import { TextAreaField, TextField } from "@/components/settings/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { strings } from "@/lib/i18n/strings/en";

interface InvoiceSettings {
  readonly invoiceNumberPrefix: string | null;
  readonly issueFromName: string | null;
  readonly issueFromEmail: string | null;
  readonly logoUrl: string | null;
  readonly taxRate: string;
  readonly paymentInstructions: string | null;
  readonly terms: string | null;
  readonly footer: string | null;
  readonly defaultDueDays: number;
  readonly version: number | null;
}

interface FormState {
  invoiceNumberPrefix: string;
  issueFromName: string;
  issueFromEmail: string;
  logoUrl: string;
  taxRate: string;
  paymentInstructions: string;
  terms: string;
  footer: string;
  defaultDueDays: string;
}

/** Trims trailing zeros so a canonical decimal reads naturally in the form. */
function displayDecimal(value: string): string {
  const trimmed = value.replace(/\.?0+$/, "");
  return trimmed === "" ? "0" : trimmed;
}

function toForm(settings: InvoiceSettings): FormState {
  return {
    invoiceNumberPrefix: settings.invoiceNumberPrefix ?? "",
    issueFromName: settings.issueFromName ?? "",
    issueFromEmail: settings.issueFromEmail ?? "",
    logoUrl: settings.logoUrl ?? "",
    taxRate: displayDecimal(settings.taxRate),
    paymentInstructions: settings.paymentInstructions ?? "",
    terms: settings.terms ?? "",
    footer: settings.footer ?? "",
    defaultDueDays: String(settings.defaultDueDays),
  };
}

/** Loads the workspace invoice settings and saves them (owner, optimistic). */
export function InvoiceSettingsForm(): ReactElement {
  const router = useRouter();
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [form, setForm] = useState<FormState>({
    invoiceNumberPrefix: "",
    issueFromName: "",
    issueFromEmail: "",
    logoUrl: "",
    taxRate: "0",
    paymentInstructions: "",
    terms: "",
    footer: "",
    defaultDueDays: "30",
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleExpired = useCallback(() => {
    router.push("/login");
  }, [router]);

  const setField = (key: keyof FormState) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  useEffect(() => {
    let cancelled = false;
    getAuth<InvoiceSettings>("/api/company/invoice-settings")
      .then((data) => {
        if (!cancelled) {
          setSettings(data);
          setForm(toForm(data));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof AuthRequestError && error.message === "Session expired") {
          handleExpired();
        } else {
          setLoadError(strings.settings.common.unknownError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handleExpired]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    setFieldErrors({});
    try {
      const updated = await postAuth<InvoiceSettings>("/api/company/invoice-settings", {
        invoiceNumberPrefix: form.invoiceNumberPrefix,
        issueFromName: form.issueFromName,
        issueFromEmail: form.issueFromEmail.trim() === "" ? null : form.issueFromEmail,
        logoUrl: form.logoUrl,
        taxRate: form.taxRate,
        paymentInstructions: form.paymentInstructions,
        terms: form.terms,
        footer: form.footer,
        defaultDueDays: Number.parseInt(form.defaultDueDays, 10) || 0,
        expectedVersion: settings?.version ?? undefined,
      });
      setSettings(updated);
      setForm(toForm(updated));
      setSaved(true);
    } catch (error) {
      if (error instanceof AuthRequestError) {
        setFieldErrors(groupIssuesByField(error.issues));
        setSaveError(error.issues.length > 0 ? null : error.message);
      } else {
        setSaveError(strings.settings.common.unknownError);
      }
    } finally {
      setSaving(false);
    }
  }

  const copy = strings.settings;

  if (loadError !== null) {
    return (
      <p
        role="alert"
        className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
      >
        {loadError}
      </p>
    );
  }
  if (settings === null) {
    return (
      <p role="status" className="text-body-md text-muted-foreground">
        {copy.invoice.subtitle}
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-display-md">{copy.invoice.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.invoice.subtitle}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        {saved ? (
          <p
            role="status"
            className="border-success/40 bg-success/10 text-body-sm rounded-md border p-3"
          >
            {copy.common.saved}
          </p>
        ) : null}
        {saveError !== null ? (
          <p
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive text-body-sm rounded-md border p-3"
          >
            {saveError}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{copy.invoice.numberingSection}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextField
              id="invoice-prefix"
              label={copy.invoice.invoiceNumberPrefixLabel}
              optional
              value={form.invoiceNumberPrefix}
              onChange={(e) => setField("invoiceNumberPrefix")(e.target.value)}
              error={fieldErrors.invoiceNumberPrefix}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.invoice.issueFromSection}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextField
              id="issue-from-name"
              label={copy.invoice.issueFromNameLabel}
              optional
              value={form.issueFromName}
              onChange={(e) => setField("issueFromName")(e.target.value)}
              error={fieldErrors.issueFromName}
            />
            <TextField
              id="issue-from-email"
              label={copy.invoice.issueFromEmailLabel}
              type="email"
              optional
              value={form.issueFromEmail}
              onChange={(e) => setField("issueFromEmail")(e.target.value)}
              error={fieldErrors.issueFromEmail}
            />
            <TextField
              id="invoice-logo"
              label={copy.invoice.logoUrlLabel}
              optional
              value={form.logoUrl}
              onChange={(e) => setField("logoUrl")(e.target.value)}
              error={fieldErrors.logoUrl}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.invoice.taxSection}</CardTitle>
            <CardDescription>{copy.invoice.taxRateLabel}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="tax-rate"
                label={copy.invoice.taxRateLabel}
                type="number"
                min="0"
                step="0.01"
                value={form.taxRate}
                onChange={(e) => setField("taxRate")(e.target.value)}
                error={fieldErrors.taxRate}
              />
              <TextField
                id="due-days"
                label={copy.invoice.defaultDueDaysLabel}
                type="number"
                min="1"
                max="365"
                value={form.defaultDueDays}
                onChange={(e) => setField("defaultDueDays")(e.target.value)}
                error={fieldErrors.defaultDueDays}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.invoice.legalSection}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextAreaField
              id="payment-instructions"
              label={copy.invoice.paymentInstructionsLabel}
              optional
              rows={3}
              value={form.paymentInstructions}
              onChange={(e) => setField("paymentInstructions")(e.target.value)}
              error={fieldErrors.paymentInstructions}
            />
            <TextAreaField
              id="terms"
              label={copy.invoice.termsLabel}
              optional
              rows={4}
              value={form.terms}
              onChange={(e) => setField("terms")(e.target.value)}
              error={fieldErrors.terms}
            />
            <TextField
              id="footer"
              label={copy.invoice.footerLabel}
              optional
              value={form.footer}
              onChange={(e) => setField("footer")(e.target.value)}
              error={fieldErrors.footer}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="submit" size="md" disabled={saving} className="w-full sm:w-auto">
            {saving ? copy.common.saving : copy.common.save}
          </Button>
        </div>
      </form>
    </div>
  );
}
