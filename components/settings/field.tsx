// path: components/settings/field.tsx
import type { ComponentProps, ReactElement } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { strings } from "@/lib/i18n/strings/en";
import { cn } from "@/lib/utils/cn";

/** Shared base classes so native selects match the Input primitive. */
const FIELD_BASE =
  "border-input bg-background text-body-md duration-fast focus-visible:ring-ring focus-visible:ring-offset-background aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 h-11 w-full rounded-md border px-3 py-2 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

interface BaseFieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly optional?: boolean;
}

function OptionalMark(): ReactElement | null {
  return (
    <span className="text-body-sm text-muted-foreground ml-1 font-normal">
      ({strings.settings.common.optional})
    </span>
  );
}

function FieldError({ id, message }: { id: string; message: string }): ReactElement {
  return (
    <p id={`${id}-error`} role="alert" className="text-body-sm text-destructive">
      {message}
    </p>
  );
}

/** Label + text input + field error. */
export function TextField(props: BaseFieldProps & ComponentProps<"input">): ReactElement {
  const { id, label, error, optional, ...input } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <OptionalMark /> : null}
      </Label>
      <Input
        id={id}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        {...input}
      />
      {error !== undefined ? <FieldError id={id} message={error} /> : null}
    </div>
  );
}

/** Label + native select + field error. */
export function SelectField(
  props: BaseFieldProps & {
    options: readonly { value: string; label: string }[];
  } & ComponentProps<"select">,
): ReactElement {
  const { id, label, error, optional, options, className, ...select } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <OptionalMark /> : null}
      </Label>
      <select
        id={id}
        className={cn(FIELD_BASE, "cursor-pointer appearance-none pr-8", className)}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        {...select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error !== undefined ? <FieldError id={id} message={error} /> : null}
    </div>
  );
}

/** Label + textarea + field error. */
export function TextAreaField(props: BaseFieldProps & ComponentProps<"textarea">): ReactElement {
  const { id, label, error, optional, ...textarea } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <OptionalMark /> : null}
      </Label>
      <Textarea
        id={id}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        {...textarea}
      />
      {error !== undefined ? <FieldError id={id} message={error} /> : null}
    </div>
  );
}

/** A labelled section heading used to group settings fields. */
export function SettingsSectionTitle({ children }: { children: string }): ReactElement {
  return <h2 className="text-display-sm font-semibold">{children}</h2>;
}
