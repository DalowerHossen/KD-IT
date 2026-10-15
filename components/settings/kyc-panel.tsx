// path: components/settings/kyc-panel.tsx
"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from "react";

import {
  AuthRequestError,
  getAuth,
  groupIssuesByField,
  postAuth,
} from "@/components/auth/auth-client";
import { SelectField, SettingsSectionTitle, TextField } from "@/components/settings/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/i18n/strings/en";

type KycStatus = "pending" | "under_review" | "approved" | "rejected" | "expired";

interface Director {
  name: string;
  role: string;
}

interface KycApplicationView {
  readonly id: string;
  readonly status: KycStatus;
  readonly businessType: string;
  readonly decisionReason: string | null;
  readonly validUntil: string | null;
  readonly resubmissionReason: string | null;
  readonly submittedAt: string;
}

const BUSINESS_TYPES = [
  "sole_proprietorship",
  "partnership",
  "llc",
  "corporation",
  "non_profit",
  "other",
] as const;
const RISK_LEVELS = ["low", "medium", "high"] as const;
const FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

function statusLabel(status: KycStatus): string {
  const copy = strings.settings.kyc;
  if (status === "pending") {
    return copy.statusPending;
  }
  if (status === "under_review") {
    return copy.statusUnderReview;
  }
  if (status === "approved") {
    return copy.statusApproved;
  }
  if (status === "rejected") {
    return copy.statusRejected;
  }
  return copy.statusExpired;
}

function statusVariant(status: KycStatus): "secondary" | "success" | "destructive" | "outline" {
  if (status === "approved") {
    return "success";
  }
  if (status === "rejected" || status === "expired") {
    return "destructive";
  }
  if (status === "under_review") {
    return "outline";
  }
  return "secondary";
}

