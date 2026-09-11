import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

// Transpile only the component under test and its pure local dependencies.
// This executes the real render/handler code without importing Next aliases
// or TSX files into the root TypeScript project. Package typechecks run too.
export function createUiModuleLoader(
  appRoot: string,
  mocks: Record<string, unknown> = {},
) {
  const realRequire = createRequire(resolve(appRoot, "package.json"));
  const cache = new Map<string, unknown>();
  function load<T>(path: string): T {
    const file = [path, `${path}.ts`, `${path}.tsx`].find(existsSync);
    if (!file) throw new Error(`Missing test module: ${path}`);
    if (cache.has(file)) return cache.get(file) as T;
    const module = { exports: {} };
    cache.set(file, module.exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const requireLocal = (id: string): unknown => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.endsWith(".css")) return {};
      if (id.startsWith("@/")) return load(resolve(appRoot, id.slice(2)));
      if (id.startsWith(".")) return load(resolve(dirname(file), id));
      return realRequire(id);
    };
    new Function("require", "module", "exports", output)(
      requireLocal,
      module,
      module.exports,
    );
    return module.exports as T;
  }
  return load;
}
