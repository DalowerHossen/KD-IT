// path: components/design-system/form-demo.tsx
"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { SuccessState } from "@/components/states/success-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { strings } from "@/lib/i18n/strings/en";
import { emailSchema, plainTextSchema } from "@/lib/validation/zod-helpers";

const demoFormSchema = z.strictObject({
  fullName: plainTextSchema(80, "Full name").refine(
    (value) => value.length >= 2,
    strings.designSystem.formDemo.nameTooShort,
  ),
  email: emailSchema,
});

type DemoFormValues = z.infer<typeof demoFormSchema>;

/** Functional form demo: RHF + shared Zod schema, inline errors, success. */
export function FormDemo(): ReactElement {
  const [submitted, setSubmitted] = useState<DemoFormValues | null>(null);
  const form = useForm<DemoFormValues>({
    resolver: standardSchemaResolver(demoFormSchema),
    defaultValues: { fullName: "", email: "" },
    mode: "onBlur",
  });

  const onSubmit = (values: DemoFormValues): void => {
    setSubmitted(values);
    toast({ title: strings.designSystem.formDemo.toastMessage, variant: "success" });
  };

  if (submitted !== null) {
    return (
      <SuccessState
        title={strings.designSystem.formDemo.successTitle}
        description={`${strings.designSystem.formDemo.successDescription} (${submitted.fullName}, ${submitted.email})`}
        action={
          <Button
            variant="outline"
            onClick={() => {
              setSubmitted(null);
              form.reset();
            }}
          >
            {strings.actions.reset}
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.designSystem.formDemo.title}</CardTitle>
        <CardDescription>{strings.designSystem.formDemo.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{strings.designSystem.formDemo.nameLabel}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={strings.designSystem.formDemo.namePlaceholder}
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{strings.designSystem.formDemo.emailLabel}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      placeholder={strings.designSystem.formDemo.emailPlaceholder}
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This field is normalized and validated by the shared server schema.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              isLoading={form.formState.isSubmitting}
              disabled={form.formState.isSubmitting}
            >
              {strings.designSystem.formDemo.submitLabel}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
