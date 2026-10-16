import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import * as contracts from "@drts/contracts";
import * as controlPlaneAuth from "@drts/control-plane-auth";

/** Bounded git-object reads for original-before reproduction; no checkout,
 * history rewrite or copied business implementation. Unchanged dependencies
 * resolve from the accepted workspace; the selected entry is read verbatim. */
export function sourceModuleLoader(
  mocks: Record<string, unknown> = {},
  immutableEntries: string[] = [],
) {
  const cache = new Map<string, unknown>();
  const reference = process.env.NOTICE_ORIGINAL_REF;
  function load<T>(requested: string): T {
    const path = [
      requested,
      `${requested}.ts`,
      `${requested}.tsx`,
      `${requested}/index.ts`,
      `${requested}/index.tsx`,
    ].find((p) => existsSync(p) && statSync(p).isFile());
    if (!path) throw new Error(`Missing source dependency ${requested}`);
    if (cache.has(path)) return cache.get(path) as T;
    const repoPath = relative(process.cwd(), path);
    const source =
      reference && immutableEntries.includes(repoPath)
        ? execFileSync("git", ["show", `${reference}:${repoPath}`], {
            encoding: "utf8",
          })
        : readFileSync(path, "utf8");
    const module = { exports: {} };
    cache.set(path, module.exports);
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        experimentalDecorators: true,
      },
    }).outputText;
    const actualRequire = createRequire(path);
    const moduleDirectory = dirname(path);
    function requireSource(id: string): unknown {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      // Use the real workspace packages through Vitest's source aliases, as
      // ordinary production imports in these tests do. Native require would
      // depend on unbuilt dist files in a clean CI checkout.
      if (id === "@drts/contracts") return contracts;
      if (id === "@drts/control-plane-auth") return controlPlaneAuth;
      if (id.endsWith(".css")) return {};
      if (id.startsWith("@/"))
        return load(resolve("apps/platform-admin-web", id.slice(2)));
      if (id.startsWith(".")) return load(resolve(moduleDirectory, id));
      return actualRequire(id);
    }
    new Function("require", "module", "exports", output)(
      requireSource,
      module,
      module.exports,
    );
    return module.exports as T;
  }
  return load;
}
