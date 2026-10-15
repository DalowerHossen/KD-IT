// path: scripts/acceptance/lib/register.mjs
// Registers the alias loader for acceptance runs.

import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
