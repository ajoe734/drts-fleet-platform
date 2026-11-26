import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for MOB-APP-003: the unprovisioned shift screen must surface
// the specific pre-online gate reason (DEVICE_NOT_BOUND vs IDENTITY_INVALID)
// instead of a single generic "device not configured" message. Both reasons
// clear provisioning, so the screen previously collapsed an invalidated/
// suspended identity into the unbound-device copy and dropped its action.
//
// The test drives the real driver-online-gate against mocked permission +
// identity sources so the asserted reason copy stays in sync with the gate.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listShifts: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(),
  getDriverIdentityIssue: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  getBackgroundPermissionsAsync: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: vi.fn() },
  AppState: {
    addEventListener: () => ({ remove: vi.fn() }),
  },
  Linking: { openSettings: mocks.openSettings },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  View: "View",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: mocks.getForegroundPermissionsAsync,
  getBackgroundPermissionsAsync: mocks.getBackgroundPermissionsAsync,
}));

vi.mock("@drts/contracts", () => ({
  PLATFORM_CODE_REGISTRY: {},
}));

vi.mock("@/components/platform-status-card", () => ({
  assessPlatformHealth: () => ({}),
  getPlatformHealthSeverity: () => 0,
}));

vi.mock("@/lib/api-client", () => ({
  isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
  getDriverIdentityIssue: mocks.getDriverIdentityIssue,
  getDriverClient: () => ({
    isFeatureEnabled: mocks.isFeatureEnabled,
    listShifts: mocks.listShifts,
    getPlatformPresence: vi.fn().mockResolvedValue(null),
    clockIn: vi.fn(),
    clockOut: vi.fn(),
  }),
  registerProtectedCacheClearHandler: vi.fn().mockReturnValue(() => {}),
  getDriverId: () => "driver-001",
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getActiveDriverHeartbeatWorkState: () => null,
  stopDriverLocationHeartbeat: vi.fn(),
  syncDriverOnlineAvailableHeartbeat: vi.fn(),
}));

vi.mock("@/lib/strings", () => ({
  driverStrings: {
    shift: {
      title: "班次",
      punchIn: "上線打卡",
      punchOut: "下線打卡",
    },
  },
}));

vi.mock("@/components/ui", async () => {
  const React = await import("react");
  // Style tokens are read at module-eval time inside StyleSheet.create; a
  // recursive proxy satisfies every nested lookup (colors/spacing/type/…) and
  // coerces safely in template literals and object spreads.
  const tokenProxy: unknown = new Proxy(function () {}, {
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive || prop === "toString") {
        return () => "0";
      }
      return tokenProxy;
    },
  });

  const uiComponent =
    (name: string) => (props: { children?: React.ReactNode }) =>
      React.createElement(name, props, props.children);

  return {
    ActionButton: uiComponent("ActionButton"),
    // Render the footer too, so the bottom clock-in/out bar is inspectable.
    AppScreen: (props: {
      children?: React.ReactNode;
      footer?: React.ReactNode;
    }) =>
      React.createElement(
        "AppScreen",
        props,
        props.children,
        props.footer ?? null,
      ),
    AuthorityBanner: uiComponent("AuthorityBanner"),
    BottomActionBar: uiComponent("BottomActionBar"),
    EmptyState: uiComponent("EmptyState"),
    ErrorBanner: uiComponent("ErrorBanner"),
    FormField: uiComponent("FormField"),
    IconButton: uiComponent("IconButton"),
    PageHeader: uiComponent("PageHeader"),
    PlatformBadge: uiComponent("PlatformBadge"),
    StatusChip: uiComponent("StatusChip"),
    Tokens: tokenProxy,
  };
});

import ShiftScreen from "../../app/shift";

async function flushEffects() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

type JsonNode = {
  type: string;
  props: Record<string, unknown>;
  children: Array<JsonNode | string> | null;
};

// Every string the driver could see: text children plus copy-bearing props of
// the mocked UI components (titles, labels, notices…).
function visibleStrings(renderer: any): string[] {
  const out: string[] = [];
  const walk = (node: JsonNode | JsonNode[] | string | null) => {
    if (node == null) return;
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const value of Object.values(node.props)) {
      if (typeof value === "string") out.push(value);
    }
    (node.children ?? []).forEach(walk);
  };
  walk(renderer.toJSON());
  return out;
}

function textNodes(renderer: any): string[] {
  return renderer.root
    .findAllByType("Text")
    .map((node: any) =>
      (node.children as unknown[])
        .filter((child) => typeof child === "string")
        .join(""),
    );
}

async function renderShift() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(ShiftScreen));
    await flushEffects();
  });
  return renderer;
}

