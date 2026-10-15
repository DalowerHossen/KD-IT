// path: scripts/acceptance/lib/alias-loader.mjs
// Node resolution hook that maps the "@/lib/..." import alias used across
// lib/ to real files so acceptance scripts can import platform TypeScript
// directly with native type stripping (Node >= 22.18). Also applies
// extension resolution for alias targets (extensionless in source).

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(".");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".mjs", ".js"];

/**
 * Next.js subpath imports are extensionless in source ("next/headers");
 * native ESM resolution requires the .js file. Map the common ones.
 */
const NEXT_SUBPATHS = new Set(["next/headers", "next/navigation", "next/image", "next/dynamic"]);

function withExtension(target) {
  if (existsSync(target) && !target.endsWith("/")) {
    return target;
  }
  for (const extension of EXTENSIONS) {
    const candidate = `${target}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return target;
}

export async function resolve(specifier, context, nextResolve) {
  if (NEXT_SUBPATHS.has(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }
  if (specifier.startsWith("@/")) {
    const basePath = path.join(ROOT, specifier.slice(2));
    const target = pathToFileURL(withExtension(basePath)).href;
    return nextResolve(target, context);
  }
  const parent = context.parentURL ?? "";
  if (parent.startsWith("file://") && (specifier.startsWith("./") || specifier.startsWith("../"))) {
    const resolvedPath = new URL(specifier, parent).pathname;
    const resolved = withExtension(resolvedPath);
    if (resolved !== resolvedPath) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }
  return nextResolve(specifier, context);
}
