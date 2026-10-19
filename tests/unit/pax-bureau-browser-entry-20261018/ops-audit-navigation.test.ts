import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const path =
  "tests/e2e/system-remediation/sr-ops-shell-001/ops-shell-acceptance.spec.ts";
const ref = process.env.PAX_OPS_AUDIT_SOURCE_REF;
const source = ref
  ? execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" })
  : readFileSync(path, "utf8");
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
let callback: ts.ArrowFunction | undefined;
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "test") {
    const name = node.arguments[0];
    const body = node.arguments[1];
    if (
      name &&
      ts.isStringLiteral(name) &&
      name.text.includes(
        "dispatch board generates valid cross-app audit URL",
      ) &&
      body &&
      ts.isArrowFunction(body)
    )
      callback = body;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (!callback)
  throw new Error("Missing original dispatch audit navigation case");
const executable = ts.transpileModule(`(${callback.getText(ast)})`, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

async function exercise(href: string, status = 200, redirect = "") {
  const detach = vi.fn();
  const recordError = vi.fn();
  const page = {
    currentURL: "",
    goto: vi.fn(async (url: string) => {
      page.currentURL =
        url.startsWith("https://admin.example/") && redirect ? redirect : url;
      return { status: () => status };
    }),
    locator: vi.fn(() => ({
      first: () => ({
        isVisible: async () => true,
        getAttribute: async () => href,
      }),
    })),
  };
  // Substitute only the external browser/evidence transport. The assertions
  // and URL handling are the original hosted callback, executed unmodified.
  const browserExpect = (value: unknown) =>
    value === page
      ? {
          toHaveURL: async (expected: string) =>
            expect(page.currentURL).toBe(expected),
        }
      : expect(value);
  const run = runInNewContext(executable, {
    URL,
    expect: browserExpect,
    OPS_CONSOLE_URL: "https://ops.example",
    PLATFORM_ADMIN_URL: "https://admin.example",
    BASELINE_PERSONAS: { ops_dispatcher: "fixture-ops" },
    recorder: { recordError },
    attachBrowserEvidenceCollector: () => detach,
  }) as (fixture: { page: typeof page }) => Promise<void>;
  try {
    await run({ page });
  } finally {
    expect(detach).toHaveBeenCalledOnce();
  }
  return page;
}

it.each(["order", "forwarded_order"])(
  "accepts actual %s context whose legitimate ID contains 404",
  async (type) => {
    const href = `https://admin.example/audit?resourceType=${type}&resourceId=voice-3820189d-8535-404b-a5d5-419f102e337d`;
    const page = await exercise(href);
    expect(page.goto).toHaveBeenLastCalledWith(href, {
      waitUntil: "domcontentloaded",
    });
  },
);

it.each([
  "https://wrong.example/audit?resourceType=order&resourceId=valid",
  "https://admin.example/nested/audit?resourceType=order&resourceId=valid",
  "https://admin.example/audit?resourceType=order",
  "https://admin.example/audit?resourceType=unknown&resourceId=valid",
])("keeps invalid target or context rejected: %s", async (href) => {
  await expect(exercise(href)).rejects.toThrow();
});

it("rejects a real HTTP404 independently of resource ID text", async () => {
  await expect(
    exercise(
      "https://admin.example/audit?resourceType=order&resourceId=valid",
      404,
    ),
  ).rejects.toThrow();
});

it("rejects a redirect away from the original audit resource context", async () => {
  await expect(
    exercise(
      "https://admin.example/audit?resourceType=order&resourceId=valid",
      200,
      "https://admin.example/login",
    ),
  ).rejects.toThrow();
});
