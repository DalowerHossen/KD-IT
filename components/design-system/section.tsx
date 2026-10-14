// path: components/design-system/section.tsx
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface DesignSectionProps {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Anchored, consistently spaced section of the design system reference. */
export function DesignSection({
  id,
  title,
  description,
  children,
  className,
}: DesignSectionProps): ReactElement {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn("scroll-mt-24", className)}>
      <div className="mb-4 flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-heading-md font-semibold tracking-tight">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="text-body-sm text-muted-foreground max-w-prose">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
