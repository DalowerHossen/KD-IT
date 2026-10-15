// path: app/(auth)/login/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { strings } from "@/lib/i18n/strings/en";
import { isSafeRelativePath } from "@/lib/validation/sanitize";

export const metadata: Metadata = {
  title: strings.auth.login.title,
  description: strings.auth.login.subtitle,
};

interface LoginSearchParams {
  readonly next?: string;
  readonly error?: string;
  readonly reset?: string;
}

/** Sign-in page. The post-login target is validated to stay on-site. */
export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<LoginSearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const next =
    params.next !== undefined && isSafeRelativePath(params.next) ? params.next : "/account";
  return (
    <LoginForm
      next={next}
      showInvalidLinkNotice={params.error === "invalid-link"}
      showResetDoneNotice={params.reset === "1"}
    />
  );
}
