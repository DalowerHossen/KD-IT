// path: scripts/acceptance/step-02/offline.mjs
// Step 02 offline acceptance: money arithmetic, encryption envelope
// behavior, file security pipeline, and signed delivery tokens. Runs
// without a database; is non-destructive and idempotent by design.

import { randomBytes } from "node:crypto";

const checks = [];
let failures = 0;

function check(id, outcome, detail) {
  checks.push({ id, outcome, detail });
  if (outcome !== true) {
    failures += 1;
  }
  const status = outcome === true ? "PASS" : "FAIL";
  process.stdout.write(`${status} ${id}${detail === undefined ? "" : `: ${detail}`}\n`);
}

process.env.NODE_ENV = "test";
process.env.KD_ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
process.env.KD_ENCRYPTION_KEY_VERSION = "1";

// -------------------------------------------------------------------------
// Money: exact arithmetic on canonical strings, allocation without drift.
// -------------------------------------------------------------------------
const money = await import("../../../lib/money/decimal.ts");

const sum = money.usdSum(["12.5000", "0.1250", "-2.6250"]);
check("money.sum_exact", sum === "10.0000", `got ${sum}`);

const allocated = money.usdAllocateByWeights("100.0000", ["1.0000", "1.0000", "1.0000"]);
check(
  "money.allocation_drift_free",
  allocated.length === 3 && money.usdSum(allocated) === "100.0000",
  JSON.stringify(allocated),
);

check(
  "money.reject_number_leak",
  (() => {
    try {
      money.usdToDecimal("12.5");
      return false;
    } catch {
      return true;
    }
  })(),
);

const product = money.usdMultiplyByRatio("33.3300", "0.3333333333333333333333333");
check("money.half_even_rounding", product === "11.1100", `got ${product}`);

// -------------------------------------------------------------------------
// Encryption envelope: roundtrip, tamper detection, rotation, AAD binding.
// -------------------------------------------------------------------------
process.env.KD_ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
const envModule = await import("../../../lib/config/env.ts");
envModule.getServerEnv();

const crypto = await import("../../../lib/crypto/envelope.ts");

const context = {
  companyId: "11111111-1111-7111-8111-111111111111",
  resourceId: "file-object:22222222-2222-7222-8222-222222222222",
  category: "invoice",
  keyVersion: 1,
};

const plaintext = Buffer.from("KD SOLUTION IT acceptance payload 0123456789", "utf8");
const envelope = crypto.encryptData(context, plaintext);
check("crypto.envelope_shape", envelope.nonce.length === 12 && envelope.tag.length === 16);

const again = crypto.encryptData(context, plaintext);
check(
  "crypto.unique_nonce_per_operation",
  !envelope.nonce.equals(again.nonce) && !envelope.ciphertext.equals(again.ciphertext),
);

const roundtrip = crypto.decryptData(context, envelope);
check("crypto.roundtrip", roundtrip.equals(plaintext));

check(
  "crypto.aad_tamper_detection",
  (() => {
    const moved = { ...context, category: "receipt" };
    try {
      crypto.decryptData(moved, envelope);
      return false;
    } catch {
      return true;
    }
  })(),
);

check(
  "crypto.tag_tamper_detection",
  (() => {
    const forged = { ...envelope, tag: Buffer.from(envelope.tag) };
    forged.tag[0] = (forged.tag[0] ?? 0) ^ 0xff;
    try {
      crypto.decryptData(context, forged);
      return false;
    } catch {
      return true;
    }
  })(),
);

// Rotation support: envelopes record their key version, and decryptData
// resolves the recorded version, so rotation never silences old reads.
const rotatedCtx = { ...context, keyVersion: 2 };
const rotated = crypto.encryptData(rotatedCtx, plaintext);
check("crypto.records_key_version", rotated.keyVersion === 2);
check("crypto.rotated_roundtrip", crypto.decryptData(rotatedCtx, rotated).equals(plaintext));
check(
  "crypto.rotation_aad_bind",
  (() => {
    const forged = { ...rotated, keyVersion: 1 };
    try {
      crypto.decryptData({ ...rotatedCtx, keyVersion: 1 }, forged);
      return false;
    } catch {
      return true;
    }
  })(),
);

