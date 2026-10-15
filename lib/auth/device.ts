// path: lib/auth/device.ts
import "server-only";

import { createHmac } from "node:crypto";

import { getEncryptionMasterKeyMaterial } from "@/lib/config/env";
import { genericUuidSchema } from "@/lib/validation/zod-helpers";

/**
 * Server-side device identity. The device key is an HMAC over the user id
 * and a version-normalized user agent, so browser upgrades do not churn
 * device rows while distinct devices stay distinct. IP addresses are
 * recorded as signals on the row, never as identity, because mobile
 * networks rotate them. Raw user agents never persist; only the key hash,
 * a short display label, and hashed signals are stored.
 */
const DEVICE_KEY_DOMAIN = "kd-auth-device:v1";
const MAX_USER_AGENT_LENGTH = 1000;

export interface DeviceIdentityInput {
  readonly userId: string;
  readonly userAgent: string | null;
}

/** Normalizes a user agent for stable device-key derivation. */
export function normalizeUserAgent(userAgent: string | null): string {
  if (userAgent === null) {
    return "unknown";
  }
  return userAgent
    .slice(0, MAX_USER_AGENT_LENGTH)
    .toLowerCase()
    .replace(/\d[\d._]*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/** Stable HMAC device key for a user and user agent. */
export function deriveDeviceKeyHash(input: DeviceIdentityInput): string {
  const userId = genericUuidSchema.parse(input.userId);
  const normalized = normalizeUserAgent(input.userAgent);
  const master = getEncryptionMasterKeyMaterial();
  try {
    const domainKey = createHmac("sha256", master).update(DEVICE_KEY_DOMAIN, "utf8").digest();
    try {
      return createHmac("sha256", domainKey)
        .update(`${userId}:${normalized}`, "utf8")
        .digest("hex");
    } finally {
      domainKey.fill(0);
    }
  } finally {
    master.fill(0);
  }
}

export interface DeviceLabel {
  readonly displayLabel: string;
  readonly platform: string;
}

function detectBrowser(ua: string): string {
  if (ua.includes("edg/") || ua.includes("edg ")) {
    return "Edge";
  }
  if (ua.includes("opr/") || ua.includes("opera")) {
    return "Opera";
  }
  if (ua.includes("chrome/") || ua.includes("chromium/")) {
    return "Chrome";
  }
  if (ua.includes("firefox/") || ua.includes("fxios/")) {
    return "Firefox";
  }
  if (ua.includes("safari/") && ua.includes("version/")) {
    return "Safari";
  }
  return "Unknown browser";
}

function detectPlatform(ua: string): string {
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    return "iOS";
  }
  if (ua.includes("android")) {
    return "Android";
  }
  if (ua.includes("windows")) {
    return "Windows";
  }
  if (ua.includes("mac os") || ua.includes("macintosh")) {
    return "macOS";
  }
  if (ua.includes("linux")) {
    return "Linux";
  }
  return "Unknown device";
}

/** Minimal dependency-free browser and platform labeling for sessions. */
export function parseDeviceLabel(userAgent: string | null): DeviceLabel {
  if (userAgent === null || userAgent.trim() === "") {
    return { displayLabel: "Unknown device", platform: "Unknown device" };
  }
  const ua = userAgent.slice(0, MAX_USER_AGENT_LENGTH).toLowerCase();
  const browser = detectBrowser(ua);
  const platform = detectPlatform(ua);
  if (browser === "Unknown browser" && platform === "Unknown device") {
    return { displayLabel: "Unknown device", platform };
  }
  if (browser === "Unknown browser") {
    return { displayLabel: platform, platform };
  }
  if (platform === "Unknown device") {
    return { displayLabel: browser, platform };
  }
  return { displayLabel: `${browser} on ${platform}`, platform };
}