describe("ShiftScreen pre-online gate (unprovisioned)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.listShifts.mockResolvedValue([]);
    mocks.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    mocks.getBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it("surfaces the IDENTITY_INVALID reason and re-bind action when identity is invalidated", async () => {
    mocks.isDriverIdentityProvisioned.mockReturnValue(false);
    mocks.getDriverIdentityIssue.mockReturnValue(
      "此司機帳號已被停權，暫時無法刷新裝置登入。",
    );

    const renderer = await renderShift();
    const emptyState = renderer.root.findByType("EmptyState");

    expect(emptyState.props.title).toBe("司機身分需重新驗證");
    expect(emptyState.props.description).toBe(
      "此司機帳號已被停權，暫時無法刷新裝置登入。",
    );
    expect(emptyState.props.actionTitle).toBe("重新綁定裝置");

    await act(async () => {
      emptyState.props.onAction();
      await flushEffects();
    });
    expect(mocks.push).toHaveBeenCalledWith("/onboarding");
  });

  it("surfaces the DEVICE_NOT_BOUND reason when the device is unbound and identity is clean", async () => {
    mocks.isDriverIdentityProvisioned.mockReturnValue(false);
    mocks.getDriverIdentityIssue.mockReturnValue(null);

    const renderer = await renderShift();
    const emptyState = renderer.root.findByType("EmptyState");

    expect(emptyState.props.title).toBe("尚未綁定裝置");
    expect(emptyState.props.description).toContain("車隊綁定");
    expect(emptyState.props.actionTitle).toBe("前往配置裝置");
  });
});

describe("ShiftScreen shows only real shift data (provisioned)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDriverIdentityProvisioned.mockReturnValue(true);
    mocks.getDriverIdentityIssue.mockReturnValue(null);
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.listShifts.mockResolvedValue([]);
    mocks.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    mocks.getBackgroundPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it("off shift: shows the pre-online checklist and clock-in, with no invented off time or placeholder tiles", async () => {
    const renderer = await renderShift();
    const visible = visibleStrings(renderer).join("\n");

    // The invented "clock-in + 8 hours" off time is gone everywhere.
    expect(visible).not.toContain("預計下線");
    // No hero of placeholders and no wall of "waiting" tiles before a shift.
    for (const placeholder of [
      "--:--",
      "尚未填寫",
      "等待上線",
      "開始後顯示",
      "待上線",
      "尚未開始",
      "尚無資料",
    ]) {
      expect(visible).not.toContain(placeholder);
    }
    // Developer notes are not shown as copy.
    expect(visible).not.toContain("班次資料保護原則");
    expect(visible).not.toContain("保護機制");
    expect(visible).not.toContain("沿用既有");
    expect(renderer.root.findAllByType("AuthorityBanner")).toHaveLength(0);

    expect(textNodes(renderer)).toContain("上線前檢查");
    const clockIn = renderer.root
      .findAllByType("ActionButton")
      .filter((node: any) => node.props.title === "上線打卡");
    expect(clockIn).toHaveLength(1);
    expect(renderer.root.findAllByType("StatusChip").length).toBeGreaterThan(0);
  });

  it("on shift: shows recorded values only, in Taiwan time, and no invented off time", async () => {
    mocks.listShifts.mockResolvedValue([
      {
        shiftId: "shift-1",
        driverId: "driver-001",
        vehicleId: null,
        status: "active",
        clockedInAt: "2026-11-26T01:00:00.000Z",
        clockedOutAt: null,
        startLocation: null,
        endLocation: null,
        startOdometer: 50000,
        endOdometer: null,
        notes: null,
        totalHours: null,
      },
    ]);

    const renderer = await renderShift();
    const visible = visibleStrings(renderer).join("\n");
    const texts = textNodes(renderer);

    expect(visible).not.toContain("預計下線");
    expect(visible).not.toContain("未填寫");
    expect(visible).toContain("上班中");
    expect(texts).toContain("起始里程");
    expect(texts).toContain("50,000 km");
    expect(texts).toContain("開始時間");
    // Fields the shift does not have are left out instead of padded.
    expect(texts).not.toContain("車輛");
    expect(texts).not.toContain("起始位置");
    // 01:00 UTC is 09:00 in Taiwan.
    expect(visible).toMatch(/自 \S*09:00 起/);

    // With no platform data the section says so once and offers the next step.
    expect(texts).toContain("目前沒有平台資料。");
    const platformAction = renderer.root
      .findAllByType("ActionButton")
      .find((node: any) => node.props.title === "查看平台狀態");
    expect(platformAction).toBeDefined();
    await act(async () => {
      platformAction.props.onPress();
    });
    expect(mocks.push).toHaveBeenCalledWith("/platform-presence");
  });

  it("feature off: 返回工作台 goes to the home tab, not onboarding", async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false);

    const renderer = await renderShift();
    const emptyState = renderer.root.findByType("EmptyState");
    expect(emptyState.props.actionTitle).toBe("返回工作台");

    await act(async () => {
      emptyState.props.onAction();
    });
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.push).not.toHaveBeenCalledWith("/onboarding");
  });
});
