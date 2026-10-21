import { createRequire } from "node:module";
import { resolve } from "node:path";

// jsdom's import.meta.url is a browser URL. Resolve Node-only API dependencies
// from this checkout's actual package, without replacing production modules.
export const requireApi = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
);
requireApi("reflect-metadata");
