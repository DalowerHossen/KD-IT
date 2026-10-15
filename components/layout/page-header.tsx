// path: components/layout/page-header.tsx
import type { ReactElement, ReactNode } from "react";

import { NavBreadcrumbs } from "@/components/layout/nav-breadcrumbs";
import { cn } from "@/lib/utils/cn";

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** Primary actions rendered on the right, main action last. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/** Standard page header: breadcrumb, title, description, and actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps): ReactElement {
  return (
    <div className={cn("flex flex-col gap-3 pb-6", className)}>
      <NavBreadcrumbs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-heading-lg font-bold tracking-tight">{title}</h1>
          {description === undefined ? null : (
            <p className="text-body-sm text-muted-foreground max-w-prose">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
