// path: lib/email/templates/auth.ts
import type { RenderedEmail } from "@/lib/email/adapters/base";

/**
 * Substep H - complete English templates for the authentication emails. Each
 * template returns subject + plain text + HTML. Copy is plain, actionable
 * English; the only dynamic values are the display name, the recipient
 * address, and a destination link (which the flow supplies). No secrets and
 * no PII beyond the address the recipient already owns.
 */

const BRAND = "KD SOLUTION IT";
const SUPPORT_EMAIL = "support@kd-solution.it";

function htmlShell(title: string, body: string, footer: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${title}</title>`,
    "</head>",
    '<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2430;">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">`,
    `<tr><td style="padding:24px 32px;border-bottom:1px solid #eceef2;"><strong style="color:#1f2430;">${BRAND}</strong></td></tr>`,
    `<tr><td style="padding:24px 32px;">${body}</td></tr>`,
    `<tr><td style="padding:16px 32px;background:#f8f9fb;font-size:12px;color:#6b7280;">${footer}</td></tr>`,
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(label: string, href: string): string {
  const safe = escapeHtml(href);
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:12px 0;">',
    `<a href="${safe}" style="display:inline-block;background:#1f6feb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">${escapeHtml(
      label,
    )}</a>`,
    "</td></tr></table>",
  ].join("");
}

const FOOTER = `If you did not expect this email you can safely ignore it. Questions? Contact ${SUPPORT_EMAIL}.`;

export interface ConfirmationTemplateInput {
  readonly displayName: string;
  readonly toAddress: string;
  readonly link: string;
}

export function confirmationTemplate(input: ConfirmationTemplateInput): RenderedEmail {
  const subject = "Confirm your account";
  const text = [
    `Hello ${input.displayName},`,
    "",
    "Thanks for creating your KD SOLUTION IT account. To finish setting up your account, confirm your email address.",
    "",
    `Confirm your account: ${input.link}`,
    "",
    "If you did not create this account, you can ignore this email.",
    "",
    `The ${BRAND} team`,
  ].join("\n");
  const body = [
    `<p>Hello ${escapeHtml(input.displayName)},</p>`,
    "<p>Thanks for creating your KD SOLUTION IT account. To finish setting up your account, please confirm your email address.</p>",
    button("Confirm your account", input.link),
    "<p>If you did not create this account, you can ignore this email.</p>",
    `<p>The ${BRAND} team</p>`,
  ].join("\n");
  return { subject, text, html: htmlShell(subject, body, FOOTER) };
}

export interface RecoveryTemplateInput {
  readonly toAddress: string;
  readonly link: string;
}

export function recoveryTemplate(input: RecoveryTemplateInput): RenderedEmail {
  const subject = "Reset your password";
  const text = [
    "Hello,",
    "",
    "We received a request to reset the password for your KD SOLUTION IT account. Use the link below to choose a new password.",
    "",
    `Reset your password: ${input.link}`,
    "",
    "This link is single-use. If you did not request a reset, you can ignore this email; your password will not change.",
    "",
    `The ${BRAND} team`,
  ].join("\n");
  const body = [
    "<p>Hello,</p>",
    "<p>We received a request to reset the password for your KD SOLUTION IT account. Use the link below to choose a new password.</p>",
    button("Reset your password", input.link),
    "<p>This link is single-use. If you did not request a reset, you can ignore this email; your password will not change.</p>",
    `<p>The ${BRAND} team</p>`,
  ].join("\n");
  return { subject, text, html: htmlShell(subject, body, FOOTER) };
}

export function accountLockedTemplate(): RenderedEmail {
  const subject = "Security notice: your account is temporarily locked";
  const text = [
    "Hello,",
    "",
    "Your KD SOLUTION IT account has been temporarily locked after repeated sign-in attempts. This is a security measure to protect your account.",
    "",
    "You can try signing in again after the lock period ends. If you believe this was a mistake, or you need help regaining access, contact our support team.",
    "",
    `Support: ${SUPPORT_EMAIL}`,
    "",
    `The ${BRAND} security team`,
  ].join("\n");
  const body = [
    "<p>Hello,</p>",
    "<p>Your KD SOLUTION IT account has been temporarily locked after repeated sign-in attempts. This is a security measure to protect your account.</p>",
    "<p>You can try signing in again after the lock period ends. If you believe this was a mistake, or you need help regaining access, please contact our support team.</p>",
    `<p style="color:#6b7280;font-size:13px;">Support: ${SUPPORT_EMAIL}</p>`,
    `<p>The ${BRAND} security team</p>`,
  ].join("\n");
  return { subject, text, html: htmlShell(subject, body, FOOTER) };
}

export interface NotificationTemplateInput {
  readonly title: string;
  readonly body: string;
  readonly link?: string;
}

/**
 * Substep J - the generic in-app notification email. Used when a company's
 * plan includes the "notifications" entitlement, so a notification is also
 * delivered by email. The title becomes the subject; the link is optional.
 */
export function notificationTemplate(input: NotificationTemplateInput): RenderedEmail {
  const subject = input.title;
  const text = [input.body, "", input.link ?? "", "", `The ${BRAND} team`]
    .filter((line) => line !== "")
    .join("\n");
  const body = [
    `<p>${escapeHtml(input.title)}</p>`,
    `<p>${escapeHtml(input.body)}</p>`,
    ...(input.link !== undefined && input.link !== "" ? [button("Open", input.link)] : []),
    `<p>The ${BRAND} team</p>`,
  ].join("\n");
  return { subject, text, html: htmlShell(subject, body, FOOTER) };
}
