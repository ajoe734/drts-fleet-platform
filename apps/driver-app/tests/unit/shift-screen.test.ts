import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { passthrough } = vi.hoisted(() => ({
  passthrough: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  alert: vi.fn(),
  addEventListener: vi.fn(),
  removeSubscription: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(() => true),
  getDriverId: vi.fn(() => "drv-001"),
  isFeatureEnabled: vi.fn(),
  listShifts: vi.fn(),
  getPlatformPresence: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  evaluateDriverOnlineGateNow: vi.fn(),
  openDriverPermissionSettings: vi.fn(),
  getActiveDriverHeartbeatWorkState: vi.fn((): string | null => null),
  stopDriverLocationHeartbeat: vi.fn(),
  syncDriverOnlineAvailableHeartbeat: vi.fn(),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Alert: { alert: mocks.alert },
    AppState: {
      addEventListener: (...args: unknown[]) => {
        mocks.addEventListener(...args);
        return { remove: mocks.removeSubscription };
      },
    },
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    View: p("View"),
  };
});

vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("@drts/contracts", () => ({
  PLATFORM_CODE_REGISTRY: {
    uber: { code: "uber", displayName: "Uber", status: "runtime_seeded" },
  },
}));

vi.mock("@/components/platform-status-card", () => ({
  assessPlatformHealth: () => ({
    canReceiveOrders: true,
    blockers: [],
    statusLabel: "可接單",
    statusTone: "healthy",
    adapterLabel: "連線正常",
    adapterTone: "healthy",
    readinessLabel: "目前可以接收該平台訂單",
    tokenInfo: { label: "未設定到期時間", urgency: "safe" },
  }),
  getPlatformHealthSeverity: () => 0,
}));

vi.mock("@/components/ui", () => ({
  ActionButton: passthrough("ActionButton"),
  AppScreen: passthrough("AppScreen"),
  AuthorityBanner: passthrough("AuthorityBanner"),
  BottomActionBar: (props: Record<string, unknown>) =>
    React.createElement("BottomActionBar", props, props.children as never),
  EmptyState: passthrough("EmptyState"),
  ErrorBanner: passthrough("ErrorBanner"),
  FormField: passthrough("FormField"),
  IconButton: passthrough("IconButton"),
  PageHeader: passthrough("PageHeader"),
  PlatformBadge: passthrough("PlatformBadge"),
  StatusChip: passthrough("StatusChip"),
  Tokens: new Proxy({}, { get: () => new Proxy({}, { get: () => "#000" }) }),
}));

// The screen loads `@/lib/driver-diagnostics` (which imports
// `sanitizeLogMessage` from here) and `@/lib/driver-feature-flags` for real, so
// the mock must expose those plus the null-returning identity accessors.
vi.mock("@/lib/api-client", () => {
  const driverClient = {
    isFeatureEnabled: mocks.isFeatureEnabled,
    listShifts: mocks.listShifts,
    getPlatformPresence: mocks.getPlatformPresence,
    clockIn: mocks.clockIn,
    clockOut: mocks.clockOut,
  };
  return {
    formatDriverError: (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback,
    sanitizeLogMessage: (value: unknown) =>
      typeof value === "string" ? value : null,
    getDriverClient: () => driverClient,
    getDriverClientOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? driverClient : null,
    getDriverId: mocks.getDriverId,
    getDriverIdOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? mocks.getDriverId() : null,
    isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
  };
});

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getActiveDriverHeartbeatWorkState: mocks.getActiveDriverHeartbeatWorkState,
  stopDriverLocationHeartbeat: mocks.stopDriverLocationHeartbeat,
  syncDriverOnlineAvailableHeartbeat: mocks.syncDriverOnlineAvailableHeartbeat,
}));

vi.mock("@/lib/driver-online-gate", () => ({
  evaluateDriverOnlineGateNow: mocks.evaluateDriverOnlineGateNow,
  openDriverPermissionSettings: mocks.openDriverPermissionSettings,
}));

import ShiftScreen from "../../app/(tabs)/index/shift";
import {
  clearDriverDiagnostics,
  getDriverDiagnostics,
} from "../../lib/driver-diagnostics";
import { resetDriverFeatureCache } from "../../lib/driver-feature-flags";
import {
  markDriverSessionSignedOut,
  resetDriverSessionLifecycleForTests,
} from "../../lib/driver-session-lifecycle";

async function flush() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(ShiftScreen));
    await flush();
  });
  return renderer;
}

function actionButton(renderer: any, title: string) {
  return renderer.root
    .findAll((node: any) => node.type === "ActionButton")
    .find((node: any) => node.props.title === title);
}

