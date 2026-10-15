// path: app/(auth)/forgot-password/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.auth.forgotPassword.title,
  description: strings.auth.forgotPassword.subtitle,
};

/** Recovery-request page. */
export default function ForgotPasswordPage(): ReactElement {
  return <ForgotPasswordForm />;
}
