import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { resolveRuntimeHealth } from "../../../../packages/ui-web/src/environment-badge/environment-resolver";
import { t } from "../../../../apps/platform-admin-web/lib/translations";

// Execute the actual shell adapter without mounting its unrelated auth and
// navigation providers. This catches regressions in the health consumer, not
// just the shared resolver in isolation.
const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../apps/platform-admin-web/components/admin-shell.tsx",
  ),
  "utf8",
);
const ast = ts.createSourceFile(
  "admin-shell.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const adapter = ast.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "normalizeHealthStatus",
);
if (!adapter) throw new Error("Admin shell health adapter was not found");
const js = ts.transpileModule(adapter.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const normalize = new Function(
  "resolveRuntimeHealth",
  `${js}; return normalizeHealthStatus;`,
)(resolveRuntimeHealth) as (value: unknown, responseOk: boolean) => string;

describe("admin health response adapter", () => {
  it.each([undefined, null, "", "future-status", {}, []])(
    "does not report unverified status %j as healthy on HTTP success",
    (value) => expect(normalize(value, true)).toBe("unknown"),
  );
  it("preserves explicit health and gives HTTP failure precedence", () => {
    expect(normalize("healthy", true)).toBe("healthy");
    expect(normalize("degraded", true)).toBe("degraded");
    expect(normalize("healthy", false)).toBe("down");
  });
  it("provides both user-facing unknown labels", () => {
    expect(t("adminShell.health.unknown", "en")).toBe("API unknown");
    expect(t("adminShell.health.unknown", "zh")).toBe("API 未知");
  });
});
