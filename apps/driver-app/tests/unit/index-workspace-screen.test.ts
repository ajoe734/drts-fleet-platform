import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedDriverTaskView } from "@drts/contracts";

const { passthrough, withProp } = vi.hoisted(() => {
  return {
    passthrough: (name: string) => (props: Record<string, unknown>) =>
      React.createElement(name, props, props.children as never),
    withProp:
      (name: string, ...propNames: string[]) =>
      (props: Record<string, unknown>) =>
        React.createElement(name, props, [
          ...propNames.map((key, index) =>
            React.createElement(
              React.Fragment,
              { key: `slot-${index}` },
              props[key] as never,
            ),
          ),
          React.createElement(
            React.Fragment,
            { key: "children" },
            props.children as never,
          ),
        ]),
  };
});

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  initializeDriverIdentity: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(() => true),
  getDriverId: vi.fn(() => "drv-001"),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
  getOrder: vi.fn(),
  getPlatformPresence: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listNotifications: vi.fn(),
  listShifts: vi.fn(),
  post: vi.fn(),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Pressable: p("Pressable"),
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    View: p("View"),
  };
});

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  Redirect: passthrough("Redirect"),
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: passthrough("Ionicons") }));

vi.mock("@/components/canvas-primitives", () => ({
  Banner: withProp("Banner", "actions"),
  Btn: passthrough("Btn"),
  Card: passthrough("Card"),
  KPI: passthrough("KPI"),
  PageHeader: withProp("CanvasPageHeader", "title", "subtitle", "actions"),
  Pill: passthrough("Pill"),
  Shell: withProp("Shell", "footer"),
  driverCanvasTheme: new Proxy({}, { get: () => "#000000" }),
}));

vi.mock("@/lib/api-client", () => ({
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  sanitizeLogMessage: (value: unknown) =>
    value === null || value === undefined ? null : String(value),
  getDriverClient: () => ({
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
    getOrder: mocks.getOrder,
    getPlatformPresence: mocks.getPlatformPresence,
    isFeatureEnabled: mocks.isFeatureEnabled,
    listNotifications: mocks.listNotifications,
    listShifts: mocks.listShifts,
    post: mocks.post,
  }),
  getDriverId: mocks.getDriverId,
  initializeDriverIdentity: mocks.initializeDriverIdentity,
  isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
}));

import {
  clearDriverDiagnostics,
  getDriverDiagnostics,
} from "../../lib/driver-diagnostics";
import { resetDriverFeatureCache } from "../../lib/driver-feature-flags";
import {
  markDriverSessionSignedOut,
  resetDriverSessionLifecycleForTests,
} from "../../lib/driver-session-lifecycle";
import WorkspaceIndex from "../../app/(tabs)/index/index";

async function flush() {
  for (let index = 0; index < 14; index += 1) {
    await Promise.resolve();
  }
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(WorkspaceIndex));
    await flush();
  });
  return renderer;
}