function field(renderer: any, label: string) {
  return renderer.root.find(
    (node: any) => node.type === "FormField" && node.props.label === label,
  );
}

function lastAlert(): any[] {
  return mocks.alert.mock.calls.at(-1) as any[];
}

const OPEN_GATE = { canGoOnline: true, blockingReason: null, checks: [] };

function activeShift(overrides: Record<string, unknown> = {}) {
  return {
    shiftId: "sh-1",
    driverId: "drv-001",
    status: "active",
    clockedInAt: "2026-05-08T02:00:00.000Z",
    clockedOutAt: null,
    vehicleId: "veh-1",
    startOdometer: 1000,
    endOdometer: null,
    ...overrides,
  };
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

describe("ShiftScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T04:00:00.000Z"));

    mocks.push.mockReset();
    mocks.alert.mockReset();
    mocks.addEventListener.mockReset();
    mocks.removeSubscription.mockReset();
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
    mocks.getDriverId.mockReset().mockReturnValue("drv-001");
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listShifts.mockReset().mockResolvedValue([]);
    mocks.getPlatformPresence
      .mockReset()
      .mockResolvedValue({ presences: [], adapterStatuses: [] });
    mocks.clockIn.mockReset().mockResolvedValue(activeShift());
    mocks.clockOut.mockReset().mockResolvedValue(undefined);
    mocks.evaluateDriverOnlineGateNow.mockReset().mockResolvedValue(OPEN_GATE);
    mocks.openDriverPermissionSettings.mockReset().mockResolvedValue(undefined);
    mocks.getActiveDriverHeartbeatWorkState.mockReset().mockReturnValue(null);
    mocks.stopDriverLocationHeartbeat.mockReset().mockResolvedValue(undefined);
    mocks.syncDriverOnlineAvailableHeartbeat
      .mockReset()
      .mockResolvedValue({ status: "active", reason: null });
    // Module-level state: the flag cache, the diagnostic ring buffer and the
    // session epoch all survive across tests otherwise.
    resetDriverFeatureCache();
    clearDriverDiagnostics();
    resetDriverSessionLifecycleForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("feature gate", () => {
    it("shows a paused notice when the shift feature is off", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      const renderer = await renderScreen();

      const empty = renderer.root.findByType("EmptyState");
      expect(empty.props.title).toBe("班表追蹤暫停提供");
      expect(mocks.listShifts).not.toHaveBeenCalled();

      await act(async () => {
        empty.props.onAction();
      });
      expect(mocks.push).toHaveBeenCalledWith("/onboarding");
    });

    it("still loads shifts when the flag lookup fails", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("flags down"));
      await renderScreen();
      expect(mocks.listShifts).toHaveBeenCalledWith("drv-001");
    });
  });

  describe("clock-in", () => {
    it("offers the punch-in action when no shift is active", async () => {
      const renderer = await renderScreen();
      expect(actionButton(renderer, "上線打卡")).toBeDefined();
      expect(actionButton(renderer, "下線打卡")).toBeUndefined();
    });

    it("sends the trimmed optional fields", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        field(renderer, "車輛編號（選填）").props.onChangeText("  veh-9  ");
        field(renderer, "位置（選填）").props.onChangeText(" 台北車站 ");
        field(renderer, "里程表（選填）").props.onChangeText(" 12345 ");
      });
      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });

      expect(mocks.clockIn).toHaveBeenCalledWith({
        driverId: "drv-001",
        vehicleId: "veh-9",
        location: "台北車站",
        odometer: 12345,
      });
      expect(lastAlert()).toEqual(["成功", "已完成上線打卡。"]);
    });

    it("omits blank optional fields entirely", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });

      expect(mocks.clockIn).toHaveBeenCalledWith({
        driverId: "drv-001",
        vehicleId: undefined,
        location: undefined,
        odometer: undefined,
      });
    });

    it("swaps to the punch-out action once clocked in", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });

      expect(actionButton(renderer, "下線打卡")).toBeDefined();
      expect(actionButton(renderer, "上線打卡")).toBeUndefined();
    });

    it("clears the form after a successful clock-in", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        field(renderer, "位置（選填）").props.onChangeText("台北車站");
      });
      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });

      expect(field(renderer, "目前位置（選填）").props.value).toBe("");
    });

    it("warns when background location is still missing after clock-in", async () => {
      mocks.syncDriverOnlineAvailableHeartbeat.mockResolvedValue({
        status: "permission_denied",
        reason: "BACKGROUND_LOCATION_REQUIRED",
      });
      const renderer = await renderScreen();

      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });

      expect(lastAlert()[0]).toBe("需要背景定位");
      expect(mocks.clockIn).toHaveBeenCalled();
    });

    it("reports a rejected clock-in as an inline error", async () => {
      mocks.clockIn.mockRejectedValue(new Error("排班衝突"));
      const renderer = await renderScreen();

      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });

      const errors = renderer.root
        .findAll((node: any) => node.type === "ErrorBanner")
        .map((node: any) => node.props.message);
      expect(errors).toContain("排班衝突");
      expect(actionButton(renderer, "上線打卡")).toBeDefined();
    });
  });

  describe("odometer validation", () => {
    it("rejects a non-integer odometer and disables the action", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        field(renderer, "里程表（選填）").props.onChangeText("12.5");
      });

      expect(actionButton(renderer, "上線打卡").props.disabled).toBe(true);

      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });
      expect(lastAlert()).toEqual(["輸入錯誤", "里程表只能輸入 0-9 整數。"]);
      expect(mocks.clockIn).not.toHaveBeenCalled();
    });

    it("rejects an odometer beyond the safe integer range", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        field(renderer, "里程表（選填）").props.onChangeText(
          "99999999999999999999",
        );
      });
      expect(actionButton(renderer, "上線打卡").props.disabled).toBe(true);
    });

    it("accepts a blank odometer", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        field(renderer, "里程表（選填）").props.onChangeText("   ");
      });
      expect(actionButton(renderer, "上線打卡").props.disabled).toBe(false);
    });
  });

  describe("pre-online gate", () => {
    const blockedGate = {
      canGoOnline: false,
      blockingReason: {
        code: "BACKGROUND_LOCATION_REQUIRED",
        title: "需要背景定位權限",
        description: "請於系統設定開啟「永遠允許」。",
        actionLabel: "前往系統設定",
        resolution: "permission",
      },
      checks: [
        { id: "foreground", label: "前景定位", satisfied: true },
        { id: "background", label: "背景定位", satisfied: false },
      ],
    };

    it("disables the punch-in action while the gate is closed", async () => {
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue(blockedGate);
      const renderer = await renderScreen();

      expect(actionButton(renderer, "上線打卡").props.disabled).toBe(true);
    });

    it("routes a permission blocker to the OS settings screen", async () => {
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue(blockedGate);
      const renderer = await renderScreen();

      await act(async () => {
        actionButton(renderer, "前往系統設定").props.onPress();
        await flush();
      });
      expect(mocks.openDriverPermissionSettings).toHaveBeenCalledTimes(1);
    });

    it("explains how to open settings manually when the deep link fails", async () => {
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue(blockedGate);
      mocks.openDriverPermissionSettings.mockRejectedValue(new Error("no-op"));
      const renderer = await renderScreen();

      await act(async () => {
        actionButton(renderer, "前往系統設定").props.onPress();
        await flush();
      });
      expect(lastAlert()[0]).toBe("無法開啟設定");
    });

    it("routes an identity blocker to onboarding instead of settings", async () => {
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue({
        ...blockedGate,
        blockingReason: {
          ...blockedGate.blockingReason,
          actionLabel: "重新綁定裝置",
          resolution: "onboarding",
        },
      });
      const renderer = await renderScreen();

      await act(async () => {
        actionButton(renderer, "重新綁定裝置").props.onPress();
        await flush();
      });
      expect(mocks.push).toHaveBeenCalledWith("/onboarding");
      expect(mocks.openDriverPermissionSettings).not.toHaveBeenCalled();
    });

    it("re-checks the gate at submit time and blocks a late revocation", async () => {
      const renderer = await renderScreen();
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue(blockedGate);

      await act(async () => {
        actionButton(renderer, "上線打卡").props.onPress();
        await flush();
      });

      expect(mocks.clockIn).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual([
        "需要背景定位權限",
        "請於系統設定開啟「永遠允許」。",
      ]);
    });

    it("re-evaluates the gate when the app returns to the foreground", async () => {
      await renderScreen();
      const before = mocks.evaluateDriverOnlineGateNow.mock.calls.length;
      const listener = mocks.addEventListener.mock.calls[0][1] as (
        state: string,
      ) => void;

      await act(async () => {
        listener("active");
        await flush();
      });
      expect(mocks.evaluateDriverOnlineGateNow.mock.calls.length).toBe(
        before + 1,
      );
    });

    it("keeps the screen usable when the gate itself throws", async () => {
      mocks.evaluateDriverOnlineGateNow.mockRejectedValue(new Error("boom"));
      const renderer = await renderScreen();
      expect(actionButton(renderer, "上線打卡").props.disabled).toBe(false);
    });
  });

  describe("clock-out", () => {
    beforeEach(() => {
      mocks.listShifts.mockResolvedValue([activeShift()]);
    });

    it("shows the punch-out action for an active shift", async () => {
      const renderer = await renderScreen();
      expect(actionButton(renderer, "下線打卡")).toBeDefined();
    });

    it("sends the optional location and odometer", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        field(renderer, "目前位置（選填）").props.onChangeText("台北 101");
        field(renderer, "目前里程表（選填）").props.onChangeText("54321");
      });
      await act(async () => {
        actionButton(renderer, "下線打卡").props.onPress();
        await flush();
      });

      expect(mocks.clockOut).toHaveBeenCalledWith({
        driverId: "drv-001",
        location: "台北 101",
        odometer: 54321,
      });
      expect(lastAlert()).toEqual(["成功", "已完成下線打卡。"]);
    });

    it("stops availability tracking after clocking out", async () => {
      mocks.getActiveDriverHeartbeatWorkState.mockReturnValue("available");
      const renderer = await renderScreen();

      await act(async () => {
        actionButton(renderer, "下線打卡").props.onPress();
        await flush();
      });
      expect(mocks.stopDriverLocationHeartbeat).toHaveBeenCalled();
    });

    it("returns to the punch-in action once clocked out", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        actionButton(renderer, "下線打卡").props.onPress();
        await flush();
      });
      expect(actionButton(renderer, "上線打卡")).toBeDefined();
    });

    it("reports a rejected clock-out and keeps the shift active", async () => {
      mocks.clockOut.mockRejectedValue(new Error("尚有未完成任務"));
      const renderer = await renderScreen();

      await act(async () => {
        actionButton(renderer, "下線打卡").props.onPress();
        await flush();
      });

      const errors = renderer.root
        .findAll((node: any) => node.type === "ErrorBanner")
        .map((node: any) => node.props.message);
      expect(errors).toContain("尚有未完成任務");
      expect(actionButton(renderer, "下線打卡")).toBeDefined();
    });

    it("blocks clock-out on an invalid odometer", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        field(renderer, "目前里程表（選填）").props.onChangeText("abc");
      });

      expect(actionButton(renderer, "下線打卡").props.disabled).toBe(true);
      await act(async () => {
        actionButton(renderer, "下線打卡").props.onPress();
        await flush();
      });
      expect(mocks.clockOut).not.toHaveBeenCalled();
    });

    it("never re-checks the online gate when clocking out", async () => {
      const renderer = await renderScreen();
      const before = mocks.evaluateDriverOnlineGateNow.mock.calls.length;

      await act(async () => {
        actionButton(renderer, "下線打卡").props.onPress();
        await flush();
      });
      expect(mocks.evaluateDriverOnlineGateNow.mock.calls.length).toBe(before);
    });
  });

  describe("load failures", () => {
    it("offers a retry when the shift list fails with nothing cached", async () => {
      mocks.listShifts.mockRejectedValue(new Error("班次服務離線"));
      const renderer = await renderScreen();

      const empty = renderer.root.findByType("EmptyState");
      expect(empty.props.title).toBe("班次資料暫時無法載入");
      expect(empty.props.description).toBe("班次服務離線");

      mocks.listShifts.mockResolvedValue([]);
      await act(async () => {
        empty.props.onAction();
        await flush();
      });
      expect(actionButton(renderer, "上線打卡")).toBeDefined();
    });

    it("keeps the shift screen usable when only platform presence fails", async () => {
      mocks.getPlatformPresence.mockRejectedValue(new Error("presence down"));
      const renderer = await renderScreen();

      expect(actionButton(renderer, "上線打卡")).toBeDefined();
      const errors = renderer.root
        .findAll((node: any) => node.type === "ErrorBanner")
        .map((node: any) => node.props.message);
      expect(errors).toContain("presence down");
    });
  });
  // Requirement 4 & 5: the flag endpoint is admin-realm only, and this screen
  // keeps a 60s ticker plus an AppState listener that used to outlive a logout.
  describe("identity, session and fail-open flags", () => {
    // The unprovisioned branch reads `gate.reasons`, so an open gate used in
    // that path has to carry the (empty) reason list.
    const OPEN_GATE_WITH_REASONS = {
      canGoOnline: true,
      blockingReason: null,
      checks: [],
      reasons: [],
    };

    it("keeps shift tracking fully available when the flag endpoint refuses the driver realm", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403"));
      const renderer = await renderScreen();

      // Fail-open: shifts still load and the punch-in action is offered.
      expect(mocks.listShifts).toHaveBeenCalledWith("drv-001");
      expect(actionButton(renderer, "上線打卡")).toBeDefined();
      const rendered = renderer.root
        .findAll((node: any) => node.type === "Text")
        .flatMap((node: any) =>
          Array.isArray(node.props.children)
            ? node.props.children
            : [node.props.children],
        )
        .filter((value: unknown) => typeof value === "string")
        .join(" ");
      expect(rendered).not.toContain("班表追蹤暫停提供");
      for (const leak of ["403", "driver-app.shift", "/api/"]) {
        expect(rendered).not.toContain(leak);
      }
      expect(getDriverDiagnostics().map((entry) => entry.kind)).toContain(
        "feature_flag_fallback",
      );
    });

    it("renders the binding empty state and calls no API when no device is bound", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue(
        OPEN_GATE_WITH_REASONS,
      );
      const renderer = await renderScreen();

      expect(
        renderer.root.findAll((node: any) => node.type === "EmptyState"),
      ).not.toHaveLength(0);
      expect(mocks.isFeatureEnabled).not.toHaveBeenCalled();
      expect(mocks.listShifts).not.toHaveBeenCalled();
    });

    it("stops the shift ticker and the API polling once the driver signs out", async () => {
      mocks.listShifts.mockResolvedValue([activeShift()]);
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue(
        OPEN_GATE_WITH_REASONS,
      );
      await renderScreen();

      const callsBefore = mocks.listShifts.mock.calls.length;
      const timersBefore = vi.getTimerCount();
      expect(callsBefore).toBeGreaterThan(0);
      // The 60s elapsed-time ticker is registered while a shift is active.
      expect(timersBefore).toBeGreaterThan(0);

      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onUnhandled);

      try {
        mocks.isDriverIdentityProvisioned.mockReturnValue(false);
        await act(async () => {
          markDriverSessionSignedOut();
          await flush();
        });

        await act(async () => {
          vi.advanceTimersByTime(10 * 60_000);
          await flush();
        });
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(vi.getTimerCount()).toBeLessThan(timersBefore);
      expect(mocks.listShifts.mock.calls.length).toBe(callsBefore);
      expect(mocks.clockIn).not.toHaveBeenCalled();
      expect(rejections).toEqual([]);
    });

    it("re-subscribes the AppState listener across a session change", async () => {
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue(
        OPEN_GATE_WITH_REASONS,
      );
      await renderScreen();
      const subscriptionsBefore = mocks.addEventListener.mock.calls.length;

      await act(async () => {
        markDriverSessionSignedOut();
        await flush();
      });

      // The old listener is torn down and a new one registered for the new
      // session, instead of the original one living on forever.
      expect(mocks.removeSubscription).toHaveBeenCalled();
      expect(mocks.addEventListener.mock.calls.length).toBeGreaterThan(
        subscriptionsBefore,
      );
    });
  });

  // Requirement 2: no developer copy in any screen state.
  describe("driver-facing copy guard", () => {
    it("keeps the idle (no active shift) screen free of developer copy", async () => {
      const renderer = await renderScreen();

      expect(renderedCopy(renderer)).toContain("準備開始班次");
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the on-shift screen free of developer copy", async () => {
      mocks.listShifts.mockResolvedValue([activeShift()]);
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [
          {
            platformCode: "uber",
            status: "online",
            eligibility: "eligible",
            reauthRequired: false,
            accountId: "acct-1",
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
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the loading state free of developer copy", async () => {
      mocks.listShifts.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(ShiftScreen));
      });
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the feature-disabled state free of developer copy", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the unprovisioned gate free of developer copy", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a shift load failure free of developer copy", async () => {
      mocks.listShifts.mockRejectedValue(new Error("Network request failed"));
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a platform presence failure free of developer copy", async () => {
      mocks.getPlatformPresence.mockRejectedValue(
        new Error("Network request failed"),
      );
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a blocked pre-online gate free of developer copy", async () => {
      mocks.evaluateDriverOnlineGateNow.mockResolvedValue({
        canGoOnline: false,
        blockingReason: {
          check: "location_permission",
          title: "尚未開啟定位權限",
          description: "請先開啟定位權限才能上線。",
          actionLabel: "開啟定位權限",
        },
        reasons: [],
        checks: [
          {
            check: "location_permission",
            satisfied: false,
            title: "定位權限",
            description: "請開啟定位權限。",
          },
        ],
      });
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a denied feature flag out of the rendered copy", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("403"));
      expectNoDeveloperCopy(await renderScreen());
    });
  });

});
