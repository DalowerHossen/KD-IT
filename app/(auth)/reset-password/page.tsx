// path: app/(auth)/reset-password/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.auth.resetPassword.title,
  description: strings.auth.resetPassword.subtitle,
};

/**
 * Recovery-completion page, reached from the reset link. The link session
 * lives in cookies; without it the API denies generically.
 */
export default function ResetPasswordPage(): ReactElement {
  return <ResetPasswordForm />;
}
