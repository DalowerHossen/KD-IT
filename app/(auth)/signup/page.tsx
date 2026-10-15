// path: app/(auth)/signup/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { SignupForm } from "@/components/auth/signup-form";
import { strings } from "@/lib/i18n/strings/en";

export const metadata: Metadata = {
  title: strings.auth.signup.title,
  description: strings.auth.signup.subtitle,
};

/** Registration page. */
export default function SignupPage(): ReactElement {
  return <SignupForm />;
}
