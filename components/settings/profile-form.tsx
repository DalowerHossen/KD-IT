// path: components/settings/profile-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from "react";

import {
  AuthRequestError,
  getAuth,
  groupIssuesByField,
  postAuth,
} from "@/components/auth/auth-client";
import { TextField } from "@/components/settings/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { strings } from "@/lib/i18n/strings/en";

interface CompanyProfile {
  readonly displayName: string;
  readonly legalName: string;
  readonly tagline: string | null;
  readonly logoUrl: string | null;
  readonly website: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly timezone: string;
  readonly locale: string;
  readonly version: number | null;
}

interface FormState {
  tagline: string;
  logoUrl: string;
  website: string;
  contactName: string;
  contactEmail: string;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  timezone: string;
  locale: string;
}

const EMPTY_FORM: FormState = {
  tagline: "",
  logoUrl: "",
  website: "",
  contactName: "",
  contactEmail: "",
  addressLine1: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  timezone: "UTC",
  locale: "en",
};

function toForm(profile: CompanyProfile): FormState {
  return {
    tagline: profile.tagline ?? "",
    logoUrl: profile.logoUrl ?? "",
    website: profile.website ?? "",
    contactName: profile.contactName ?? "",
    contactEmail: profile.contactEmail ?? "",
    addressLine1: profile.addressLine1 ?? "",
    city: profile.city ?? "",
    region: profile.region ?? "",
    postalCode: profile.postalCode ?? "",
    country: profile.country ?? "",
    timezone: profile.timezone,
    locale: profile.locale,
  };
}

/** Loads the workspace profile and saves it (owner, optimistic). */
export function ProfileForm(): ReactElement {
  const router = useRouter();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
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
    getAuth<CompanyProfile>("/api/company/profile")
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
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
      const updated = await postAuth<CompanyProfile>("/api/company/profile", {
        tagline: form.tagline,
        logoUrl: form.logoUrl,
        website: form.website,
        contactName: form.contactName,
        contactEmail: form.contactEmail.trim() === "" ? null : form.contactEmail,
        addressLine1: form.addressLine1,
        city: form.city,
        region: form.region,
        postalCode: form.postalCode,
        country: form.country,
        timezone: form.timezone,
        locale: form.locale,
        expectedVersion: profile?.version ?? undefined,
      });
      setProfile(updated);
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
  if (profile === null) {
    return (
      <p role="status" className="text-body-md text-muted-foreground">
        {copy.profile.subtitle}
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-display-md">{copy.profile.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.profile.subtitle}</p>
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
            <CardTitle>{copy.profile.companySection}</CardTitle>
            <CardDescription>{copy.profile.readOnlyHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-display-name">{copy.profile.displayNameLabel}</Label>
              <Input id="profile-display-name" value={profile.displayName} readOnly />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-legal-name">{copy.profile.legalNameLabel}</Label>
              <Input id="profile-legal-name" value={profile.legalName} readOnly />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.profile.contactSection}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextField
              id="tagline"
              label={copy.profile.taglineLabel}
              optional
              value={form.tagline}
              onChange={(e) => setField("tagline")(e.target.value)}
              error={fieldErrors.tagline}
            />
            <TextField
              id="logo-url"
              label={copy.profile.logoUrlLabel}
              optional
              value={form.logoUrl}
              onChange={(e) => setField("logoUrl")(e.target.value)}
              error={fieldErrors.logoUrl}
            />
            <TextField
              id="website"
              label={copy.profile.websiteLabel}
              optional
              value={form.website}
              onChange={(e) => setField("website")(e.target.value)}
              error={fieldErrors.website}
            />
            <TextField
              id="contact-name"
              label={copy.profile.contactNameLabel}
              optional
              value={form.contactName}
              onChange={(e) => setField("contactName")(e.target.value)}
              error={fieldErrors.contactName}
            />
            <TextField
              id="contact-email"
              label={copy.profile.contactEmailLabel}
              type="email"
              optional
              value={form.contactEmail}
              onChange={(e) => setField("contactEmail")(e.target.value)}
              error={fieldErrors.contactEmail}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.profile.addressSection}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TextField
              id="address-line1"
              label={copy.profile.addressLine1Label}
              optional
              value={form.addressLine1}
              onChange={(e) => setField("addressLine1")(e.target.value)}
              error={fieldErrors.addressLine1}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="city"
                label={copy.profile.cityLabel}
                optional
                value={form.city}
                onChange={(e) => setField("city")(e.target.value)}
                error={fieldErrors.city}
              />
              <TextField
                id="region"
                label={copy.profile.regionLabel}
                optional
                value={form.region}
                onChange={(e) => setField("region")(e.target.value)}
                error={fieldErrors.region}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="postal-code"
                label={copy.profile.postalCodeLabel}
                optional
                value={form.postalCode}
                onChange={(e) => setField("postalCode")(e.target.value)}
                error={fieldErrors.postalCode}
              />
              <TextField
                id="country"
                label={copy.profile.countryLabel}
                optional
                value={form.country}
                onChange={(e) => setField("country")(e.target.value)}
                error={fieldErrors.country}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.profile.preferencesSection}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="timezone"
                label={copy.profile.timezoneLabel}
                value={form.timezone}
                onChange={(e) => setField("timezone")(e.target.value)}
                error={fieldErrors.timezone}
              />
              <TextField
                id="locale"
                label={copy.profile.localeLabel}
                value={form.locale}
                onChange={(e) => setField("locale")(e.target.value)}
                error={fieldErrors.locale}
              />
            </div>
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
