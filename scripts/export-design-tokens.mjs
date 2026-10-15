// path: scripts/export-design-tokens.mjs
/**
 * Serializes the single design-token source (config/design-tokens.ts) to
 * public/design-tokens.json for downstream tooling. Requires the Node.js
 * TypeScript type-stripping support available in Node 22.18 and later.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

const tokensModule = await import("../config/design-tokens.ts");

const payload = {
  schemaVersion: 1,
  source: "config/design-tokens.ts",
  breakpoints: tokensModule.breakpoints,
  minimumViewportWidth: tokensModule.minimumViewportWidth,
  spacingScale: tokensModule.spacingScale,
  radiusScale: tokensModule.radiusScale,
  shadowScale: tokensModule.shadowScale,
  zIndexScale: tokensModule.zIndexScale,
  motion: {
    durations: tokensModule.motionDurations,
    easings: tokensModule.motionEasings,
  },
  colorTokens: tokensModule.colorTokens,
  typographyScale: tokensModule.typographyScale,
  layout: tokensModule.layoutTokens,
  minimumTouchTargetPx: tokensModule.minimumTouchTargetPx,
};

const outputPath = join(repoRoot, "public", "design-tokens.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote design token export to ${outputPath}`);
