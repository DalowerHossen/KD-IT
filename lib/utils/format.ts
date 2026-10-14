// path: lib/utils/format.ts

/**
 * Centralized date and number formatting. Timestamps render in UTC with the
 * en-US locale so output is deterministic across servers and browsers.
 * Monetary formatting lives in lib/money/usd.ts and never uses Number.
 */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function toDate(input: Date | string): Date {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value passed to a formatter.");
  }
  return date;
}

export function formatDateUtc(input: Date | string): string {
  return dateFormatter.format(toDate(input));
}

export function formatDateTimeUtc(input: Date | string): string {
  return `${dateTimeFormatter.format(toDate(input))} UTC`;
}

/** Formats non-monetary integer quantities such as counts and token sizes. */
export function formatCount(value: number): string {
  return integerFormatter.format(value);
}
