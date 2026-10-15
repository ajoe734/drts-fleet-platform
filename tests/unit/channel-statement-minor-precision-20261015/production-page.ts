import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import * as ui from "@drts/ui-web";
import * as data from "../../../apps/channel-partner-portal-web/lib/channel-portal-data.server";

// Same approach as ui17-iam's production component loader: transpile actual
// source with channel's @/ resolution, independent of root Vitest's tenant @/.
// Only Next request cookies and the already-imported real modules are supplied.
export function loadDetailPage(): unknown {
  const root = resolve("apps/channel-partner-portal-web");
  const cache = new Map<string, { exports: unknown }>();
  function load(path: string): unknown {
    const file = [path, `${path}.ts`, `${path}.tsx`].find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (!file) throw new Error(`Missing production module: ${path}`);
    if (cache.has(file)) return cache.get(file)!.exports;
    const module = { exports: {} };
    cache.set(file, module);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const requireLocal = (id: string): unknown => {
      if (id === "@drts/ui-web") return ui;
      if (id === "@/lib/channel-portal-data.server") return data;
      if (id === "next/headers") {
        return { cookies: async () => ({ get: () => undefined }) };
      }
      if (id.startsWith("@/")) return load(resolve(root, id.slice(2)));
      if (id.startsWith(".")) return load(resolve(dirname(file), id));
      return createRequire(file)(id);
    };
    new Function("exports", "require", "module", output)(
      module.exports,
      requireLocal,
      module,
    );
    return module.exports;
  }
  return load(resolve(root, "app/statements/[period]/page.tsx"));
}
