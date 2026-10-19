import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src";

afterEach(() => vi.unstubAllGlobals());

// Execute the actual page effect with the real SDK. This is a unit boundary;
// the hosted journey separately mounts the ordinary complaints page.
function selectCase(caseNo: string, client: ApiClient) {
  const file = ts.createSourceFile(
    "complaints.tsx",
    readFileSync("apps/ops-console-web/app/complaints/page.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const matches: ts.ArrowFunction[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "useEffect" &&
      node.arguments[0] &&
      ts.isArrowFunction(node.arguments[0]) &&
      node.arguments[0].getText(file).includes("getComplaintExportView")
    ) {
      matches.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(matches).toHaveLength(1);
  const code = ts.transpileModule(
    `const effect = ${matches[0]!.getText(file)};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const activity = vi.fn();
  const exported = vi.fn();
  const error = vi.fn();
  const effect = new Function(
    "getOpsClient",
    "selectedCaseNo",
    "setActivityItems",
    "setExportView",
    "setError",
    "resolveErrorMessage",
    `${code}; return effect;`,
  )(
    () => client,
    caseNo,
    activity,
    exported,
    error,
    (reason: Error) => reason.message,
  ) as () => () => void;
  return { activity, exported, error, cleanup: effect() };
}

const first = "PAX-11111111-1111-4111-8111-111111111111";
const second = "PAX-22222222-2222-4222-8222-222222222222";
const timeline = (caseNo: string) => [
  {
    entryId: `created-${caseNo}`,
    caseNo,
    action: "case_created",
    note: "乘客真實提交的案件內容",
    createdAt: "2026-10-16T16:00:00.000Z",
  },
];
const client = () => new ApiClient({ baseUrl: "https://ops-api.example" });

it.each([false, true])(
  "publishes the actual selected timeline and export, empty=%s",
  async (empty) => {
    const entries = empty ? [] : timeline(first);
    const view = { caseNo: first, readyForAudit: false };
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      Response.json({
        data: String(input).endsWith("/timeline") ? { items: entries } : view,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const state = selectCase(first, client());
    await vi.waitFor(() =>
      expect(state.activity).toHaveBeenCalledWith(entries),
    );
    expect(state.exported).toHaveBeenCalledWith(view);
    expect(state.error).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual(
      ["export", "timeline"].map(
        (kind) => `https://ops-api.example/api/complaints/${first}/${kind}`,
      ),
    );
    state.cleanup();
  },
);

it("reports an upstream timeline failure without publishing export or fictional history", async () => {
  const fetcher = vi.fn<typeof fetch>(async (input) =>
    String(input).endsWith("/timeline")
      ? Response.json(
          { error: { code: "CASE_HISTORY_UNAVAILABLE", message: "暫不可讀" } },
          { status: 503 },
        )
      : Response.json({ data: { caseNo: first, readyForAudit: false } }),
  );
  vi.stubGlobal("fetch", fetcher);
  const state = selectCase(first, client());
  await vi.waitFor(() => expect(state.error).toHaveBeenCalledTimes(1));
  expect(fetcher.mock.calls.map(([url]) => String(url))).toContain(
    `https://ops-api.example/api/complaints/${first}/timeline`,
  );
  expect(state.activity).not.toHaveBeenCalled();
  expect(state.exported).not.toHaveBeenCalled();
  state.cleanup();
});

it("keeps a previous case's late response out of the newly selected workspace", async () => {
  let finishFirst!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith(`${first}/timeline`)) {
        return new Promise<Response>((resolve) => {
          finishFirst = resolve;
        });
      }
      return Response.json({
        data: url.endsWith("/timeline")
          ? { items: timeline(second) }
          : { caseNo: url.includes(first) ? first : second },
      });
    }),
  );
  const previous = selectCase(first, client());
  previous.cleanup();
  const current = selectCase(second, client());
  await vi.waitFor(() =>
    expect(current.activity).toHaveBeenCalledWith(timeline(second)),
  );
  finishFirst(Response.json({ data: { items: timeline(first) } }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(previous.activity).not.toHaveBeenCalled();
  expect(previous.exported).not.toHaveBeenCalled();
  expect(current.activity).toHaveBeenCalledTimes(1);
  current.cleanup();
});
