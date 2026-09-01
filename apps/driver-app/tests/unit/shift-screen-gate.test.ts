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
  useRouter: () => ({ push: mocks.push }),
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

vi.mock("@/lib/api-client", () => {
  const driverClient = {
    isFeatureEnabled: vi.fn().mockResolvedValue(true),
    listShifts: vi.fn().mockResolvedValue([]),
    getPlatformPresence: vi.fn().mockResolvedValue(null),
    clockIn: vi.fn(),
    clockOut: vi.fn(),
  };
  return {
    isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
    getDriverIdentityIssue: mocks.getDriverIdentityIssue,
    getDriverClient: () => driverClient,
    getDriverClientOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? driverClient : null,
    getDriverId: () => "driver-001",
    getDriverIdOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? "driver-001" : null,
    formatDriverError: (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback,
    sanitizeLogMessage: (value: unknown) =>
      typeof value === "string" ? value : null,
  };
});

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getActiveDriverHeartbeatWorkState: () => null,
  stopDriverLocationHeartbeat: vi.fn(),
  syncDriverOnlineAvailableHeartbeat: vi.fn(),
}));

vi.mock("@/lib/strings", () => ({
  driverStrings: {
    shift: {
      title: "班次",
      summaryTitle: "班次摘要",
      readinessTitle: "上線準備",
      statusLabel: "狀態",
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
    (name: string) =>
    (props: { children?: React.ReactNode }) =>
      React.createElement(name, props, props.children);

  return {
    ActionButton: uiComponent("ActionButton"),
    AppScreen: uiComponent("AppScreen"),
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

import ShiftScreen from "../../app/(tabs)/index/shift";

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderShift() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(ShiftScreen));
    await flushEffects();
  });
  return renderer;
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

describe("ShiftScreen pre-online gate (unprovisioned)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  // Requirement 2: neither unprovisioned gate variant may leak developer copy.
  it("keeps the identity-invalid gate free of developer copy", async () => {
    mocks.isDriverIdentityProvisioned.mockReturnValue(false);
    mocks.getDriverIdentityIssue.mockReturnValue(
      "此司機帳號已被停權，暫時無法刷新裝置登入。",
    );

    const renderer = await renderShift();
    expect(renderedCopy(renderer)).toContain("司機身分需重新驗證");
    expectNoDeveloperCopy(renderer);
  });

  it("keeps the unbound-device gate free of developer copy", async () => {
    mocks.isDriverIdentityProvisioned.mockReturnValue(false);
    mocks.getDriverIdentityIssue.mockReturnValue(null);

    const renderer = await renderShift();
    expect(renderedCopy(renderer)).toContain("尚未綁定裝置");
    expectNoDeveloperCopy(renderer);
  });

});
