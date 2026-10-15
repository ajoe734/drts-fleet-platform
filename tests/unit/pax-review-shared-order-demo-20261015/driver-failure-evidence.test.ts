import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

const specPath = "tests/e2e/pax-review-shared-order-demo.spec.ts";
const source = process.env.PAX_REVIEW_FAILURE_SOURCE_REF
  ? execFileSync(
      "git",
      ["show", `${process.env.PAX_REVIEW_FAILURE_SOURCE_REF}:${specPath}`],
      { encoding: "utf8" },
    )
  : readFileSync(specPath, "utf8");
const ast = ts.createSourceFile(specPath, source, ts.ScriptTarget.Latest, true);
const testCall = ast.statements.find(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(ast) === "test",
);
if (!testCall || !ts.isExpressionStatement(testCall))
  throw new Error("Missing actual hosted journey test");
const call = testCall.expression;
if (!ts.isCallExpression(call)) throw new Error("Missing actual test call");
const callback = call.arguments[1];
if (!callback || !ts.isArrowFunction(callback))
  throw new Error("Missing actual journey callback");
const executable = ts.transpileModule(`(${callback.getText(ast)})`, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

type Options = {
  role?: "A" | "B";
  phase?: "register" | "finish";
  path?: string;
  closed?: boolean;
  screenshotFails?: boolean;
  attachmentFails?: boolean;
  cleanupFails?: boolean;
  visibleLabels?: string[];
  uiProbeFails?: boolean;
  redirectDuringProbe?: boolean;
};

async function exercise(options: Options) {
  const primary = new Error("controlled Driver operation failure");
  const cleanup = new Error("controlled context cleanup failure");
  const captures: string[] = [];
  const attachments: {
    name: string;
    body: Buffer | string;
    contentType: string;
  }[] = [];
  const closedContexts: string[] = [];
  const calls: string[] = [];
  const pages = ["pax", "ops", "A", "B"].map((name) => ({
    name,
    currentURL: "about:blank",
    on: () => {},
    goto: async () => {},
    url() {
      return this.currentURL;
    },
    isClosed: () => options.closed ?? false,
    getByText(label: string, locatorOptions: { exact: boolean }) {
      expect(locatorOptions.exact).toBe(true);
      return {
        first: () => ({
          isVisible: async () => {
            if (options.redirectDuringProbe)
              this.currentURL = new URL("onboarding", this.currentURL).href;
            if (options.uiProbeFails) throw new Error("UI probe unavailable");
            return options.visibleLabels?.includes(label) ?? false;
          },
        }),
      };
    },
    screenshot: async () => {
      captures.push(name);
      if (options.screenshotFails) throw new Error("capture unavailable");
      return Buffer.from(`actual-page-boundary:${name}`);
    },
    context: () => ({
      cookies: async () => [{ name: "pax_session", value: "fixture" }],
    }),
    request: {
      get: async () => ({
        status: () => 200,
        json: async () => ({
          data: { ride: { order: { orderId: "A-order" } } },
        }),
      }),
    },
  }));
  let nextPage = 0;
  const browser = {
    newContext: async () => {
      const page = pages[nextPage++];
      if (!page) throw new Error("Unexpected extra browser context");
      return {
        newPage: async () => page,
        close: async () => {
          closedContexts.push(page.name);
          if (options.cleanupFails) throw cleanup;
        },
      };
    },
  };
  const boundary = async (
    phase: "register" | "finish",
    page: (typeof pages)[number],
    base: string,
  ) => {
    calls.push(`${page.name}:${phase}`);
    page.currentURL = `${base}/${phase === "register" ? "jobs" : "trip"}`;
    if (options.role === page.name && options.phase === phase) {
      page.currentURL = `${base}/${options.path ?? "trip"}`;
      throw primary;
    }
  };
  // Execute the actual complete test callback, including role creation,
  // active-page selection, catch, attachment and cleanup. Journey helpers and
  // browser/HTTP/step boundaries are fixtures: no business acceptance credit.
  const journey = runInNewContext(executable, {
    process: { env: {} },
    URL,
    sharedDev: false,
    PAX: "https://passenger.invalid",
    OPS: "https://ops.invalid",
    DRIVER: "https://standalone.invalid",
    expect,
    camel: (value: unknown) => value,
    createJourneyProgress: () => ({
      response: () => {},
      step: async (label: string, action: () => Promise<unknown>) => {
        if (label.endsWith("browser context")) return action();
        if (label.endsWith("Passenger book")) return `${label[0]}-order`;
      },
    }),
    registerDriver: async (
      _ops: unknown,
      page: (typeof pages)[number],
      base: string,
    ) => boundary("register", page, base),
    finish: async (page: (typeof pages)[number], base: string) =>
      boundary("finish", page, base),
  });
  const info = {
    outputPath: (name: string) => name,
    attach: async (
      name: string,
      data: { body: Buffer | string; contentType: string },
    ) => {
      if (options.attachmentFails) throw new Error("attachment unavailable");
      attachments.push({ name, ...data });
    },
  };
  let error: unknown;
  try {
    await journey({ browser }, info);
  } catch (caught) {
    error = caught;
  }
  return {
    primary,
    cleanup,
    error,
    captures,
    attachments,
    images: attachments.filter((item) => item.contentType === "image/png"),
    closedContexts,
    calls,
  };
}

it.each([
  { role: "A", phase: "finish", path: "jobs" },
  { role: "A", phase: "finish", path: "trip" },
  { role: "B", phase: "register", path: "jobs" },
  { role: "B", phase: "finish", path: "jobs" },
  { role: "B", phase: "finish", path: "trip" },
  { role: "A", phase: "finish", path: "jobs/" },
  { role: "B", phase: "finish", path: "trip/" },
] as const)(
  "captures the actual $role page after $phase fails on $path",
  async (scenario) => {
    const result = await exercise(scenario);
    expect(result.calls.at(-1)).toBe(`${scenario.role}:${scenario.phase}`);
    expect(result.error).toBe(result.primary);
    expect(result.captures).toEqual([scenario.role]);
    expect(result.images).toEqual([
      {
        name: "driver-assigned-trip-failure",
        body: Buffer.from(`actual-page-boundary:${scenario.role}`),
        contentType: "image/png",
      },
    ]);
    expect(result.closedContexts).toEqual(
      scenario.role === "A" ? ["pax", "ops", "A"] : ["pax", "ops", "A", "B"],
    );
  },
);

it("does not capture onboarding after a redirect during the fixed UI probes", async () => {
  const result = await exercise({
    role: "B",
    phase: "finish",
    path: "jobs",
    redirectDuringProbe: true,
  });
  expect(result.error).toBe(result.primary);
  expect(result.captures).toEqual([]);
  expect(result.closedContexts).toEqual(["pax", "ops", "A", "B"]);
});

it.each([
  { path: "onboarding" },
  { path: "trip?credential=fixture" },
  { path: "trip", closed: true },
])(
  "does not substitute A when B has no eligible image: %o",
  async (options) => {
    const result = await exercise({ role: "B", phase: "finish", ...options });
    expect(result.error).toBe(result.primary);
    expect(result.captures).toEqual([]);
    expect(result.images).toEqual([]);
    expect(result.closedContexts).toEqual(["pax", "ops", "A", "B"]);
  },
);

it.each([
  { screenshotFails: true },
  { attachmentFails: true },
  { cleanupFails: true },
])(
  "preserves the primary B failure when evidence or cleanup fails: %o",
  async (options) => {
    const result = await exercise({ role: "B", phase: "finish", ...options });
    expect(result.error).toBe(result.primary);
    expect(result.captures).toEqual(["B"]);
    expect(result.closedContexts).toEqual(["pax", "ops", "A", "B"]);
    if (options.screenshotFails || options.attachmentFails)
      expect(result.images).toEqual([]);
  },
);

it("still propagates cleanup failure after a successful journey", async () => {
  const result = await exercise({ cleanupFails: true });
  expect(result.error).toBe(result.cleanup);
  expect(result.captures).toEqual([]);
  expect(result.attachments).toEqual([]);
  expect(result.closedContexts).toEqual(["pax", "ops", "A", "B"]);
});

it.each([
  {
    path: "jobs",
    visibleLabels: ["載入任務中…"],
    state: {
      route: "jobs",
      loading: true,
      empty: false,
      openCurrentTrip: false,
    },
  },
  {
    path: "jobs/",
    visibleLabels: ["此篩選條件下沒有任務"],
    state: {
      route: "jobs",
      loading: false,
      empty: true,
      openCurrentTrip: false,
    },
  },
  {
    path: "trip",
    visibleLabels: ["開啟目前行程"],
    state: {
      route: "trip",
      loading: false,
      empty: false,
      openCurrentTrip: true,
    },
  },
  { path: "onboarding", state: { route: "onboarding" } },
  { path: "", state: { route: "index" } },
  { path: "unexpected-sensitive-path", state: { route: "other" } },
  {
    path: "trip?credential=fixture#private",
    state: { route: "trip", queryPresent: true },
  },
  { path: "jobs", closed: true, state: { route: "jobs", closed: true } },
  { path: "trip", uiProbeFails: true, state: { route: "trip" } },
])("records bounded state for the actual B page: %o", async (scenario) => {
  const result = await exercise({ role: "B", phase: "finish", ...scenario });
  expect(result.error).toBe(result.primary);
  const attachment = result.attachments.find(
    (item) => item.name === "driver-failure-state",
  );
  expect(attachment?.contentType).toBe("application/json");
  expect(JSON.parse(String(attachment?.body))).toEqual({
    closed: false,
    queryPresent: false,
    loading: null,
    empty: null,
    openCurrentTrip: null,
    ...scenario.state,
  });
  expect(String(attachment?.body)).not.toMatch(
    /fixture|private|sensitive|https/,
  );
});