/** Shows the workspace's KYC status and submits (or re-submits) a verification application. */
export function KycPanel(): ReactElement {
  const router = useRouter();
  const [kyc, setKyc] = useState<KycApplicationView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [businessType, setBusinessType] = useState<string>("llc");
  const [riskLevel, setRiskLevel] = useState<string>("medium");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [directors, setDirectors] = useState<Director[]>([{ name: "", role: "" }]);
  const [idFront, setIdFront] = useState<{ id: string; name: string } | null>(null);
  const [idBack, setIdBack] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState<"id_front" | "id_back" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const copy = strings.settings.kyc;
  const common = strings.settings.common;

  const handleExpired = useCallback(() => {
    router.push("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    getAuth<{ kyc: KycApplicationView | null }>("/api/company/kyc")
      .then((data) => {
        if (!cancelled) {
          setKyc(data.kyc);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof AuthRequestError && error.message === "Session expired") {
          handleExpired();
        } else {
          setLoadError(common.unknownError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handleExpired, common.unknownError]);

  const canSubmit = kyc === null || kyc.status === "rejected" || kyc.status === "expired";

  async function uploadDocument(kind: "id_front" | "id_back", file: File): Promise<void> {
    setUploading(kind);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "kyc");
      const response = await fetch("/api/company/files", { method: "POST", body: formData });
      const body = (await response.json()) as {
        ok: boolean;
        data?: { id: string };
        error?: { message?: string };
      };
      if (!body.ok || body.data === undefined) {
        setUploadError(body.error?.message ?? common.unknownError);
        return;
      }
      if (kind === "id_front") {
        setIdFront({ id: body.data.id, name: file.name });
      } else {
        setIdBack({ id: body.data.id, name: file.name });
      }
    } catch {
      setUploadError(copy.uploadError);
    } finally {
      setUploading(null);
    }
  }

  function onFileChange(kind: "id_front" | "id_back") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file !== undefined) {
        void uploadDocument(kind, file);
      }
      event.target.value = "";
    };
  }

  function updateDirector(index: number, key: keyof Director, value: string): void {
    setDirectors((current) => current.map((d, i) => (i === index ? { ...d, [key]: value } : d)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (idFront === null || idBack === null) {
      setSaveError(copy.uploadError);
      return;
    }
    setSubmitting(true);
    setSaved(false);
    setSaveError(null);
    setFieldErrors({});
    try {
      const updated = await postAuth<KycApplicationView>("/api/company/kyc", {
        businessType,
        riskLevel,
        documents: { id_front: idFront.id, id_back: idBack.id },
        details: {
          registrationNumber,
          registeredAddress,
          directors: directors.filter((d) => d.name.trim() !== ""),
        },
      });
      setKyc(updated);
      setSaved(true);
    } catch (error) {
      if (error instanceof AuthRequestError) {
        setFieldErrors(groupIssuesByField(error.issues));
        setSaveError(error.issues.length > 0 ? null : error.message);
      } else {
        setSaveError(common.unknownError);
      }
    } finally {
      setSubmitting(false);
    }
  }

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
  if (!loaded) {
    return (
      <p role="status" className="text-body-md text-muted-foreground">
        {copy.subtitle}
      </p>
    );
  }

  const businessTypeOptions = BUSINESS_TYPES.map((value) => ({
    value,
    label: strings.settings.businessTypes[value],
  }));
  const riskLevelOptions = RISK_LEVELS.map((value) => ({
    value,
    label: strings.settings.riskLevels[value],
  }));

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-display-md">{copy.title}</h1>
        <p className="text-body-md text-muted-foreground">{copy.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{copy.statusSection}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {kyc === null ? (
            <p className="text-body-md text-muted-foreground">{copy.statusUnsubmitted}</p>
          ) : (
            <Badge variant={statusVariant(kyc.status)}>{statusLabel(kyc.status)}</Badge>
          )}
          {kyc !== null && kyc.validUntil !== null ? (
            <p className="text-body-sm text-muted-foreground">
              {copy.validUntilLabel}: {new Date(kyc.validUntil).toLocaleDateString()}
            </p>
          ) : null}
          {kyc !== null && kyc.decisionReason !== null ? (
            <p className="text-body-sm text-destructive">
              {copy.decisionReasonLabel}: {kyc.decisionReason}
            </p>
          ) : null}
          {kyc !== null && kyc.resubmissionReason !== null ? (
            <p className="text-body-sm text-muted-foreground">
              {copy.resubmissionReasonLabel}: {kyc.resubmissionReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canSubmit ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {saved ? (
            <p
              role="status"
              className="border-success/40 bg-success/10 text-body-sm rounded-md border p-3"
            >
              {common.saved}
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
              <CardTitle>{copy.submitSection}</CardTitle>
              <CardDescription>{copy.subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="kyc-business-type"
                  label={copy.businessTypeLabel}
                  value={businessType}
                  options={businessTypeOptions}
                  onChange={(e) => setBusinessType(e.target.value)}
                  error={fieldErrors.businessType}
                />
                <SelectField
                  id="kyc-risk-level"
                  label={copy.riskLevelLabel}
                  value={riskLevel}
                  options={riskLevelOptions}
                  onChange={(e) => setRiskLevel(e.target.value)}
                  error={fieldErrors.riskLevel}
                />
              </div>

              <SettingsSectionTitle>{copy.detailsSection}</SettingsSectionTitle>
              <TextField
                id="kyc-registration"
                label={copy.registrationNumberLabel}
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                error={fieldErrors.registrationNumber}
              />
              <TextField
                id="kyc-address"
                label={copy.registeredAddressLabel}
                value={registeredAddress}
                onChange={(e) => setRegisteredAddress(e.target.value)}
                error={fieldErrors.registeredAddress}
              />

              <div className="flex flex-col gap-3">
                <SettingsSectionTitle>{copy.directorsSection}</SettingsSectionTitle>
                {directors.map((director, index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <TextField
                      id={`kyc-director-name-${index}`}
                      label={copy.directorNameLabel}
                      value={director.name}
                      onChange={(e) => updateDirector(index, "name", e.target.value)}
                    />
                    <TextField
                      id={`kyc-director-role-${index}`}
                      label={copy.directorRoleLabel}
                      value={director.role}
                      onChange={(e) => updateDirector(index, "role", e.target.value)}
                    />
                    {directors.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDirectors((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        {copy.removeDirector}
                      </Button>
                    ) : null}
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDirectors((current) => [...current, { name: "", role: "" }])}
                  >
                    {copy.addDirector}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <SettingsSectionTitle>{copy.documentsSection}</SettingsSectionTitle>
                {uploadError !== null ? (
                  <p role="alert" className="text-body-sm text-destructive">
                    {uploadError}
                  </p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="kyc-id-front">{copy.idFrontLabel}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="kyc-id-front"
                        type="file"
                        accept={FILE_ACCEPT}
                        className="text-body-sm"
                        onChange={onFileChange("id_front")}
                      />
                      {idFront !== null ? (
                        <span className="text-body-sm text-muted-foreground">{idFront.name}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="kyc-id-back">{copy.idBackLabel}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="kyc-id-back"
                        type="file"
                        accept={FILE_ACCEPT}
                        className="text-body-sm"
                        onChange={onFileChange("id_back")}
                      />
                      {idBack !== null ? (
                        <span className="text-body-sm text-muted-foreground">{idBack.name}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {uploading !== null ? (
                  <p role="status" className="text-body-sm text-muted-foreground">
                    {copy.uploading}
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="md" disabled={submitting || uploading !== null}>
                  {submitting ? copy.submitting : copy.submit}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : (
        <p role="status" className="text-body-sm text-muted-foreground">
          {copy.inReview}
        </p>
      )}
    </div>
  );
}
