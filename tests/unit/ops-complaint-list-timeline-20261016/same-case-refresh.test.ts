// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import ts from "typescript";
import { useEffect, useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const caseNo = "PAX-11111111-1111-4111-8111-111111111111";
const record = { caseNo, updatedAt: "2026-10-16T17:00:00.000Z" };
const created = {
  entryId: "created",
  caseNo,
  action: "case_created",
  note: "乘客提交",
  createdAt: record.updatedAt,
};
const added = {
  entryId: "note",
  caseNo,
  action: "case_note_added",
  note: "演練客服處理備註",
  createdAt: "2026-10-16T17:00:01.000Z",
};

// Register the page's actual effect (including its real dependency array) in
// React. SDK replies are unit fixtures; the hosted journey uses a real case.
function pageEffect() {
  const file = ts.createSourceFile(
    "page.tsx",
    readFileSync("apps/ops-console-web/app/complaints/page.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const matches: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "useEffect" &&
      node.arguments[0]?.getText(file).includes("getComplaintExportView")
    )
      matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (matches.length !== 1)
    throw new Error("Missing unique selected-case page effect");
  const code = ts.transpileModule(matches[0]!.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(
    "context",
    `const {useEffect,getOpsClient,selectedCaseNo,selectedRecord,setActivityItems,setExportView,setError,resolveErrorMessage}=context; ${code}`,
  ) as (context: object) => void;
}
const registerPageEffect = pageEffect();
function useWorkspace(client: ApiClient, selectedRecord: typeof record) {
  const [activityItems, setActivityItems] = useState<unknown[]>([]);
  const [exportView, setExportView] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  registerPageEffect({
    useEffect,
    getOpsClient: () => client,
    selectedCaseNo: selectedRecord.caseNo,
    selectedRecord,
    setActivityItems,
    setExportView,
    setError,
    resolveErrorMessage: (reason: Error) => reason.message,
  });
  return { activityItems, exportView, error };
}

function fixture(deferInitial = false) {
  let entries = [created];
  let firstTimeline = true;
  let releaseEarlier!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/complaints")
      return Response.json({ data: { items: [record] } });
    if (path.endsWith("/notes") && init?.method === "POST") {
      entries = [created, added];
      return Response.json({
        data: { ...record, status: "under_investigation" },
      });
    }
    if (path.endsWith("/timeline")) {
      if (deferInitial && firstTimeline) {
        firstTimeline = false;
        return new Promise<Response>((resolve) => {
          releaseEarlier = resolve;
        });
      }
      return Response.json({ data: { items: entries } });
    }
    if (path.endsWith("/export"))
      return Response.json({
        data: {
          caseNo,
          readyForAudit: false,
          exportGeneratedAt:
            entries.length === 1 ? record.updatedAt : added.createdAt,
        },
      });
    throw new Error("Unexpected fixture request: " + path);
  });
  vi.stubGlobal("fetch", fetcher);
  const client = new ApiClient({ baseUrl: "https://ops-api.example" });
  return {
    client,
    releaseEarlier: () =>
      releaseEarlier(Response.json({ data: { items: [created] } })),
  };
}

it("refreshes the same case's real SDK timeline and export after a note/list reload", async () => {
  const { client } = fixture();
  const view = renderHook(({ current }) => useWorkspace(client, current), {
    initialProps: { current: record },
  });
  await waitFor(() =>
    expect(view.result.current.activityItems).toEqual([created]),
  );
  await client.addComplaintNote(caseNo, { note: added.note });
  const reloaded = (await client.listComplaints())[0]!;
  expect(reloaded.caseNo).toBe(caseNo);
  expect(reloaded.updatedAt).toBe(record.updatedAt);
  view.rerender({ current: reloaded });
  await waitFor(() =>
    expect(view.result.current.activityItems).toEqual([created, added]),
  );
  expect(view.result.current.exportView).toMatchObject({
    exportGeneratedAt: added.createdAt,
  });
  expect(view.result.current.error).toBeNull();
});

it("prevents the previous same-case read from overwriting the refreshed history", async () => {
  const { client, releaseEarlier } = fixture(true);
  const view = renderHook(({ current }) => useWorkspace(client, current), {
    initialProps: { current: record },
  });
  await client.addComplaintNote(caseNo, { note: added.note });
  const reloaded = (await client.listComplaints())[0]!;
  view.rerender({ current: reloaded });
  try {
    await waitFor(() =>
      expect(view.result.current.activityItems).toEqual([created, added]),
    );
  } finally {
    await act(async () => {
      releaseEarlier();
    });
  }
  expect(view.result.current.activityItems).toEqual([created, added]);
});
