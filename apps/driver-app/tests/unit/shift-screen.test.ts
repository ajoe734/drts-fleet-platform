import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listShifts: vi.fn(),
  getPlatformPresence: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  listDriverTasks: vi.fn(),
  syncDriverIdentityBootstrap: vi.fn(),
  resetDriverAppToOnboarding: vi.fn(),
  syncDriverLocationHeartbeat: vi.fn(),
  initializeDriverIdentity: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: {
    alert: mocks.alert,
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  View: "View",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
}));

vi.mock("@/components/platform-status-card", () => ({
  assessPlatformHealth: () => ({
    statusTone: "healthy",
    statusLabel: "Healthy",
    availabilityLabel: "Available",
    syncSummary: "OK",
  }),
  getPlatformHealthSeverity: () => "success",
}));

vi.mock("@/components/ui", () => ({
  ActionButton: (props: Record<string, unknown>) =>
    React.createElement("ActionButton", props),
  AppScreen: (props: { children?: React.ReactNode }) =>
    React.createElement("AppScreen", props, props.children),
  AuthorityBanner: (props: Record<string, unknown>) =>
    React.createElement("AuthorityBanner", props),
  BottomActionBar: (props: { children?: React.ReactNode }) =>
    React.createElement("BottomActionBar", props, props.children),
  EmptyState: (props: Record<string, unknown>) =>
    React.createElement("EmptyState", props),
  ErrorBanner: (props: Record<string, unknown>) =>
    React.createElement("ErrorBanner", props),
  FormField: (props: Record<string, unknown>) =>
    React.createElement("FormField", props),
  IconButton: (props: Record<string, unknown>) =>
    React.createElement("IconButton", props),
  PageHeader: (props: Record<string, unknown>) =>
    React.createElement("PageHeader", props),
  PlatformBadge: (props: Record<string, unknown>) =>
    React.createElement("PlatformBadge", props),
  StatusChip: (props: Record<string, unknown>) =>
    React.createElement("StatusChip", props),
  Tokens: {
    colors: {
      primary: "#000",
      appBg: "#fff",
      textMuted: "#666",
      surface: "#fff",
      border: "#ddd",
      textStrong: "#111",
      textDim: "#555",
      bgRaised: "#fafafa",
      surfaceLo: "#f5f5f5",
      successBg: "#e8f7ee",
      success: "#0a7f3f",
      warningBg: "#fff6e0",
      warning: "#c57a00",
      dangerBg: "#fdecea",
      danger: "#b42318",
      surfaceDanger: "#fff1f3",
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
    },
    radius: {
      lg: 12,
      xl: 16,
    },
    shadows: {
      md: {},
    },
    fonts: {
      mono: "monospace",
    },
    type: {
      micro: {},
      small: {},
      bodyStrong: {},
      sectionTitle: {},
      title: {},
    },
  },
}));

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    isFeatureEnabled: mocks.isFeatureEnabled,
    listShifts: mocks.listShifts,
    getPlatformPresence: mocks.getPlatformPresence,
    clockIn: mocks.clockIn,
    clockOut: mocks.clockOut,
    listDriverTasks: mocks.listDriverTasks,
  }),
  getDriverId: () => "driver-001",
  getDriverIdentityIssue: () => null,
  initializeDriverIdentity: mocks.initializeDriverIdentity,
  isDriverIdentityProvisioned: () => true,
}));

vi.mock("@/lib/driver-identity-bootstrap", () => ({
  syncDriverIdentityBootstrap: mocks.syncDriverIdentityBootstrap,
}));

vi.mock("@/lib/driver-identity-routing", () => ({
  resetDriverAppToOnboarding: mocks.resetDriverAppToOnboarding,
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  syncDriverLocationHeartbeat: mocks.syncDriverLocationHeartbeat,
}));

import ShiftScreen from "../../app/shift";

const activeShift = {
  shiftId: "shift-001",
  driverId: "driver-001",
  vehicleId: "vehicle-001",
  status: "active",
  clockedInAt: "2026-06-20T09:00:00.000Z",
  clockedOutAt: null,
  startOdometer: 1200,
  endOdometer: null,
  startLocation: "Depot A",
  endLocation: null,
  totalHours: null,
};

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function findActionButton(renderer: any, title: string) {
  return renderer.root.find(
    (node: any) => node.type === "ActionButton" && node.props.title === title,
  );
}

describe("ShiftScreen", () => {
  beforeEach(() => {
    mocks.alert.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listShifts.mockReset().mockResolvedValue([]);
    mocks.getPlatformPresence.mockReset().mockResolvedValue({
      shifts: [],
      platforms: [],
      updatedAt: "2026-06-20T09:00:00.000Z",
    });
    mocks.clockIn.mockReset().mockResolvedValue(activeShift);
    mocks.clockOut.mockReset().mockResolvedValue(undefined);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.syncDriverIdentityBootstrap.mockReset().mockResolvedValue("synced");
    mocks.resetDriverAppToOnboarding.mockReset();
    mocks.syncDriverLocationHeartbeat.mockReset().mockResolvedValue({
      status: "active",
      message: null,
      latestUpdate: null,
    });
    mocks.initializeDriverIdentity.mockReset().mockResolvedValue(undefined);
  });

  it("resyncs heartbeat immediately after clocking in", async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(ShiftScreen));
      await flushEffects();
    });

    await act(async () => {
      findActionButton(renderer, "上線打卡").props.onPress();
      await flushEffects();
    });

    expect(mocks.clockIn).toHaveBeenCalledWith({
      driverId: "driver-001",
      vehicleId: undefined,
      location: undefined,
      odometer: undefined,
    });
    expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(1);
    expect(mocks.syncDriverIdentityBootstrap.mock.calls[0]?.[0]).toMatchObject({
      router: expect.objectContaining({
        push: mocks.push,
        replace: mocks.replace,
      }),
      syncDriverLocationHeartbeat: mocks.syncDriverLocationHeartbeat,
    });
  });

  it("resyncs heartbeat immediately after clocking out", async () => {
    mocks.listShifts.mockResolvedValue([activeShift]);

    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(ShiftScreen));
      await flushEffects();
    });

    await act(async () => {
      findActionButton(renderer, "下線打卡").props.onPress();
      await flushEffects();
    });

    expect(mocks.clockOut).toHaveBeenCalledWith({
      driverId: "driver-001",
      location: undefined,
      odometer: undefined,
    });
    expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(1);
  });
});
