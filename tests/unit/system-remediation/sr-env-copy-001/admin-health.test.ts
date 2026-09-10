import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { resolveRuntimeHealth } from "../../../../packages/ui-web/src/environment-badge/environment-resolver";
import { t } from "../../../../apps/platform-admin-web/lib/translations";

// Execute the actual shell adapter without mounting its unrelated auth and
// navigation providers. This catches regressions in the health consumer, not
// just the shared resolver in isolation.
function extractNormalizeHealth(filePath: string, fileName: string) {
  const source = fs.readFileSync(filePath, "utf8");
  const ast = ts.createSourceFile(
    fileName,
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
  if (!adapter) throw new Error(`${fileName} health adapter was not found`);
  const js = ts.transpileModule(adapter.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(
    "resolveRuntimeHealth",
    `${js}; return normalizeHealthStatus;`,
  )(resolveRuntimeHealth) as (value: unknown, responseOk: boolean) => string;
}

const adminNormalize = extractNormalizeHealth(
  path.resolve(
    __dirname,
    "../../../../apps/platform-admin-web/components/admin-shell.tsx",
  ),
  "admin-shell.tsx",
);

const opsNormalize = extractNormalizeHealth(
  path.resolve(
    __dirname,
    "../../../../apps/ops-console-web/components/ops-health-footer.tsx",
  ),
  "ops-health-footer.tsx",
);

const fleetNormalize = extractNormalizeHealth(
  path.resolve(
    __dirname,
    "../../../../apps/fleet-partner-portal-web/components/fleet-portal-health-footer.tsx",
  ),
  "fleet-portal-health-footer.tsx",
);

describe("health response adapters (admin, ops, fleet)", () => {
  describe.each([
    { name: "admin-shell", normalize: adminNormalize },
    { name: "ops-health-footer", normalize: opsNormalize },
    { name: "fleet-portal-health-footer", normalize: fleetNormalize },
  ])("$name health adapter", ({ normalize }) => {
    it.each([undefined, null, "", "future-status", {}, []])(
      "does not report unverified status %j as healthy on HTTP success",
      (value) => expect(normalize(value, true)).toBe("unknown"),
    );
    it("preserves explicit health and gives HTTP failure precedence", () => {
      expect(normalize("healthy", true)).toBe("healthy");
      expect(normalize("degraded", true)).toBe("degraded");
      expect(normalize("healthy", false)).toBe("down");
    });
  });

  it("provides user-facing unknown labels across all consoles", async () => {
    const { t: opsT } =
      await import("../../../../apps/ops-console-web/lib/translations");
    const { t: fleetT } =
      await import("../../../../apps/fleet-partner-portal-web/lib/translations");

    expect(t("adminShell.health.unknown", "en")).toBe("API unknown");
    expect(t("adminShell.health.unknown", "zh")).toBe("API 未知");

    expect(opsT("opsShell.health.unknown", "en")).toBe("API unknown");
    expect(opsT("opsShell.health.unknown", "zh")).toBe("API 未知");

    expect(fleetT("shell.api.unknown", "en")).toBe("API unknown");
    expect(fleetT("shell.api.unknown", "zh")).toBe("API 未知");
  });
});
