// path: app/(public)/design-system/page.tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { ChartSection } from "@/components/design-system/chart-section";
import { DataDisplaySection } from "@/components/design-system/data-display-section";
import { FormDemo } from "@/components/design-system/form-demo";
import { MotionSection } from "@/components/design-system/motion-section";
import { OverlayDemos } from "@/components/design-system/overlay-demos";
import { PrimitivesSection } from "@/components/design-system/primitives-section";
import { DesignSection } from "@/components/design-system/section";
import { ShellPreviews } from "@/components/design-system/shell-previews";
import { PageStateDemo } from "@/components/design-system/state-demos";
import { TokenSections } from "@/components/design-system/token-section";
import { PageHeader } from "@/components/layout/page-header";
import { CommandTrigger } from "@/components/navigation/command-trigger";
import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

const tocEntries = [
  { id: "tokens", label: strings.designSystem.sections.tokens },
  { id: "buttons", label: strings.designSystem.sections.buttons },
  { id: "forms", label: strings.designSystem.sections.forms },
  { id: "feedback", label: strings.designSystem.sections.feedback },
  { id: "data-display", label: strings.designSystem.sections.dataDisplay },
  { id: "overlays", label: strings.designSystem.sections.overlays },
  { id: "navigation", label: strings.designSystem.sections.navigation },
  { id: "charts", label: strings.designSystem.sections.charts },
  { id: "motion", label: strings.designSystem.sections.motionPrimitives },
  { id: "shells", label: strings.designSystem.sections.shells },
] as const;

export const metadata: Metadata = {
  title: strings.designSystem.title,
  description: strings.designSystem.description,
  robots: { index: false, follow: false },
};

/** Design system reference: tokens, primitives, states, and layout shells. */
export default function DesignSystemPage(): ReactElement {
  return (
    <div className="max-w-content mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title={strings.designSystem.title}
        description={strings.designSystem.description}
      />
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-w-0 flex-col gap-14">
          <DesignSection id="tokens" title={strings.designSystem.sections.tokens}>
            <TokenSections />
          </DesignSection>

          <DesignSection id="buttons" title={strings.designSystem.sections.buttons}>
            <PrimitivesSection />
          </DesignSection>

          <DesignSection id="forms" title={strings.designSystem.sections.forms}>
            <FormDemo />
          </DesignSection>

          <DesignSection id="feedback" title={strings.designSystem.sections.feedback}>
            <PageStateDemo />
          </DesignSection>

          <DesignSection id="data-display" title={strings.designSystem.sections.dataDisplay}>
            <DataDisplaySection />
          </DesignSection>

          <DesignSection id="overlays" title={strings.designSystem.sections.overlays}>
            <OverlayDemos />
          </DesignSection>

          <DesignSection
            id="navigation"
            title={strings.designSystem.sections.navigation}
            description="Breadcrumbs render above this page title. The command palette searches the navigation map and runs global actions."
          >
            <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-6">
              <CommandTrigger />
              <p className="text-body-sm text-muted-foreground">
                Press{" "}
                <kbd className="bg-muted text-caption rounded border px-1.5 py-0.5 font-mono">
                  Ctrl K
                </kbd>{" "}
                anywhere to search, or{" "}
                <kbd className="bg-muted text-caption rounded border px-1.5 py-0.5 font-mono">
                  Shift ?
                </kbd>{" "}
                for the shortcut reference.
              </p>
            </div>
          </DesignSection>

          <DesignSection id="charts" title={strings.designSystem.sections.charts}>
            <ChartSection />
          </DesignSection>

          <DesignSection id="motion" title={strings.designSystem.sections.motionPrimitives}>
            <MotionSection />
          </DesignSection>

          <DesignSection id="shells" title={strings.designSystem.sections.shells}>
            <ShellPreviews />
          </DesignSection>
        </div>

        <nav aria-label={strings.designSystem.tocTitle} className="hidden xl:block">
          <div className="sticky top-24 flex flex-col gap-2 border-l pl-4">
            <p className="text-caption text-muted-foreground font-semibold tracking-wide uppercase">
              {strings.designSystem.tocTitle}
            </p>
            {tocEntries.map((entry) => (
              <a
                key={entry.id}
                href={`#${entry.id}`}
                className={cn(
                  "text-body-sm text-muted-foreground hover:text-foreground rounded-sm transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                )}
              >
                {entry.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
