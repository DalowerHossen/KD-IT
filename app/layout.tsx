// path: app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactElement, ReactNode } from "react";

import { SkipLink } from "@/components/layout/skip-link";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getPublicEnv } from "@/lib/config/public-env";
import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";
import { getRequestNonce } from "@/lib/logging/request-context";
import { SessionProvider } from "@/lib/providers/session-provider";

import "@/styles/globals.css";

const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { appUrl } = getPublicEnv();
  return {
    metadataBase: new URL(appUrl),
    applicationName: siteConfig.name,
    title: {
      default: strings.metadata.defaultTitle,
      template: strings.metadata.titleTemplate,
    },
    description: strings.metadata.defaultDescription,
    manifest: "/manifest.webmanifest",
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: strings.metadata.defaultTitle,
      description: strings.metadata.defaultDescription,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: strings.metadata.defaultTitle,
      description: strings.metadata.defaultDescription,
    },
    robots: { index: true, follow: true },
    category: "business",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  const nonce = await getRequestNonce();

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={inter.variable}>
      <body className="bg-background text-foreground min-h-dvh font-sans antialiased">
        <SessionProvider>
          <ThemeProvider {...(nonce === null ? {} : { nonce })}>
            <SkipLink />
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
            <Toaster />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
