// path: components/auth/password-strength-meter.tsx
import type { ReactElement } from "react";

import { evaluatePasswordStrength } from "@/lib/auth/password-policy";
import { strings } from "@/lib/i18n/strings/en";

export interface PasswordStrengthMeterProps {
  readonly password: string;
}

const WARNING_COPY = {
  "too-short": strings.auth.passwordStrength.warnings.tooShort,
  "missing-classes": strings.auth.passwordStrength.warnings.missingClasses,
  "common-pattern": strings.auth.passwordStrength.warnings.commonPattern,
  "repeated-chars": strings.auth.passwordStrength.warnings.repeatedChars,
} as const;

const STRENGTH_BAR = [
  "bg-destructive",
  "bg-destructive",
  "bg-warning",
  "bg-success",
  "bg-success",
] as const;

/**
 * Client-side strength estimate using the shared policy module: the same
 * estimator the server applies, minus the breach verdict the browser can
 * never know. Renders nothing until the user starts typing.
 */
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps): ReactElement {
  if (password.length === 0) {
    return <div aria-live="polite" />;
  }
  const strength = evaluatePasswordStrength(password);
  const level = strings.auth.passwordStrength.levels[strength.score] ?? "";
  return (
    <div aria-live="polite" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm text-muted-foreground">
          {strings.auth.passwordStrength.label}
        </span>
        <span className="text-body-sm font-medium">{level}</span>
      </div>
      <div
        className="bg-muted flex gap-1 overflow-hidden rounded-full p-0.5"
        role="img"
        aria-label={`${strings.auth.passwordStrength.label}: ${level}`}
      >
        {[0, 1, 2, 3].map((segment) => (
          <div
            key={segment}
            className={`h-1.5 flex-1 rounded-full ${
              segment < strength.score ? STRENGTH_BAR[strength.score] : "bg-transparent"
            }`}
          />
        ))}
      </div>
      {strength.warnings.length > 0 ? (
        <ul className="text-body-sm text-muted-foreground flex flex-col gap-0.5">
          {strength.warnings.map((warning) => (
            <li key={warning}>{WARNING_COPY[warning]}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
