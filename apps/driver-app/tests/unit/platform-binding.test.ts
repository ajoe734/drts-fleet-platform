import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { passthrough } = vi.hoisted(() => ({
  passthrough: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  getPlatformPresence: vi.fn(),
  setPlatformOnline: vi.fn(),
  setPlatformOffline: vi.fn(),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Alert: { alert: mocks.alert },
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    View: p("View"),
  };
});

vi.mock("@expo/vector-icons", () => ({ Ionicons: passthrough("Ionicons") }));

vi.mock("@/components/platform-status-card", () => ({
  PlatformStatusCard: passthrough("PlatformStatusCard"),
  assessPlatformHealth: (record: any) => ({
    canReceiveOrders: record.status === "online" && !record.reauthRequired,
    blockers: [],
    statusLabel: "stub",
    statusTone: record.reauthRequired
      ? "warning"
      : record.status === "online"
        ? "healthy"
        : "danger",
    adapterLabel: "stub",
    adapterTone: "neutral",
    readinessLabel: "stub",
    tokenInfo: { label: "stub", urgency: "safe" },
  }),
  getPlatformHealthSeverity: (assessment: any) =>
    assessment.statusTone === "danger"
      ? 2
      : assessment.statusTone === "warning"
        ? 1
        : 0,
}));

vi.mock("@/components/ui/ActionButton", () => ({
  ActionButton: passthrough("ActionButton"),
}));
vi.mock("@/components/ui/ErrorBanner", () => ({
  ErrorBanner: passthrough("ErrorBanner"),
}));
vi.mock("@/components/ui/FormField", () => ({
  FormField: passthrough("FormField"),
}));
vi.mock("@/components/ui/StatusChip", () => ({
  StatusChip: passthrough("StatusChip"),
}));
vi.mock("@/components/ui/tokens", () => ({
  Tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => "#000" }) }),
}));

vi.mock("@/lib/api-client", () => ({
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  getDriverClient: () => ({
    getPlatformPresence: mocks.getPlatformPresence,
    setPlatformOnline: mocks.setPlatformOnline,
    setPlatformOffline: mocks.setPlatformOffline,
  }),
}));

import { PlatformBinding } from "../../components/platform-binding";

async function flush() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

async function renderBinding(props: Record<string, unknown> = {}) {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(PlatformBinding, props));
    await flush();
  });
  return renderer;
}

function presence(overrides: Record<string, unknown> = {}) {
  return {
    driverId: "drv-001",
    platformCode: "uber",
    accountId: "acct-1",
    status: "online",
    eligibility: "eligible",
    tokenExpiresAt: null,
    reauthRequired: false,
    lastOnlineAt: null,
    lastOfflineAt: null,
    updatedAt: "2026-05-08T00:00:00.000Z",
    ...overrides,
  };
}

function texts(renderer: any): string[] {
  return renderer.root
    .findAll((node: any) => node.type === "Text")
    .flatMap((node: any) =>
      Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children],
    )
    .filter((value: unknown) => typeof value === "string");
}

function actionButton(renderer: any, title: string) {
  return renderer.root
    .findAll((node: any) => node.type === "ActionButton")
    .find((node: any) => node.props.title === title);
}

function field(renderer: any, label: string) {
  return renderer.root
    .findAll((node: any) => node.type === "FormField")
    .find((node: any) => node.props.label === label);
}

function cards(renderer: any) {
  return renderer.root.findAll(
    (node: any) => node.type === "PlatformStatusCard",
  );
}

function chips(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "StatusChip")
    .map((node: any) => node.props.label);
}

function lastAlert(): any[] {
  return mocks.alert.mock.calls.at(-1) as any[];
}

