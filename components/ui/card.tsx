// path: components/ui/card.tsx
import type { ComponentProps, ReactElement } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      className={cn("bg-card text-card-foreground rounded-lg border shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("text-heading-sm leading-none font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("text-body-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}
