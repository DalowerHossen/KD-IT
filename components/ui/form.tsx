// path: components/ui/form.tsx
"use client";

import type * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import { createContext, useContext, useId, type ComponentProps, type ReactElement } from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

/**
 * Form field primitives binding React Hook Form to the design system. Zod
 * schemas shared with the server drive validation, labels associate via
 * htmlFor, and error messages announce through aria-describedby and a polite
 * live region.
 */
export const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  readonly name: TName;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>): ReactElement {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

interface FormItemContextValue {
  readonly id: string;
}

const FormItemContext = createContext<FormItemContextValue | null>(null);

export function useFormField(): {
  readonly id: string;
  readonly name: string;
  readonly formItemId: string;
  readonly formDescriptionId: string;
  readonly formMessageId: string;
  readonly invalid: boolean;
  readonly isDirty: boolean;
  readonly isTouched: boolean;
  readonly error?: { readonly message?: string };
} {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (fieldContext === null || itemContext === null) {
    throw new Error("useFormField must be used inside <FormField> and <FormItem>.");
  }

  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    invalid: fieldState.invalid,
    isDirty: fieldState.isDirty,
    isTouched: fieldState.isTouched,
    error: fieldState.error,
  };
}

export function FormItem({ className, ...props }: ComponentProps<"div">): ReactElement {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn("flex flex-col gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): ReactElement {
  const { error, formItemId } = useFormField();
  return (
    <Label
      className={cn(error !== undefined && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

export function FormControl({ ...props }: ComponentProps<typeof Slot>): ReactElement {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      id={formItemId}
      aria-describedby={
        error === undefined ? formDescriptionId : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={error !== undefined}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: ComponentProps<"p">): ReactElement {
  const { formDescriptionId } = useFormField();
  return (
    <p
      id={formDescriptionId}
      className={cn("text-body-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function FormMessage({
  className,
  children,
  ...props
}: ComponentProps<"p">): ReactElement | null {
  const { error, formMessageId } = useFormField();
  const body = error?.message === undefined || error.message === "" ? children : error.message;

  if (body === undefined || body === "") {
    return null;
  }

  return (
    <p
      id={formMessageId}
      role="alert"
      aria-live="polite"
      className={cn("text-body-sm text-destructive font-medium", className)}
      {...props}
    >
      {body}
    </p>
  );
}