describe("PlatformBinding", () => {
  beforeEach(() => {
    mocks.alert.mockReset();
    mocks.getPlatformPresence.mockReset().mockResolvedValue({
      presences: [presence()],
      adapterStatuses: [],
      notes: [],
    });
    mocks.setPlatformOnline.mockReset().mockResolvedValue(undefined);
    mocks.setPlatformOffline.mockReset().mockResolvedValue(undefined);
  });

  describe("loading and listing", () => {
    it("shows a spinner while the first fetch runs", async () => {
      mocks.getPlatformPresence.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(PlatformBinding));
      });
      expect(
        renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
      ).toHaveLength(1);
    });

    it("renders one card per bound platform", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          presence({ platformCode: "uber" }),
          presence({ platformCode: "grab" }),
        ],
        adapterStatuses: [],
        notes: [],
      });
      const renderer = await renderBinding();
      expect(cards(renderer)).toHaveLength(2);
    });

    it("orders the most severe platform first", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          presence({ platformCode: "uber", status: "online" }),
          presence({ platformCode: "grab", status: "offline" }),
        ],
        adapterStatuses: [],
        notes: [],
      });
      const renderer = await renderBinding();

      expect(cards(renderer)[0].props.record.platformCode).toBe("grab");
    });

    it("summarises ready, attention and blocked counts", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          presence({ platformCode: "uber", status: "online" }),
          presence({ platformCode: "grab", reauthRequired: true }),
          presence({ platformCode: "line-taxi", status: "offline" }),
        ],
        adapterStatuses: [],
        notes: [],
      });
      const renderer = await renderBinding();

      expect(chips(renderer)).toEqual(["可接單 1", "需處理 1", "已阻塞 1"]);
    });

    it("shows an empty message with no bindings and hides the chip row", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [],
        adapterStatuses: [],
        notes: [],
      });
      const renderer = await renderBinding();

      expect(texts(renderer)).toContain("目前尚未綁定任何平台帳號。");
      expect(chips(renderer)).toEqual([]);
    });

    it("renders every sync note from the API", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [presence()],
        adapterStatuses: [],
        notes: ["Uber 憑證由平台端輪替", "Grab 需人工補件"],
      });
      const renderer = await renderBinding();

      expect(texts(renderer)).toContain("同步說明");
      expect(texts(renderer)).toContain("Uber 憑證由平台端輪替");
      expect(texts(renderer)).toContain("Grab 需人工補件");
    });

    it("shows the section title only when asked", async () => {
      const withTitle = await renderBinding({ showSectionTitle: true });
      expect(texts(withTitle)).toContain("平台帳號綁定");

      const without = await renderBinding({ showSectionTitle: false });
      expect(texts(without)).not.toContain("平台帳號綁定");
    });

    it("banners a load failure without alerting on the silent first load", async () => {
      mocks.getPlatformPresence.mockRejectedValue(new Error("presence down"));
      const renderer = await renderBinding();

      const errors = renderer.root
        .findAll((node: any) => node.type === "ErrorBanner")
        .map((node: any) => node.props.message);
      expect(errors).toContain("平台綁定資料同步失敗：presence down");
      expect(mocks.alert).not.toHaveBeenCalled();
    });
  });

  describe("binding a new platform", () => {
    it("opens the bind form from the add button", async () => {
      const renderer = await renderBinding();

      expect(field(renderer, "平台代碼")).toBeUndefined();
      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });

      expect(field(renderer, "平台代碼")).toBeDefined();
      expect(actionButton(renderer, "完成綁定")).toBeDefined();
      expect(actionButton(renderer, "新增平台綁定")).toBeUndefined();
    });

    it("lists every supported platform code as help text", async () => {
      const renderer = await renderBinding();
      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });

      const help = field(renderer, "平台代碼").props.helpText as string;
      for (const code of [
        "uber",
        "grab",
        "line-taxi",
        "grab_taiwan",
        "indriver",
        "forwarder_sandbox",
      ]) {
        expect(help).toContain(code);
      }
    });

    it("rejects an empty platform code", async () => {
      const renderer = await renderBinding();
      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });
      await act(async () => {
        actionButton(renderer, "完成綁定").props.onPress();
        await flush();
      });

      expect(lastAlert()).toEqual(["欄位未完成", "請先輸入平台代碼。"]);
      expect(mocks.setPlatformOnline).not.toHaveBeenCalled();
    });

    it("rejects an unsupported platform code", async () => {
      const renderer = await renderBinding();
      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });
      await act(async () => {
        field(renderer, "平台代碼").props.onChangeText("bolt");
      });
      await act(async () => {
        actionButton(renderer, "完成綁定").props.onPress();
        await flush();
      });

      expect(lastAlert()[0]).toBe("平台代碼無效");
      expect(mocks.setPlatformOnline).not.toHaveBeenCalled();
    });

    it("normalises case and whitespace before submitting", async () => {
      const renderer = await renderBinding();
      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });
      await act(async () => {
        field(renderer, "平台代碼").props.onChangeText("  UBER  ");
      });
      await act(async () => {
        actionButton(renderer, "完成綁定").props.onPress();
        await flush();
      });

      expect(mocks.setPlatformOnline).toHaveBeenCalledWith({
        platformCode: "uber",
        tokenExpiresAt: null,
      });
      expect(lastAlert()).toEqual([
        "平台綁定已更新",
        "已完成「Uber」平台綁定。",
      ]);
    });

    it("submits an optional token expiry", async () => {
      const renderer = await renderBinding();
      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });
      // Both field handlers spread the closed-over `form`, so two edits batched
      // into one render would clobber each other. Drive them as a user would.
      await act(async () => {
        field(renderer, "平台代碼").props.onChangeText("grab");
      });
      await act(async () => {
        field(renderer, "平台憑證到期時間（選填）").props.onChangeText(
          " 2026-06-01T08:30:00Z ",
        );
      });
      await act(async () => {
        actionButton(renderer, "完成綁定").props.onPress();
        await flush();
      });

      expect(mocks.setPlatformOnline).toHaveBeenCalledWith({
        platformCode: "grab",
        tokenExpiresAt: "2026-06-01T08:30:00Z",
      });
    });

    it("closes the form and reloads after a successful bind", async () => {
      const renderer = await renderBinding();
      const before = mocks.getPlatformPresence.mock.calls.length;

      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });
      await act(async () => {
        field(renderer, "平台代碼").props.onChangeText("uber");
      });
      await act(async () => {
        actionButton(renderer, "完成綁定").props.onPress();
        await flush();
      });

      expect(actionButton(renderer, "新增平台綁定")).toBeDefined();
      expect(mocks.getPlatformPresence.mock.calls.length).toBe(before + 1);
    });

    it("keeps the form open when the bind is rejected", async () => {
      mocks.setPlatformOnline.mockRejectedValue(new Error("平台拒絕綁定"));
      const renderer = await renderBinding();

      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });
      await act(async () => {
        field(renderer, "平台代碼").props.onChangeText("uber");
      });
      await act(async () => {
        actionButton(renderer, "完成綁定").props.onPress();
        await flush();
      });

      expect(lastAlert()).toEqual(["無法更新平台綁定", "平台拒絕綁定"]);
      expect(actionButton(renderer, "完成綁定")).toBeDefined();
    });

    it("cancels the form without calling the API", async () => {
      const renderer = await renderBinding();
      await act(async () => {
        actionButton(renderer, "新增平台綁定").props.onPress();
      });
      await act(async () => {
        actionButton(renderer, "取消").props.onPress();
      });

      expect(actionButton(renderer, "新增平台綁定")).toBeDefined();
      expect(mocks.setPlatformOnline).not.toHaveBeenCalled();
    });
  });

  describe("per-platform actions", () => {
    it("offers reauth only for a platform that needs it", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          presence({ platformCode: "uber" }),
          presence({ platformCode: "grab", reauthRequired: true }),
        ],
        adapterStatuses: [],
        notes: [],
      });
      const renderer = await renderBinding();

      const byCode = Object.fromEntries(
        cards(renderer).map((card: any) => [
          card.props.record.platformCode,
          card.props.actions.map((action: any) => action.key),
        ]),
      );
      expect(byCode.uber).toEqual(["unbind"]);
      expect(byCode.grab).toEqual(["reauth", "unbind"]);
    });

    it("opens a pre-filled reauth form from the card action", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [presence({ platformCode: "grab", reauthRequired: true })],
        adapterStatuses: [],
        notes: [],
      });
      const renderer = await renderBinding();

      const reauth = cards(renderer)[0].props.actions.find(
        (action: any) => action.key === "reauth",
      );
      await act(async () => {
        reauth.onPress();
      });

      expect(texts(renderer)).toContain("重新驗證 Grab");
      // The platform is fixed for a reauth, so the code field is not editable.
      expect(field(renderer, "平台代碼")).toBeUndefined();
      expect(actionButton(renderer, "送出驗證")).toBeDefined();
    });

    it("submits the reauth against the pre-selected platform", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [presence({ platformCode: "grab", reauthRequired: true })],
        adapterStatuses: [],
        notes: [],
      });
      const renderer = await renderBinding();

      await act(async () => {
        cards(renderer)[0]
          .props.actions.find((action: any) => action.key === "reauth")
          .onPress();
      });
      await act(async () => {
        actionButton(renderer, "送出驗證").props.onPress();
        await flush();
      });

      expect(mocks.setPlatformOnline).toHaveBeenCalledWith({
        platformCode: "grab",
        tokenExpiresAt: null,
      });
      expect(lastAlert()).toEqual([
        "平台綁定已更新",
        "「Grab」已重新送出驗證。",
      ]);
    });

    it("confirms before unbinding", async () => {
      const renderer = await renderBinding();

      await act(async () => {
        cards(renderer)[0]
          .props.actions.find((action: any) => action.key === "unbind")
          .onPress();
      });

      const [title, message, buttons] = lastAlert();
      expect(title).toBe("解除平台綁定");
      expect(message).toBe("要解除「Uber」的帳號綁定嗎？");
      expect(buttons[0]).toMatchObject({ text: "取消", style: "cancel" });
      expect(buttons[1]).toMatchObject({
        text: "確認解除",
        style: "destructive",
      });
      expect(mocks.setPlatformOffline).not.toHaveBeenCalled();
    });

    it("unbinds and reloads on confirmation", async () => {
      const renderer = await renderBinding();
      const before = mocks.getPlatformPresence.mock.calls.length;

      await act(async () => {
        cards(renderer)[0]
          .props.actions.find((action: any) => action.key === "unbind")
          .onPress();
      });
      await act(async () => {
        await lastAlert()[2][1].onPress();
        await flush();
      });

      expect(mocks.setPlatformOffline).toHaveBeenCalledWith({
        platformCode: "uber",
      });
      expect(mocks.getPlatformPresence.mock.calls.length).toBe(before + 1);
    });

    it("reports a failed unbind and clears the busy flag", async () => {
      mocks.setPlatformOffline.mockRejectedValue(new Error("平台維護中"));
      const renderer = await renderBinding();

      await act(async () => {
        cards(renderer)[0]
          .props.actions.find((action: any) => action.key === "unbind")
          .onPress();
      });
      await act(async () => {
        await lastAlert()[2][1].onPress();
        await flush();
      });

      expect(lastAlert()).toEqual(["無法解除綁定", "平台維護中"]);
      expect(
        cards(renderer)[0].props.actions.every(
          (action: any) => action.disabled === false,
        ),
      ).toBe(true);
    });
  });
});
