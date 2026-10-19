import { callbackTransport } from "../audit-voice-application-regression-20261018/callback-transport";
import { VoiceCallbackService } from "../../../apps/api/src/modules/voice-booking/voice-callback.service";
import { VoiceCallbackController } from "../../../apps/api/src/modules/voice-booking/voice-callback.controller";
import { VoiceBookingController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { randomBytes } from "node:crypto";
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
      contactName: "",
      consentRef: "",
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

it("renders sealed role/revision/phone/evidence and original-replacement history received through the real SDK", async () => {
  Object.assign(detail.task, {
    contactName: "Sealed A",
    contactPhone: "0911000111",
    consentRef: "consent-A",
    contactRole: "booker",
    contactRevisionNumber: 2,
    contactRevisionBoundAt: "2026-10-18T00:00:00Z",
    replacesTaskId: "original-task-A",
    replacementTaskId: "replacement-task-C",
    contactHistory: [
      {
        taskId: "original-task-A",
        revisionNumber: 2,
        role: "booker",
        name: "Sealed A",
        consentRef: "consent-A",
        boundAt: "2026-10-18T00:00:00Z",
        reason: "original consent",
        replacesTaskId: null,
      },
    ],
  });
  render(<VoiceCallbacksPage />);
  await selectTask();
  expect(await screen.findByText("0911000111")).toBeTruthy();
  expect(screen.getByText("代叫聯絡人")).toBeTruthy();
  expect(screen.getByText("replacement-task-C")).toBeTruthy();
  expect(screen.getByText(/original consent/)).toBeTruthy();
});

it("actual mounted replacement controls consume production sealed roles and recover a lost create response through the original receipt", async () => {
  process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
  process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
  try {
    const h = callbackTransport();
    const session = "66666666-6666-4666-8666-666666666666";
    await h.contacts.initializeContacts({
      voiceSessionId: session,
      callerPhone: "0911000111",
      bookerName: "A",
      consentRef: "consent-A",
    });
    const callbacks = new VoiceCallbackService(
        h.repo,
        h.db as never,
        h.contacts,
      ),
      controller = new VoiceCallbackController(callbacks, h.repo);
    const contacts = new VoiceBookingController(
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      h.contacts,
      h.repo,
    );
    const original = await callbacks.createCallbackDurable({
      voiceSessionId: session,
      contactRevisionNumber: 2,
      consentRef: "consent-A",
      actionKey: "original",
    });
    h.tasks[0]!.status = "cancelled";
    let selected = original.task.taskId,
      lost = false;
    const replacementWrites: Array<{ key: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (raw: string, init?: RequestInit) => {
      const url = new URL(raw);
      let envelope: unknown;
      if (url.pathname.endsWith("/callback-scopes"))
        envelope = {
          data: {
            items: [
              {
                resourceScopeId: "6cd363c9-fda1-4da8-b523-e830d369babb",
                brandId: "brand-1",
              },
            ],
          },
        };
      else if (url.pathname.endsWith("/contacts"))
        envelope =
          init?.method === "POST"
            ? await contacts.writeContacts(
                session,
                JSON.parse(String(init.body)),
              )
            : await contacts.getContacts(session);
      else if (url.pathname.endsWith("/callback-receipts"))
        envelope = await controller.receipt(url.searchParams.get("actionKey")!);
      else if (url.pathname.endsWith("/callbacks") && init?.method === "POST") {
        const key = new Headers(init.headers).get("Idempotency-Key")!,
          body = JSON.parse(String(init.body));
        replacementWrites.push({ key, body });
        const result = await controller.create(session, body, key);
        selected = result.data.task!.taskId;
        if (!lost) {
          lost = true;
          throw Error("SIM response lost after actual server commit");
        }
        envelope = result;
      } else if (url.pathname.endsWith("/callbacks"))
        envelope = {
          data: { items: [await callbacks.getTaskForRead(selected)] },
        };
      else envelope = await controller.get(url.pathname.split("/").at(-1)!);
      return Response.json(envelope);
    });
    state.client = new ApiClient({ baseUrl: "https://api.example.test" });
    render(<VoiceCallbacksPage />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: original.task.taskId + " · 已取消",
      }),
    );
    await screen.findByText("0911000111");
    for (const [label, value] of [
      ["新聯絡人姓名", "C"],
      ["新聯絡電話", "0933000333"],
      ["新同意依據", "consent-C"],
      ["聯絡人更正原因", "recipient changed"],
    ])
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "儲存新聯絡人" }));
    await screen.findByText("新聯絡人已儲存；原待辦保留原快照。");
    expect(screen.getByText("0911000111")).toBeTruthy(); // original task still A
    fireEvent.click(
      screen.getByRole("button", { name: "建立替換待辦／查回上次結果" }),
    );
    await screen.findByText("替換待辦結果尚未確認，請使用同一按鈕查回原操作。");
    fireEvent.click(
      screen.getByRole("button", { name: "建立替換待辦／查回上次結果" }),
    );
    await screen.findByText("操作已儲存");
    expect(replacementWrites).toHaveLength(1); // retry recovered the actual receipt
    expect(replacementWrites[0]!.body).toMatchObject({
      contactRevisionNumber: 6,
      consentRef: "consent-C",
      replacesTaskId: original.task.taskId,
    });
    expect(await screen.findByText("0933000333")).toBeTruthy();
    expect(
      (await callbacks.getTaskForRead(original.task.taskId))?.contactPhone,
    ).toBe("0911000111");
  } finally {
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
  }
});
