import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedDriverTaskView } from "@drts/contracts";

// This suite renders the jobs screen against the *real* canvas primitives so
// that the app chrome itself is under test:
//   * the tab bar must come from the single global <Tabs> layout only, never
//     from a screen drawing its own row of tab buttons;
//   * on a device the shell must clear the notch with a real safe area inset
//     instead of the simulated "9:30 / 87%" status bar used by the web preview.
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
  getOrder: vi.fn(),
  getPendingDriverTaskCompletion: vi.fn(),
  acceptForwardedDriverOffer: vi.fn(),
  rejectForwardedDriverOffer: vi.fn(),
  getDriverIdentityIssue: vi.fn((): string | null => null),
  isDriverIdentityProvisioned: vi.fn(() => true),
  getDriverId: vi.fn(() => "drv-001"),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Animated: {
      View: p("AnimatedView"),
      Value: class {
        setValue() {}
        interpolate() {
          return this;
        }
      },
      timing: () => ({ start: (cb?: () => void) => cb?.() }),
      spring: () => ({ start: (cb?: () => void) => cb?.() }),
    },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Platform: { OS: "ios", select: (spec: any) => spec.ios ?? spec.default },
    Pressable: p("Pressable"),
    ScrollView: p("ScrollView"),
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    TextInput: "TextInput",
    View: p("View"),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: (props: Record<string, unknown>) =>
    React.createElement("SafeAreaView", props, props.children as never),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) =>
    React.createElement("Ionicons", props),
}));

vi.mock("@/components/ui", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return { AuthorityBanner: p("AuthorityBanner"), PlatformBadge: p("Badge") };
});

// `@/lib/driver-diagnostics` and `@/lib/driver-feature-flags` are loaded for
// real by the screen, and diagnostics imports `sanitizeLogMessage` from this
// module - so the mock has to provide it, plus the null-returning identity
// accessors the screen now uses.
vi.mock("@/lib/api-client", () => {
  const driverClient = {
    isFeatureEnabled: mocks.isFeatureEnabled,
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
    getOrder: mocks.getOrder,
  };
  return {
    acceptForwardedDriverOffer: mocks.acceptForwardedDriverOffer,
    rejectForwardedDriverOffer: mocks.rejectForwardedDriverOffer,
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
    getDriverIdentityIssue: mocks.getDriverIdentityIssue,
    getPendingDriverTaskCompletion: mocks.getPendingDriverTaskCompletion,
  };
});

import { Shell } from "../../components/canvas-primitives";
import JobsScreen from "../../app/(tabs)/jobs/index";

async function flush() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(JobsScreen));
    await flush();
  });
  return renderer;
}

function texts(renderer: any): string[] {
  return renderer.root
    .findAll((node: any) => node.type === "Text")
    .flatMap((node: any) =>
      Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children],
    )
    .filter((value: unknown): value is string => typeof value === "string");
}

function task(
  overrides: Partial<UnifiedDriverTaskView> = {},
): UnifiedDriverTaskView {
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

// The self-drawn tab row rendered these labels as standalone text nodes.
// "任務" is deliberately excluded: it is this screen's own page title. The
// guard matches whole text nodes, so legitimate copy such as "平台結案" or
// "開啟行程作業" is not caught.
const GLOBAL_TAB_LABELS = ["工作台", "行程", "平台", "設定"];

describe("jobs screen navigation chrome", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getOrder.mockReset().mockRejectedValue(new Error("no order"));
    mocks.getPendingDriverTaskCompletion.mockReset().mockResolvedValue(null);
    mocks.getDriverIdentityIssue.mockReset().mockReturnValue(null);
  });

  it("does not draw a second tab bar next to the global one", async () => {
    const renderer = await renderScreen();

    const rendered = texts(renderer);
    const duplicated = GLOBAL_TAB_LABELS.filter((label) =>
      rendered.includes(label),
    );
    expect(duplicated).toEqual([]);
  });

  it("keeps the duplicate tab bar away from the populated task list too", async () => {
    mocks.listUnifiedDriverTasks.mockResolvedValue([
      task(),
      task({ taskId: "task-002", driverActionState: "awaiting_platform" }),
    ]);
    const renderer = await renderScreen();

    const rendered = texts(renderer);
    const duplicated = GLOBAL_TAB_LABELS.filter((label) =>
      rendered.includes(label),
    );
    expect(duplicated).toEqual([]);
  });

  it("passes no footer to the shell, so no empty footer strip is left behind", async () => {
    const renderer = await renderScreen();

    const shell = renderer.root.findByType(Shell as never);
    expect(shell.props.footer).toBeUndefined();
    expect(
      renderer.root.findAll(
        (node: any) =>
          node.type === "View" && node.props.style?.flexShrink === 0,
      ),
    ).toHaveLength(0);
  });

  it("still routes to the trip workspace from the task list", async () => {
    mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
    const renderer = await renderScreen();

    const card = renderer.root
      .findAll((node: any) => node.type === "Pressable")
      .find((node: any) =>
        node
          .findAll((child: any) => child.type === "Text")
          .some(
            (child: any) =>
              typeof child.props.children === "string" &&
              child.props.children.includes("台北車站"),
          ),
      );
    expect(card).toBeDefined();

    await act(async () => {
      card.props.onPress();
      await flush();
    });
    expect(mocks.push).toHaveBeenCalledWith("/trip");
  });

  it("keeps the filter chips and their selected state", async () => {
    mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
    const renderer = await renderScreen();

    const chipRow = renderer.root.findAllByType("ScrollView")[1];
    const chips = chipRow.findAll((node: any) => node.type === "Pressable");
    expect(chips.length).toBeGreaterThan(1);

    const selectedBefore = chips.map(
      (chip: any) => chip.findByType("Text").props.style,
    );
    await act(async () => {
      chips[1].props.onPress();
      await flush();
    });
    const selectedAfter = renderer.root
      .findAllByType("ScrollView")[1]
      .findAll((node: any) => node.type === "Pressable")
      .map((chip: any) => chip.findByType("Text").props.style);

    expect(selectedAfter).not.toEqual(selectedBefore);
  });
});

describe("jobs screen safe area", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getOrder.mockReset().mockRejectedValue(new Error("no order"));
    mocks.getPendingDriverTaskCompletion.mockReset().mockResolvedValue(null);
    mocks.getDriverIdentityIssue.mockReset().mockReturnValue(null);
  });

  it("wraps the screen in a top safe area inset on a device", async () => {
    const renderer = await renderScreen();

    const safeArea = renderer.root.findByType("SafeAreaView");
    expect(safeArea.props.edges).toEqual(["top"]);
    expect(safeArea.findByType("ScrollView")).toBeDefined();
  });

  it("never shows the simulated status bar on a device", async () => {
    const renderer = await renderScreen();

    const rendered = texts(renderer);
    expect(rendered).not.toContain("9:30");
    expect(rendered).not.toContain("87%");
    expect(
      renderer.root.findAll(
        (node: any) =>
          node.type === "Ionicons" &&
          ["wifi-outline", "battery-half-outline"].includes(node.props.name),
      ),
    ).toHaveLength(0);
  });
});
