/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");

const rootRequire = createRequire(path.resolve(process.cwd(), "package.json"));
const ts = rootRequire("typescript");

/**
 * Playwright 1.59's built-in Babel pipeline defaults to TC39 Stage-3
 * decorators (`version: "2023-05"`), which rejects TypeScript/NestJS
 * parameter decorators (`@Inject`, `@Optional`, `@Body`, `@CurrentIdentity`).
 * Pre-transpiling decorated TypeScript modules with the repository's own
 * TypeScript compiler (`experimentalDecorators: true`,
 * `emitDecoratorMetadata: true`) preserves NestJS decorator semantics before
 * Babel performs its CommonJS transform.
 */
module.exports = function tsLegacyDecoratorsPlugin() {
  return {
    name: "ts-legacy-decorators",
    parserOverride(code, parserOpts, parse) {
      if (!code.includes("@")) {
        return parse(code, parserOpts);
      }
      const result = ts.transpileModule(code, {
        fileName: "module.ts",
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          verbatimModuleSyntax: false,
        },
      });
      return parse(result.outputText, parserOpts);
    },
  };
};
