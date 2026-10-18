// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src/index";
import type {
  VoiceCallbackOperationResponse,
  VoiceCallbackTaskDetail,
} from "@drts/contracts";
import VoiceCallbacksPage from "../../../apps/ops-console-web/app/callcenter/voice-callbacks/page";
import { CALLBACK_INTENT_STORAGE_KEY } from "../../../apps/ops-console-web/app/callcenter/voice-callbacks/intent";

const state = vi.hoisted(() => ({ client: null as ApiClient | null }));
vi.mock("@/lib/api-client", () => ({ getOpsClient: () => state.client! }));
vi.mock("@/lib/i18n", () => ({ useTranslation: () => ({ locale: "zh" }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

let detail: VoiceCallbackTaskDetail;
let writes: { path: string; key: string; body: Record<string, unknown> }[];
let loseResponse: boolean;
let saved: VoiceCallbackOperationResponse | null;

beforeEach(() => {
  sessionStorage.clear();
  detail = {
    task: {
      taskId: "72e277d1-21ea-483a-a160-913e2d8b09c1",
      voiceSessionId: "27b2e789-bb46-40c8-b613-514205582ecd",
      resourceScopeId: "6cd363c9-fda1-4da8-b523-e830d369babb",
      brandId: "SIM-brand",
      callId: "original-call",
      linkedOrderId: "original-order",
      reason: "SIM callback request",
      priority: "normal",
      dueAt: "2026-10-19T00:00:00Z",
      scheduledAt: null,
      status: "pending",
      assignedOperatorId: null,
      claimExpiresAt: null,
      version: 1,
      attemptCount: 0,
      maxAttempts: 3,
      lastOutcome: null,
      actionKey: "original-create",
      createdAt: "2026-10-18T00:00:00Z",
      updatedAt: "2026-10-18T00:00:00Z",
      closedAt: null,
    },
    attempts: [],
    commands: [],
  };
  writes = [];
  loseResponse = false;
  saved = null;
  state.client = new ApiClient({ baseUrl: "https://api.example.test" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string, init?: RequestInit) => {
      const url = new URL(raw);
      let data: unknown;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const key = new Headers(init.headers).get("Idempotency-Key")!;
        writes.push({ path: url.pathname, key, body });
        if (saved) return Response.json({ data: { ...saved, replayed: true } });
        detail.task = {
          ...detail.task,
          version: 2,
          ...(url.pathname.endsWith("/claim")
            ? { status: "claimed" as const, assignedOperatorId: "SIM-operator" }
            : { attemptCount: 1 }),
        };
        saved = {
          task: { ...detail.task },
          receipt: {
            commandId: "original-command",
            taskId: detail.task.taskId,
            action: url.pathname.endsWith("/claim") ? "claim" : "attempt",
            operatorId: "SIM-operator",
            createdAt: "2026-10-18T01:00:00Z",
          },
          replayed: false,
          operatorNotes: String(body.notes ?? ""),
        };
        detail.commands.push(saved);
        if (loseResponse)
          throw new Error(
            "SIM lost acknowledgement after external transport received the command",
          );
        data = saved;
      } else if (url.pathname.endsWith("/callback-scopes"))
        data = {
          items: [
            {
              resourceScopeId: detail.task.resourceScopeId,
              brandId: detail.task.brandId,
            },
          ],
        };
      else if (url.pathname.endsWith("/callbacks"))
        data = { items: [detail.task] };
      else data = detail;
      return Response.json({ data });
    }),
  );
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

async function selectTask() {
  fireEvent.click(
    await screen.findByRole("button", { name: /SIM callback request/ }),
  );
  await screen.findByText("original-order");
}

it("the actual page selects a scoped task and claims it through the SDK, then reads the original call/order and saved history", async () => {
  render(<VoiceCallbacksPage />);
  await selectTask();
  fireEvent.click(screen.getByRole("button", { name: "領取待辦" }));
  await screen.findByText("操作已儲存");
  await screen.findByText("original-command");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    path: `/api/voice/callbacks/${detail.task.taskId}/claim`,
    body: { expectedVersion: 1 },
  });
  expect(writes[0]!.key).toBeTruthy();
  expect(screen.getByText("original-call")).toBeTruthy();
  expect(sessionStorage.getItem(CALLBACK_INTENT_STORAGE_KEY)).toBeNull();
});

it("a lost contact acknowledgement survives page reload and retries the original command without using the new task version", async () => {
  loseResponse = true;
  const first = render(<VoiceCallbacksPage />);
  await selectTask();
  fireEvent.change(screen.getByLabelText("聯繫說明／結案說明"), {
    target: { value: "SIM first observation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "記錄聯繫結果" }));
  await screen.findByText("操作未確認，請重試或重新讀取。");
  expect(detail.task.version).toBe(2);
  expect(sessionStorage.getItem(CALLBACK_INTENT_STORAGE_KEY)).toBeTruthy();
  first.unmount();
  render(<VoiceCallbacksPage />);
  const retry = await screen.findByRole("button", { name: "重試上一次操作" });
  fireEvent.click(retry);
  await screen.findByText("已查回原操作結果");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[1]!.body.expectedVersion).toBe(1);
  expect(detail.task.attemptCount).toBe(1);
  expect(sessionStorage.getItem(CALLBACK_INTENT_STORAGE_KEY)).toBeNull();
});

it("a cancelled task keeps its call and order visible, disables mutations and warns about an unconfirmed phone hangup", async () => {
  detail.task.status = "cancelled";
  detail.task.dialReconcileRequired = true;
  render(<VoiceCallbacksPage />);
  await selectTask();
  for (const name of [
    "領取待辦",
    "記錄聯繫結果",
    "完成待辦",
    "取消待辦",
    "轉交承辦人",
  ])
    expect(
      (screen.getByRole("button", { name }) as HTMLButtonElement).disabled ||
        (screen.getByRole("button", { name }) as HTMLButtonElement).closest(
          "fieldset",
        )?.disabled,
    ).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain(
    "仍有未確認結束的電話",
  );
  expect(writes).toHaveLength(0);
});