function task(overrides: Partial<UnifiedDriverTaskView> = {}) {
  return {
    taskId: "task-001",
    orderId: "order-001",
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    externalOrderId: null,
    nativeStatus: null,
    localStatus: "assigned",
    driverActionState: "action_required",
    allowedActions: ["accept"],
    routeLocked: false,
    fareAuthority: "drts",
    settlementAuthority: "drts",
    driverPayoutAuthority: "drts",
    requiresManualFallback: false,
    requiresReauth: false,
    syncIssueSummary: null,
    blockingReason: null,
    pickupSummary: "台北車站",
    dropoffSummary: "台北 101",
    deadlineAt: null,
    updatedAt: "2026-05-08T03:00:00.000Z",
    ...overrides,
  } as UnifiedDriverTaskView;
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    notificationId: "ntf-001",
    title: "派單提醒",
    message: "有一筆新任務等待處理。",
    channel: "driver_app",
    category: "dispatch",
    createdAt: "2026-05-08T03:00:00.000Z",
    readAt: null,
    status: "unread",
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

function buttons(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Btn");
}

function buttonWithLabel(renderer: any, label: string) {
  return buttons(renderer).find((node: any) => node.props.children === label);
}

function banners(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Banner");
}

function bannerTitles(renderer: any) {
  return banners(renderer).map((node: any) => node.props.title);
}

function pressableWithLabel(renderer: any, label: string) {
  return renderer.root.find(
    (node: any) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
}

function pressableContainingText(renderer: any, label: string) {
  return renderer.root
    .findAll((node: any) => node.type === "Pressable")
    .find((node: any) =>
      node
        .findAll((child: any) => child.type === "Text")
        .some((child: any) => child.props.children === label),
    );
}


// Requirement 2: nothing that names our architecture, APIs, spec numbers,
// programme identifiers or internal sync strategy may reach a driver's screen.
const DEVELOPER_COPY_BLOCKLIST = [
  "sitemap",
  "cockpit",
  "packet",
  "\u00a7",
  "Phase 1",
  "web console",
  "CrossAppResourceLink",
  "next-best-action",
  "EmptyReason",
  "ResourceActionDescriptor",
  "deep-link",
  "deep link",
  "allowedActions",
  "availableActions",
  "fallback",
  "API",
  "/api/",
  "\u65d7\u6a19",
  "\u964d\u7d1a",
];

// Every string that actually reaches the rendered tree: text nodes plus the
// string props (title / body / label / subtitle / placeholder / ...) that the
// mocked design-system components receive.
function renderedCopy(renderer: any): string {
  const collected: string[] = [];
  for (const node of renderer.root.findAll(() => true)) {
    const props = (node.props ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(props)) {
      if (key === "style") {
        continue;
      }
      if (typeof value === "string") {
        collected.push(value);
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === "string") {
            collected.push(entry);
          }
        }
      }
    }
  }
  return collected.join(" | ");
}

function expectNoDeveloperCopy(renderer: any) {
  const copy = renderedCopy(renderer);
  for (const term of DEVELOPER_COPY_BLOCKLIST) {
    expect(copy, `rendered developer copy: ${term}`).not.toContain(term);
  }
}

