import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const guard = path.resolve(
  __dirname,
  "../../tools/ci/check-cross-app-imports.mjs",
);
function runGuard(source: string, extension = "ts") {
  const root = mkdtempSync(path.join(tmpdir(), "cross-app-imports-"));
  roots.push(root);
  mkdirSync(path.join(root, "apps/a/src"), { recursive: true });
  writeFileSync(path.join(root, `apps/a/src/entry.${extension}`), source);
  return spawnSync(process.execPath, [guard, root], { encoding: "utf8" });
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("cross-app import CI guard", () => {
  it.each([
    'import { value } from "../../b/missing";',
    'import "../../b/missing";',
    'import type { Value } from "../../b/missing";',
    'export { value } from "../../b/missing";',
    'export * from "../../b/missing";',
    'const value = require("../../b/missing");',
    'const value = require.resolve("../../b/missing");',
    'import value = require("../../b/missing");',
    'type Value = import("../../b/missing").Value;',
    'const value = import("../../b/missing");',
    "const value = import(`../../b/missing`);",
    "const value = import(`../../b/${name}`);",
    'const value = import("../../b/" + name);',
    'const value = import("../../" + "b/missing");',
    'const value = require(("../../b/missing"));',
    'const value = import(("../../" + "b/") + name);',
    'const value = import(`../../${"b"}/missing`);',
    'import "./nested/../../../b/missing?raw";',
    'import "../../../apps/b/missing";',
  ])(
    "rejects relative references even if the target is absent: %s",
    (source) => {
      const result = runGuard(source);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("apps/a/src/entry.ts:1:");
      expect(result.stderr).toContain("crosses from a to b");
    },
  );

  it.each(["js", "jsx", "mjs", "cjs", "mts", "cts", "tsx"])(
    "also checks %s source files",
    (extension) => {
      expect(runGuard('export * from "../../b/file";', extension).status).toBe(
        1,
      );
    },
  );

  it.each([
    '@import "../../b/theme.css";',
    '@import url("../../b/theme.css");',
    "@import url(../../b/theme.css);",
    '@use "../../b/theme";',
    '@forward "../../b/theme";',
  ])("checks stylesheet references: %s", (source) => {
    expect(runGuard(source, "scss").status).toBe(1);
  });

  it("accepts same-app, package and external imports without matching comments or strings", () => {
    const result = runGuard(
      [
        'import "../local";',
        'import "../../../apps/a/local";',
        'import "../../../packages/shared/src";',
        'import { value } from "@drts/shared";',
        'import "next/server";',
        'const local = import("../../b/" + "../a/local");',
        'const templateLocal = import(`../../${"a"}/local`);',
        'const dynamicLocal = import("../local/" + name);',
        '// import "../../b/missing";',
        '/* export * from "../../b/missing"; */',
        "const example = 'import \"../../b/missing\"';",
      ].join("\n"),
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("guard passed");
  });

  it("accepts same-app and external stylesheet imports and ignores comments", () => {
    const result = runGuard(
      `
      @import url(../local.css);
      @import url("https://example.com/theme.css");
      /* @import url(../../b/theme.css); */
    `,
      "css",
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it("reports the deployed nested auth-route failure", () => {
    const result = runGuard(
      'import { createTenantAuthHandlers } from "../../tenant-console-web/lib/auth/route-handlers";',
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("tenant-console-web");
  });
});
