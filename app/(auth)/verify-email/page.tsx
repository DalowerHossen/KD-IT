// path: app/(auth)/verify-email/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { VerifyEmailPanel } from "@/components/auth/verify-email-panel";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.auth.verifyEmail.title,
  description: strings.auth.verifyEmail.subtitle,
};

interface VerifyEmailSearchParams {
  readonly verified?: string;
}

/** Verification landing and re-send page. */
export default async function VerifyEmailPage({
  searchParams,
}: {
  readonly searchParams: Promise<VerifyEmailSearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  return <VerifyEmailPanel showVerifiedState={params.verified === "1"} />;
}
