// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type { CallbackTaskRecord, CallSessionRecord } from "@drts/contracts";
import * as contracts from "../../../packages/contracts/src/index";
import * as canvas from "../../../packages/ui-web/src/index";
import * as canvasClient from "../../../packages/ui-web/src/client";
import * as tokens from "../../../packages/ui-tokens/src/index";
import { t as translate } from "../../../apps/ops-console-web/lib/translations";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const CALL = "manual-callback-readback-call";
const TASK = "manual-callback-readback-task";
const READ_ERROR =
  "Canonical callback readback unavailable after acknowledged claim";
const WRITE_ERROR = "Callback claim was rejected before ACK";
const copy = (key: string) => translate(key, "en");
type RecordedPost = { path: string; body: unknown };

function mount() {
  // Hold the external background poll clock so a later read cannot hide the
  // action-local error; production timers and the manual refresh stay intact.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let task: CallbackTaskRecord = {
    callbackTaskId: TASK,
    callId: CALL,
    callerPhone: "0900000000",
    agentId: "AGENT-OPS-001",
    linkedOrderId: null,
    linkedCaseNo: null,
    dueAt: new Date(Date.now() + 600000).toISOString(),
    note: "Original task",
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    assignedOperatorId: null,
    attemptCount: 0,
    attempts: [],
  };
  const session = (): CallSessionRecord => ({
    callId: CALL,
    callType: "booking",
    callerPhone: task.callerPhone,
    agentId: "AGENT-OPS-001",
    agentIdentityAnnounced: true,
    agentIdentityAnnouncedAt: new Date().toISOString(),
    status: "active",
    startedAt: new Date().toISOString(),
    endedAt: null,
    recordingId: null,
    providerRecordingRef: null,
    recordingUrl: null,
    linkedOrderId: null,
    linkedCaseNo: null,
    lastEtaQuotedMinutes: null,
    lastEtaQuotedAt: null,
    callbackTask: task,
    recordingState: "pending",
    flags: [],
  });
  const posts: RecordedPost[] = [];
  let postFails = false;
  let failReadbackAfterAck = false;
  let acknowledged = false;
  let readFailures = 0;
  let canonicalReads = 0;
  const ok = (data: unknown) => Response.json({ data });
  const fetchPort = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://unit.invalid");
      const path = url.pathname;
      if (init?.method === "POST") {
        const body: unknown = JSON.parse(String(init.body));
        posts.push({ path, body });
        if (path !== `/api/callcenter/callbacks/${TASK}/claim`)
          throw new Error(`Unexpected callback write: ${path}`);
        if (postFails)
          return Response.json(
            {
              error: {
                code: "SIM_REJECTED",
                message: WRITE_ERROR,
                retryable: false,
                traceId: "unit-write-trace",
              },
            },
            { status: 503 },
          );
        task = {
          ...task,
          status: "claimed",
          version: (task.version ?? 1) + 1,
          assignedOperatorId: (body as { operatorId: string }).operatorId,
        };
        acknowledged = true;
        return ok(task);
      }
      if (
        path === "/api/callcenter/sessions" ||
        path === "/api/callcenter/callbacks"
      ) {
        canonicalReads += 1;
        if (acknowledged && failReadbackAfterAck) {
          readFailures += 1;
          return Response.json(
            {
              error: {
                code: "SIM_READ_FAILED",
                message: READ_ERROR,
                retryable: false,
                traceId: "unit-read-trace",
              },
            },
            { status: 503 },
          );
        }
        return ok({ items: path.endsWith("sessions") ? [session()] : [task] });
      }
      // Unrelated map/Voice metrics are external read ports, never fake callback writes.
      return Response.json(
        {
          error: {
            code: "SIM_EXTERNAL_UNAVAILABLE",
            message:
              "Unrelated provider read unavailable in socket-free callback unit",
            retryable: false,
            traceId: "unit-provider-trace",
          },
        },
        { status: 503 },
      );
    },
  );
  vi.stubGlobal("fetch", fetchPort);
  window.__DRTS_RUNTIME_CONFIG__ = {
    apiBaseUrl: "http://callback-ui-unit.invalid",
  };
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/contracts": contracts,
    "@drts/ui-web": canvas,
    "@drts/ui-web/client": canvasClient,
    "@drts/ui-tokens": tokens,
    "next/navigation": {
      useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    },
  };
  const load = createUiModuleLoader(resolve("apps/ops-console-web"), modules);
  // Load both actual modules with the accepted app-scoped source loader.
  // Only fetch and the framework navigation port are simulated.
  modules["@drts/api-client"] = load(
    resolve("packages/api-client/src/index.ts"),
  );
  const { default: Page } = load<{ default: React.ComponentType }>(
    resolve("apps/ops-console-web/app/callcenter/page.tsx"),
  );
  render(<Page />);
  return {
    posts,
    fetchPort,
    rejectWrite: (value: boolean) => {
      postFails = value;
    },
    rejectReadback: (value: boolean) => {
      failReadbackAfterAck = value;
    },
    get task() {
      return task;
    },
    get readFailures() {
      return readFailures;
    },
    get canonicalReads() {
      return canonicalReads;
    },
  };
}
const claim = () =>
  screen.getByRole("button", { name: copy("callcenter.action.claimCallback") });