const hashes = await import("../../../lib/crypto/hashes.ts");
const hmacA = hashes.contentHmacForCompany(context.companyId, plaintext);
const hmacB = hashes.contentHmacForCompany(context.companyId, plaintext);
const hmacOther = hashes.contentHmacForCompany("33333333-3333-7333-8333-333333333333", plaintext);
check("crypto.tenant_scoped_dedupe_hmac", hmacA === hmacB && hmacA !== hmacOther);

// -------------------------------------------------------------------------
// File security pipeline: names, magic bytes, SVG/PDF active content.
// -------------------------------------------------------------------------
const files = await import("../../../lib/files/validation.ts");

function expectRejected(label, fn) {
  try {
    fn();
    return `${label} was unexpectedly accepted`;
  } catch (error) {
    return error instanceof Error && error.message.length > 0
      ? true
      : `rejected without message: ${String(error)}`;
  }
}

const sanitized = files.sanitizeFilename("../../etc/passwd");
check(
  "files.traversal_sanitized",
  sanitized.sanitizedFilename === "passwd",
  sanitized.sanitizedFilename,
);

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const accepted = files.validateUploadContent(
  files.sanitizeFilename("logo.png"),
  "image/png",
  pngBytes,
  "attachment",
);
check("files.magic_accept", accepted.resolvedMime === "image/png");

check(
  "files.magic_spoof_reject",
  expectRejected("spoofed png", () =>
    files.validateUploadContent(
      files.sanitizeFilename("evil.png"),
      "image/png",
      Buffer.from("%PDF-1.7 fake"),
      "attachment",
    ),
  ),
);

check(
  "files.svg_script_reject",
  expectRejected("svg with script", () =>
    files.validateUploadContent(
      files.sanitizeFilename("badge.svg"),
      "image/svg+xml",
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      "attachment",
    ),
  ),
);

const benignSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
check(
  "files.svg_benign_accept",
  files.validateUploadContent(
    files.sanitizeFilename("badge.svg"),
    "image/svg+xml",
    benignSvg,
    "branding",
  ).resolvedMime === "image/svg+xml",
);

check(
  "files.pdf_active_reject",
  expectRejected("pdf with javascript", () =>
    files.validateUploadContent(
      files.sanitizeFilename("invoice.pdf"),
      "application/pdf",
      Buffer.from("%PDF-1.7\n/Type /Action /JavaScript (app.alert(1))\n%%EOF"),
      "invoice",
    ),
  ),
);

const exifJpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08]),
  Buffer.from("Exif\x00\x00", "latin1"),
  Buffer.from([0xff, 0xda, 0xff, 0xd9]),
]);
check(
  "files.exif_strip",
  files.stripJpegMetadata(exifJpeg).toString("latin1").includes("Exif") === false,
);

// -------------------------------------------------------------------------
// Signed download tokens: validity, expiry, and signature tamper checks.
// -------------------------------------------------------------------------
const signed = await import("../../../lib/storage/signed-urls.ts");
const token = signed.issueSignedDownloadToken(
  context.companyId,
  "22222222-2222-7222-8222-222222222222",
);
const verified = signed.verifySignedDownloadToken(token);
check("signed.roundtrip", verified.fileId === "22222222-2222-7222-8222-222222222222");

check(
  "signed.tamper_reject",
  (() => {
    const parts = token.split(".");
    const forged = `${parts[0]}x.${parts[1]}`;
    try {
      signed.verifySignedDownloadToken(forged);
      return false;
    } catch {
      return true;
    }
  })(),
);

process.stdout.write(
  failures === 0
    ? "offline acceptance: all checks passed\n"
    : `offline acceptance: ${failures} failures\n`,
);
process.exit(failures === 0 ? 0 : 1);
