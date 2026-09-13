import { createRequire } from "node:module";
import path from "node:path";

const requireMod = createRequire(import.meta.url);

// Ensure compiled contracts and control-plane-auth modules are mapped to their .d.ts resolution paths
// used by apps/api/tsconfig.json when run through tsx.
for (const pkg of ["contracts", "control-plane-auth"]) {
  try {
    let realMod: unknown;
    try {
      realMod = requireMod(path.resolve(`packages/${pkg}/dist/index.js`));
    } catch {
      realMod = requireMod(path.resolve(`packages/${pkg}/src/index.ts`));
    }
    const dtsPath = path.resolve(`packages/${pkg}/dist/index.d.ts`);
    if (requireMod.cache) {
      requireMod.cache[dtsPath] = {
        id: dtsPath,
        filename: dtsPath,
        loaded: true,
        exports: realMod,
        children: [],
        paths: [],
        path: path.dirname(dtsPath),
        isPreloading: false,
        require: requireMod,
        parent: null,
      };
    }
  } catch {
    // ignore
  }
}
