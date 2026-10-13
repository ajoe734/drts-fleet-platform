import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";

export const root = resolve(import.meta.dirname, "../../..");
export const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const cache = new Map<string, { exports: unknown }>();

// Transpile actual Nest sources with decorator metadata. Evaluate definitions
// only: no Nest application, HTTP listener, database or provider is started.
export function production<T>(relative: string): T {
  const file = resolve(root, relative);
  const cached = cache.get(file);
  if (cached) return cached.exports as T;
  const module = { exports: {} as unknown };
  cache.set(file, module);
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  });
  const requireSource = (id: string): unknown => {
    if (id.startsWith(".")) {
      const base = resolve(dirname(file), id);
      for (const candidate of [base + ".ts", resolve(base, "index.ts")]) {
        if (existsSync(candidate)) return production(candidate);
      }
    }
    return apiRequire(id);
  };
  const evaluate = runInThisContext(
    `(function(require,module,exports,__filename,__dirname){${output.outputText}\n})`,
    { filename: file },
  ) as (
    require: (id: string) => unknown,
    module: { exports: unknown },
    exports: unknown,
    filename: string,
    dirname: string,
  ) => void;
  evaluate(requireSource, module, module.exports, file, dirname(file));
  return module.exports as T;
}
