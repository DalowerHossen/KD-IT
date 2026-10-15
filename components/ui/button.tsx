// path: components/ui/button.tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-body-sm font-medium shadow-sm transition-colors duration-fast ease-standard hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:shadow-sm disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "shadow-none hover:bg-accent hover:text-accent-foreground",
        link: "text-primary shadow-none underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground hover:bg-success/90",
      },
      size: {
        sm: "h-9 min-w-9 rounded-md px-3",
        md: "h-11 min-w-11 rounded-md px-5",
        lg: "h-12 min-w-12 rounded-lg px-8 text-body-md",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
  /** Shows a spinner, blocks repeat submission, and announces busy state. */
  readonly isLoading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps): ReactElement {
  const Comp = asChild ? Slot : "button";
  // Radix Slot merges exactly one child element. The spinner and busy state
  // belong to the native button form only, so the asChild path hands the
  // Slot a single child (its consumers own their interactive content).
  const slotChild = asChild ? (
    children
  ) : (
    <>
      {isLoading ? <Spinner size="sm" label="Working" /> : null}
      {children}
    </>
  );
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled === true || isLoading}
      type={type ?? (asChild ? undefined : "button")}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {slotChild}
    </Comp>
  );
}

export { buttonVariants };
