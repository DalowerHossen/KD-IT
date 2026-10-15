// path: components/ui/table.tsx
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export interface TableProps extends ComponentProps<"table"> {
  /** Keeps the first column visible during horizontal scrolling on small screens. */
  readonly stickyFirstColumn?: boolean;
  readonly containerClassName?: string;
}

export function Table({
  className,
  stickyFirstColumn = false,
  containerClassName,
  ...props
}: TableProps): ReactElement {
  return (
    <div className={cn("relative w-full overflow-x-auto rounded-lg border", containerClassName)}>
      <table
        className={cn(
          "text-body-sm w-full caption-bottom",
          stickyFirstColumn &&
            "[&_tbody_td:first-child]:bg-card [&_thead_th:first-child]:bg-muted [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">): ReactElement {
  return <thead className={cn("bg-muted/50 [&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">): ReactElement {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">): ReactElement {
  return (
    <tfoot
      className={cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<"tr">): ReactElement {
  return (
    <tr
      className={cn(
        "duration-fast hover:bg-muted/40 data-[state=selected]:bg-muted border-b transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">): ReactElement {
  return (
    <th
      scope="col"
      className={cn(
        "text-caption text-muted-foreground h-11 px-4 text-left align-middle font-semibold tracking-wide uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">): ReactElement {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">): ReactElement {
  return (
    <caption className={cn("text-body-sm text-muted-foreground mt-3", className)} {...props} />
  );
}