describe("WorkspaceIndex", () => {
  let warnSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T04:00:00.000Z"));

    mocks.push.mockReset();
    mocks.initializeDriverIdentity.mockReset().mockResolvedValue(undefined);
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
    mocks.getDriverId.mockReset().mockReturnValue("drv-001");
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getOrder.mockReset().mockRejectedValue(new Error("no order"));
    mocks.getPlatformPresence
      .mockReset()
      .mockResolvedValue({ presences: [], adapterStatuses: [] });
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listNotifications.mockReset().mockResolvedValue([]);
    mocks.listShifts.mockReset().mockResolvedValue([]);
    mocks.post.mockReset().mockResolvedValue(undefined);
    resetDriverFeatureCache();
    clearDriverDiagnostics();
    resetDriverSessionLifecycleForTests();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    vi.useRealTimers();
  });

  describe("identity gate", () => {
    it("checks the device before rendering the cockpit", async () => {
      mocks.initializeDriverIdentity.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(WorkspaceIndex));
      });
      expect(texts(renderer)).toContain("正在檢查裝置配置…");
    });

    it("redirects an unprovisioned device to onboarding", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();

      expect(renderer.root.findByType("Redirect").props.href).toBe(
        "/onboarding",
      );
      expect(mocks.listUnifiedDriverTasks).not.toHaveBeenCalled();
    });

    it("banners an identity initialisation failure inside the cockpit", async () => {
      mocks.initializeDriverIdentity.mockRejectedValue(
        new Error("裝置金鑰驗證失敗"),
      );
      const renderer = await renderScreen();

      const banner = banners(renderer).find(
        (node: any) => node.props.title === "裝置身份異常",
      );
      expect(banner.props.body).toBe("裝置金鑰驗證失敗");
    });
  });

  describe("workspace data loading", () => {
    it("shows a loading state before the first payload lands", async () => {
      mocks.listUnifiedDriverTasks.mockReturnValue(new Promise(() => {}));
      mocks.getPlatformPresence.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(WorkspaceIndex));
        await flush();
      });
      expect(texts(renderer)).toContain("正在載入工作台…");
    });

    it("falls back to the legacy task list and says so", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410"));
      mocks.listDriverTasks.mockResolvedValue([
        {
          taskId: "legacy-1",
          orderId: "order-legacy",
          status: "assigned",
          updatedAt: "2026-05-08T03:00:00.000Z",
        },
      ]);
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).toContain("任務資料同步中");
    });

    it("warns when platform health is stale but tasks loaded", async () => {
      mocks.getPlatformPresence.mockRejectedValue(new Error("presence down"));
      const renderer = await renderScreen();

      // platformSummary stays null, so the delayed-health banner is suppressed
      // and the cockpit degrades through the readiness strip instead.
      expect(bannerTitles(renderer)).not.toContain("平台健康資訊延遲");
      expect(texts(renderer)).toContain("工作台");
    });

    it("keeps the cockpit usable when every task route fails", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410"));
      mocks.listDriverTasks.mockRejectedValue(new Error("500"));
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("工作台");
    });

    it("looks up each distinct order exactly once", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "t1", orderId: "order-shared" }),
        task({ taskId: "t2", orderId: "order-shared" }),
      ]);
      await renderScreen();
      expect(mocks.getOrder).toHaveBeenCalledTimes(1);
    });

    it("skips the shift lookup when the shift feature is off", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      const renderer = await renderScreen();

      expect(mocks.listShifts).not.toHaveBeenCalled();
      expect(texts(renderer)).toContain("班次功能未啟用");
    });
  });

  describe("header", () => {
    it("shows the shift status without leaking the internal driver id", async () => {
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).toContain("尚未上班");
      // The internal driver identifier must never reach the screen.
      expect(rendered).not.toContain("drv-001");
    });

    it("shows the clock-in time while on shift", async () => {
      mocks.listShifts.mockResolvedValue([
        {
          shiftId: "sh-1",
          status: "active",
          clockedInAt: "2026-05-08T01:30:00.000Z",
          clockedOutAt: null,
        },
      ]);
      const renderer = await renderScreen();

      expect(
        texts(renderer).some((value) => value.startsWith("上班中 ·")),
      ).toBe(true);
    });

    it("reports a shift sync delay", async () => {
      mocks.listShifts.mockRejectedValue(new Error("shift down"));
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("班次同步延遲");
    });

    it("refreshes the workspace from the header button", async () => {
      const renderer = await renderScreen();
      const before = mocks.listUnifiedDriverTasks.mock.calls.length;

      await act(async () => {
        pressableWithLabel(renderer, "手動刷新工作台").props.onPress();
        await flush();
      });
      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBe(before + 1);
    });

    it("routes the SOS header button to the SOS screen", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        pressableWithLabel(renderer, "開啟 SOS").props.onPress();
      });
      expect(mocks.push).toHaveBeenCalledWith("/sos");
    });

    it("dots the notification button only when something is pending", async () => {
      const countBellChildren = (renderer: any) =>
        pressableWithLabel(renderer, "查看通知與緊急事件").findAll(
          (node: any) => node.type === "View",
        ).length;

      const clean = await renderScreen();
      const cleanChildren = countBellChildren(clean);

      mocks.listNotifications.mockResolvedValue([notification()]);
      const withNotice = await renderScreen();

      expect(countBellChildren(withNotice)).toBe(cleanChildren + 1);
    });
  });

  describe("notification inbox", () => {
    beforeEach(() => {
      mocks.listNotifications.mockResolvedValue([
        notification({ notificationId: "ntf-unread" }),
        notification({
          notificationId: "ntf-read",
          title: "系統公告",
          readAt: "2026-05-08T02:00:00.000Z",
          status: "read",
          createdAt: "2026-05-08T01:00:00.000Z",
        }),
      ]);
    });

    it("counts unread notifications in the collapsed header", async () => {
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("1 則待讀通知");
    });

    it("stays collapsed until the panel is toggled", async () => {
      const renderer = await renderScreen();
      expect(buttonWithLabel(renderer, "全部標記已讀")).toBeUndefined();

      await act(async () => {
        pressableContainingText(renderer, "1 則待讀通知").props.onPress();
      });
      expect(buttonWithLabel(renderer, "全部標記已讀")).toBeDefined();
    });

    it("marks a single notification read through the API", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "1 則待讀通知").props.onPress();
      });

      const readButtons = buttons(renderer).filter(
        (node: any) => node.props.children === "已讀",
      );
      await act(async () => {
        readButtons[0].props.onPress();
        await flush();
      });

      expect(mocks.post).toHaveBeenCalledWith("/api/notifications/read", {
        body: { notificationIds: ["ntf-unread"] },
      });
      expect(texts(renderer)).toContain("通知已清空");
    });

    it("disables the read action on an already-read notification", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "1 則待讀通知").props.onPress();
      });

      const readButtons = buttons(renderer).filter(
        (node: any) => node.props.children === "已讀",
      );
      // Unread sorts first, so the second row is the already-read one.
      expect(readButtons[1].props.disabled).toBe(true);
    });

    it("marks everything read in one call", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "1 則待讀通知").props.onPress();
      });
      await act(async () => {
        buttonWithLabel(renderer, "全部標記已讀").props.onPress();
        await flush();
      });

      expect(mocks.post).toHaveBeenCalledWith("/api/notifications/read", {
        body: { notificationIds: ["ntf-unread"] },
      });
    });

    it("disables the bulk action once nothing is unread", async () => {
      mocks.listNotifications.mockResolvedValue([
        notification({
          readAt: "2026-05-08T02:00:00.000Z",
          status: "read",
        }),
      ]);
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "通知已清空").props.onPress();
      });

      expect(buttonWithLabel(renderer, "全部標記已讀").props.disabled).toBe(
        true,
      );
    });

    it("surfaces a failed read sync without losing the panel", async () => {
      mocks.post.mockRejectedValue(new Error("通知服務離線"));
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "1 則待讀通知").props.onPress();
      });
      await act(async () => {
        buttonWithLabel(renderer, "全部標記已讀").props.onPress();
        await flush();
      });

      expect(texts(renderer)).toContain("通知服務離線");
    });

    it("opens a notification at its mapped route", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "1 則待讀通知").props.onPress();
      });

      const openButtons = buttons(renderer).filter(
        (node: any) => node.props.children === "開啟",
      );
      await act(async () => {
        openButtons[0].props.onPress();
      });
      expect(mocks.push).toHaveBeenCalled();
    });

    it("reports a notification inbox outage", async () => {
      mocks.listNotifications.mockRejectedValue(new Error("inbox down"));
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("inbox down");
    });
  });

  describe("persistent SOS banner", () => {
    const sosNotification = notification({
      notificationId: "ntf-sos",
      title: "SOS 事件進行中",
      message: "派車台已收到您的求援。",
      category: "safety",
      channel: "sos",
    });

    it("pins an SOS notification above the cockpit", async () => {
      mocks.listNotifications.mockResolvedValue([sosNotification]);
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).toContain("SOS 事件進行中");
      expect(buttonWithLabel(renderer, "查看 SOS")).toBeDefined();
    });

    it("navigates from the pinned banner", async () => {
      mocks.listNotifications.mockResolvedValue([sosNotification]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "查看 SOS").props.onPress();
      });
      expect(mocks.push).toHaveBeenCalled();
    });

    it("stays dismissed once the driver closes it", async () => {
      mocks.listNotifications.mockResolvedValue([sosNotification]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "關閉").props.onPress();
      });
      expect(bannerTitles(renderer)).not.toContain("SOS 事件進行中");
    });
  });

  describe("deep-link tiles", () => {
    it("routes each enabled tile to its screen", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ driverActionState: "in_progress" }),
      ]);
      const renderer = await renderScreen();

      const routes: Array<[string, string]> = [
        ["任務收件匣", "/jobs"],
        ["行程工作區", "/trip"],
        ["平台中心", "/platform-presence"],
        ["今日收入", "/earnings"],
        ["班次", "/shift"],
        ["設定", "/settings"],
      ];

      for (const [label, route] of routes) {
        mocks.push.mockClear();
        await act(async () => {
          pressableContainingText(renderer, label).props.onPress();
        });
        expect(mocks.push).toHaveBeenCalledWith(route);
      }
    });

    it("disables the trip tile with no active trip", async () => {
      const renderer = await renderScreen();
      const tile = pressableContainingText(renderer, "行程工作區");

      expect(tile.props.disabled).toBe(true);
      expect(tile.props.onPress).toBeUndefined();
      expect(texts(renderer)).toContain("沒有進行中的行程時會顯示空態");
    });

    it("disables the shift tile when the feature is off", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      const renderer = await renderScreen();

      const tile = pressableContainingText(renderer, "班次");
      expect(tile.props.disabled).toBe(true);
      expect(tile.props.onPress).toBeUndefined();
    });

    it("counts pending tasks on the inbox tile", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "a" }),
        task({ taskId: "b", driverActionState: "awaiting_platform" }),
        task({ taskId: "c", driverActionState: "completed" }),
      ]);
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("2 件待處理");
    });

    it("sums today's completed fares on the earnings tile", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({
          taskId: "done-today",
          driverActionState: "completed",
          updatedAt: "2026-05-08T02:00:00.000Z",
        }),
      ]);
      mocks.getOrder.mockResolvedValue({
        orderId: "order-001",
        quotedFare: { currency: "TWD", amountMinor: 45000 },
      });
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("NT$ 450");
    });

    it("excludes a task completed on an earlier day", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({
          taskId: "done-yesterday",
          driverActionState: "completed",
          updatedAt: "2026-05-07T02:00:00.000Z",
        }),
      ]);
      mocks.getOrder.mockResolvedValue({
        orderId: "order-001",
        quotedFare: { currency: "TWD", amountMinor: 45000 },
      });
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("NT$ 0");
    });
  });

  describe("auto refresh", () => {
    it("re-polls the workspace on the refresh tier interval", async () => {
      const renderer = await renderScreen();
      const before = mocks.listUnifiedDriverTasks.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await flush();
      });

      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBeGreaterThan(
        before,
      );
      expect(renderer).toBeDefined();
    });

    it("keeps the loaded tasks on screen when a later refresh fails", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "a" }),
        task({ taskId: "b", driverActionState: "awaiting_platform" }),
      ]);
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("2 件待處理");

      mocks.listUnifiedDriverTasks.mockRejectedValue(
        new Error("Network request failed"),
      );
      mocks.listDriverTasks.mockRejectedValue(
        new Error("Network request failed"),
      );
      mocks.getPlatformPresence.mockRejectedValue(
        new Error("Network request failed"),
      );

      await act(async () => {
        vi.advanceTimersByTime(20_000);
        await flush();
      });

      // Last-known-good data survives; the workspace is not blanked.
      expect(texts(renderer)).toContain("2 件待處理");
    });

    it("backs the polling off after consecutive total failures", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(
        new Error("Network request failed"),
      );
      mocks.listDriverTasks.mockRejectedValue(
        new Error("Network request failed"),
      );
      mocks.getPlatformPresence.mockRejectedValue(
        new Error("Network request failed"),
      );
      await renderScreen();

      await act(async () => {
        vi.advanceTimersByTime(15_000);
        await flush();
      });
      const afterFirstTick = mocks.listUnifiedDriverTasks.mock.calls.length;

      // The next tick is now scheduled at 2x the tier interval, so advancing by
      // exactly one interval must not trigger another poll.
      await act(async () => {
        vi.advanceTimersByTime(15_000);
        await flush();
      });
      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBe(
        afterFirstTick,
      );

      await act(async () => {
        vi.advanceTimersByTime(20_000);
        await flush();
      });
      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBeGreaterThan(
        afterFirstTick,
      );
    });
  });

  describe("feature flag fail-open", () => {
    it("keeps the shift feature usable when the flag endpoint denies the driver", async () => {
      // /api/admin/flags/:key/enabled needs the system|platform realm, so a
      // driver token is always rejected. That must not disable the feature.
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403: {}"));
      const renderer = await renderScreen();

      expect(mocks.listShifts).toHaveBeenCalled();
      expect(texts(renderer)).not.toContain("班次功能未啟用");
    });

    it("does not surface the flag failure anywhere on screen", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403: {}"));
      const renderer = await renderScreen();
      const rendered = texts(renderer).join(" | ");

      expect(rendered).not.toContain("403");
      expect(rendered).not.toContain("driver-app.shift");
      expect(rendered).not.toContain("/api/");
      expect(rendered).not.toContain("旗標");
    });

    it("records the flag fallback as an internal diagnostic only", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403: {}"));
      await renderScreen();

      const records = getDriverDiagnostics().filter(
        (record) => record.kind === "feature_flag_fallback",
      );
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].reason).toContain("driver-app.shift");
    });
  });
  // Requirement 5: the workspace tab stays mounted after a logout, so its
  // refresh scheduler has to be torn down by the session, not by an unmount.
  describe("session lifecycle", () => {
    it("stops the refresh scheduler once the driver signs out", async () => {
      await renderScreen();
      const callsBefore = mocks.listUnifiedDriverTasks.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onUnhandled);

      try {
        await act(async () => {
          markDriverSessionSignedOut();
          await flush();
        });

        // Two full refresh tiers' worth of time with nobody signed in.
        await act(async () => {
          vi.advanceTimersByTime(60 * 60_000);
          await flush();
        });
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBe(callsBefore);
      expect(mocks.getPlatformPresence.mock.calls.length).toBeGreaterThan(0);
      expect(rejections).toEqual([]);
    });
  });

  // Requirement 2: no developer copy in any screen state.
  describe("driver-facing copy guard", () => {
    it("keeps the loaded workspace free of developer copy", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "task-live", driverActionState: "in_progress" }),
        task({ taskId: "task-sync", driverActionState: "blocked" }),
        task({ taskId: "task-wait", driverActionState: "awaiting_platform" }),
      ]);
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          {
            platformCode: "uber",
            status: "online",
            eligibility: "eligible",
            reauthRequired: true,
            updatedAt: "2026-05-08T03:00:00.000Z",
          },
        ],
        adapterStatuses: [
          {
            platformCode: "uber",
            status: "degraded",
            blockingReason: null,
            lastSyncAt: "2026-05-08T03:00:00.000Z",
          },
        ],
      });
      mocks.listNotifications.mockResolvedValue([notification()]);
      const renderer = await renderScreen();

      expect(renderedCopy(renderer)).toContain("工作台");
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the expanded notification inbox free of developer copy", async () => {
      mocks.listNotifications.mockResolvedValue([
        notification({ channel: "ops_notice" }),
      ]);
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "1 則待讀通知").props.onPress();
      });
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the empty notification inbox free of developer copy", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        pressableContainingText(renderer, "通知已清空").props.onPress();
      });
      expectNoDeveloperCopy(renderer);
    });

    it("keeps both loading states free of developer copy", async () => {
      mocks.initializeDriverIdentity.mockReturnValue(new Promise(() => {}));
      let identityLoading: any;
      await act(async () => {
        identityLoading = create(React.createElement(WorkspaceIndex));
      });
      expectNoDeveloperCopy(identityLoading);

      mocks.initializeDriverIdentity.mockResolvedValue(undefined);
      mocks.listUnifiedDriverTasks.mockReturnValue(new Promise(() => {}));
      mocks.getPlatformPresence.mockReturnValue(new Promise(() => {}));
      let dataLoading: any;
      await act(async () => {
        dataLoading = create(React.createElement(WorkspaceIndex));
        await flush();
      });
      expectNoDeveloperCopy(dataLoading);
    });

    it("keeps the legacy task path free of developer copy", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410"));
      mocks.listDriverTasks.mockResolvedValue([
        {
          taskId: "legacy-1",
          orderId: "order-legacy",
          status: "assigned",
          updatedAt: "2026-05-08T03:00:00.000Z",
        },
      ]);
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a permission-denied empty state free of developer copy", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(
        new Error("API error 403: permission denied"),
      );
      mocks.listDriverTasks.mockRejectedValue(
        new Error("API error 403: permission denied"),
      );
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the all-platforms-unavailable empty state free of developer copy", async () => {
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          {
            platformCode: "uber",
            status: "offline",
            eligibility: "eligible",
            reauthRequired: false,
            updatedAt: "2026-05-08T03:00:00.000Z",
          },
        ],
        adapterStatuses: [
          {
            platformCode: "uber",
            status: "down",
            blockingReason: null,
            lastSyncAt: "2026-05-08T03:00:00.000Z",
          },
        ],
      });
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps an identity initialisation failure free of developer copy", async () => {
      mocks.initializeDriverIdentity.mockRejectedValue(
        new Error("裝置金鑰驗證失敗"),
      );
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the disabled shift entry free of developer copy", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a denied feature flag out of the rendered copy", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403: {}"));
      expectNoDeveloperCopy(await renderScreen());
    });

    it("no longer renders the cross-app sitemap block", async () => {
      const renderer = await renderScreen();
      const copy = renderedCopy(renderer);

      expect(copy).not.toContain("跨系統");
      expect(copy).not.toContain("工作台入口與深連結");
      expect(copy).not.toContain("必備資料已就位");
      // The real shortcut grid survives under a plain Chinese heading.
      expect(copy).toContain("快速入口");
      expect(copy).toContain("任務收件匣");
    });
  });

});
