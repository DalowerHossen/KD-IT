// path: scripts/check-nav-routes.mjs
/**
 * Zero dead-link audit: verifies that every path registered in
 * config/nav-map.ts resolves to a concrete App Router page, and that every
 * internal literal href used in app/ and components/ exists as a route.
 * Runs on plain file contents so it works before dependencies are installed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const appDir = join(repoRoot, "app");

function listPageRoutes(dir, routes) {
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      listPageRoutes(absolute, routes);
      continue;
    }
    if (!/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry)) {
      continue;
    }
    const relativeDir = relative(appDir, dir).split("\\").join("/");
    const withoutGroups = relativeDir
      .split("/")
      .filter((segment) => segment !== "" && !/^\(.*\)$/.test(segment))
      .join("/");
    const route = `/${withoutGroups}`.replace(/\/+$/, "") || "/";
    routes.add(route === "/" ? "/" : route);
  }
}

function listSourceFiles(dir, collector) {
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      listSourceFiles(absolute, collector);
      continue;
    }
    if (/\.(tsx|ts|jsx|js)$/.test(entry)) {
      collector.push(absolute);
    }
  }
}

const routes = new Set();
listPageRoutes(appDir, routes);

const navMapSource = readFileSync(join(repoRoot, "config", "nav-map.ts"), "utf8");
const registeredPaths = [...navMapSource.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);

let failed = false;

for (const path of registeredPaths) {
  if (!routes.has(path)) {
    console.error(`FAIL: nav-map path has no route: ${path}`);
    failed = true;
  }
}

const sourceFiles = [];
listSourceFiles(appDir, sourceFiles);
listSourceFiles(join(repoRoot, "components"), sourceFiles);

for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  const hrefs = content.matchAll(/href=\{?["'`](\/[^"'`]*)["'`]\}?/g);
  for (const match of hrefs) {
    const target = match[1];
    if (target.startsWith("//") || target.includes("[")) {
      continue;
    }
    if (!routes.has(target)) {
      console.error(`FAIL: dead internal link ${target} in ${relative(repoRoot, file)}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `PASS: navigation integrity holds for ${registeredPaths.length} registered paths across ${routes.size} routes.`,
);
