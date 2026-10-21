import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const driverSpecs = [
  "pax-review-shared-order-demo.spec.ts",
  "pax-review-additional-branches.spec.ts",
  "pax-real-dispatch-timeout.spec.ts",
  "ops-review-recovery.spec.ts",
];
const specs = [...driverSpecs, "pax-real-quote-expiry.spec.ts"];

// Execute each original browser-context factory, not a copy of its role logic.
// Only Playwright's context transport is substituted; no browser/server starts.
function factory(
  name: string,
  publicPassenger: boolean,
  driverToken = "fixture-driver-edge",
) {
  const path = `tests/e2e/${name}`;
  const ref = process.env.PAX_ROLE_ROUTING_SOURCE_REF;
  const source = ref
    ? execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let declaration: ts.VariableStatement | undefined;
  let symbol = "";
  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      for (const variable of node.declarationList.declarations) {
        if (
          ts.isIdentifier(variable.name) &&
          ["newRole", "role"].includes(variable.name.text) &&
          variable.initializer &&
          ts.isArrowFunction(variable.initializer)
        ) {
          declaration = node;
          symbol = variable.name.text;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!declaration)
    throw new Error(`Missing original browser role factory: ${path}`);
  const executable = ts.transpileModule(
    `${declaration.getText(ast)}; ${symbol};`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const newContext = vi.fn(async (options: unknown) => {
    void options;
    return {
      route: vi.fn(),
      newPage: async () => ({ on: vi.fn() }),
    };
  });
  const role = runInNewContext(executable, {
    browser: { newContext },
    sharedDev: true,
    publicPassenger,
    PLATFORM_ADMIN: "https://private-platform.invalid",
    contexts: [],
    pages: {},
    progress: { response: vi.fn() },
    process: {
      env: {
        PAX_REVIEW_PASSENGER_ID_TOKEN: "fixture-passenger-edge",
        PAX_REVIEW_OPS_ID_TOKEN: "fixture-ops-edge",
        PAX_REVIEW_DRIVER_ID_TOKEN: driverToken || undefined,
        PAX_REVIEW_PLATFORM_ADMIN_ID_TOKEN: "fixture-platform-edge",
      },
    },
  }) as (role: "pax" | "ops" | "driver") => Promise<unknown>;
  return { role, newContext };
}

describe("actual deployed browser factories keep public Passenger and private Driver credentials separate", () => {
  it.each(specs)(
    "%s does not attach a GCP credential to public Passenger",
    async (name) => {
      const { role, newContext } = factory(name, true);
      await role("pax");
      expect(newContext).toHaveBeenCalledOnce();
      expect(newContext.mock.calls[0]![0]).not.toHaveProperty(
        "extraHTTPHeaders",
      );
    },
  );

  it.each(specs)(
    "%s preserves the original private Passenger mode",
    async (name) => {
      const { role, newContext } = factory(name, false);
      await role("pax");
      expect(newContext.mock.calls[0]![0]).toHaveProperty(
        "extraHTTPHeaders.X-Serverless-Authorization",
        "Bearer fixture-passenger-edge",
      );
    },
  );

  it.each(driverSpecs)(
    "%s uses the separately audienced Driver edge token",
    async (name) => {
      const { role, newContext } = factory(name, true);
      await role("driver");
      expect(newContext.mock.calls[0]![0]).toHaveProperty(
        "extraHTTPHeaders.X-Serverless-Authorization",
        "Bearer fixture-driver-edge",
      );
    },
  );

  it.each(driverSpecs)(
    "%s rejects a missing Driver token without borrowing another role's credential",
    async (name) => {
      const { role, newContext } = factory(name, true, "");
      await expect(role("driver")).rejects.toThrow(/Missing.*credential/);
      expect(newContext).not.toHaveBeenCalled();
    },
  );
});
