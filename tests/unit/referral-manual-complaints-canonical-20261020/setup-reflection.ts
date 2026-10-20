import { createRequire } from "node:module";
import { resolve } from "node:path";

// Resolve Node-only dependencies from this checkout's actual API package;
// jsdom's import.meta.url is a browser URL rather than a filesystem location.
export const requireApi = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
);
requireApi("reflect-metadata");