async function ready() {
  await waitFor(() => expect(claim()).toHaveProperty("disabled", false));
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.__DRTS_RUNTIME_CONFIG__;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("normal mounted Ops callback ACK and canonical readback", () => {
  it("keeps the acknowledged claim and exact readback error, then refreshes the same task without a second POST", async () => {
    const h = mount();
    await ready();
    h.rejectReadback(true);
    fireEvent.click(claim());
    await screen.findByText(copy("callcenter.callback.claimSuccess"));
    await waitFor(() => expect(h.readFailures).toBeGreaterThan(0));
    expect(h.task.status).toBe("claimed");
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]?.path).toBe(`/api/callcenter/callbacks/${TASK}/claim`);
    await screen.findByText(READ_ERROR, { exact: false });
    expect(screen.getByText(copy("callcenter.workspace.stale"))).toBeTruthy();
    expect(
      screen.getByText(copy("callcenter.workspace.degraded")),
    ).toBeTruthy();
    h.rejectReadback(false);
    const readsBeforeRefresh = h.canonicalReads;
    fireEvent.click(
      screen.getByRole("button", { name: copy("callcenter.refreshNow") }),
    );
    await waitFor(() =>
      expect(h.canonicalReads).toBeGreaterThan(readsBeforeRefresh),
    );
    await waitFor(() => expect(claim()).toHaveProperty("disabled", true));
    await waitFor(() =>
      expect(screen.queryByText(READ_ERROR, { exact: false })).toBeNull(),
    );
    expect(
      screen.getByText(copy("callcenter.callback.claimSuccess")),
    ).toBeTruthy();
    expect(h.posts).toHaveLength(1);
    expect(h.task.callbackTaskId).toBe(TASK);
  }, 15000);
  it("preserves a rejected command error and can retry the same task after the failure", async () => {
    const h = mount();
    await ready();
    h.rejectWrite(true);
    fireEvent.click(claim());
    await screen.findByText(copy("common.error"));
    await screen.findByText(WRITE_ERROR, { exact: false });
    expect(
      screen.queryByText(copy("callcenter.callback.claimSuccess")),
    ).toBeNull();
    expect(h.task.status).toBe("pending");
    h.rejectWrite(false);
    fireEvent.click(claim());
    await screen.findByText(copy("callcenter.callback.claimSuccess"));
    expect(screen.queryByText(WRITE_ERROR, { exact: false })).toBeNull();
    expect(h.posts).toHaveLength(2);
    expect(h.posts[1]).toEqual(h.posts[0]);
    expect(h.task.callbackTaskId).toBe(TASK);
  });
  it("keeps a normal acknowledged command and successful canonical refresh error-free", async () => {
    const h = mount();
    await ready();
    fireEvent.click(claim());
    await screen.findByText(copy("callcenter.callback.claimSuccess"));
    await waitFor(() => expect(claim()).toHaveProperty("disabled", true));
    expect(h.posts).toHaveLength(1);
    expect(h.task.status).toBe("claimed");
    expect(h.readFailures).toBe(0);
    expect(screen.queryByText(READ_ERROR, { exact: false })).toBeNull();
    expect(screen.queryByText(WRITE_ERROR, { exact: false })).toBeNull();
    expect(screen.getByText(copy("callcenter.workspace.fresh"))).toBeTruthy();
  });
});
