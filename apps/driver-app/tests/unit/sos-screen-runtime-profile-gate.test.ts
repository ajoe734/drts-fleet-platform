import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S3-FIX-DRIVER-SOS-VOCAB-001 — the S-3 SOS home must not put cross-platform
// vocabulary or cross-platform order identifiers in front of a
// multi_taxi_direct driver.
//
// This renders the REAL screen against REAL UnifiedDriverTaskView rows rather
// than asserting on the source text. A source-level assertion would pass for a
// screen that keeps the rows and hides them with a style, which
// 02_ui_visual_design_team_brief_20260720.md §1.3 forbids outright
// ("不得以 CSS 隱藏既有多平台元件後交稿"). Reading the rendered tree is the only
// check that can tell "absent" from "hidden".

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
}));

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Linking: { openURL: vi.fn() },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Pressable: "Pressable",
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  Vibration: { vibrate: vi.fn() },
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: mocks.push,
    back: mocks.back,
    replace: mocks.replace,
  }),
}));

vi.mock("expo-image-picker", () => ({
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

// The canvas primitives are stubbed as host elements so the rendered tree keeps
// its labels/values inspectable. The theme is a flat token stub rather than the
// real module: canvas-primitives pulls in @drts/ui-web/canvas-tokens, which is
// not aliased for this app's vitest resolver. The screen only reads scalar
// colour/font tokens off THEME at module scope, so a flat object is sufficient
// — this test asserts on copy and row structure, never on rendered colour.
vi.mock("@/components/canvas-primitives", () => {
  const stub =
    (name: string) => (props: Record<string, unknown>) =>
      React.createElement(
        name,
        props,
        (props as { children?: React.ReactNode }).children,
      );
  return {
    driverCanvasTheme: {
      bgRaised: "#111827",
      border: "#1F2937",
      danger: "#C4271B",
      dangerBg: "#2A1210",
      fontFamily: "System",
      info: "#38BDF8",
      monoFamily: "monospace",
      success: "#22C55E",
      surfaceLo: "#0B1220",
      text: "#F9FAFB",
      textDim: "#6B7280",
      textMuted: "#9CA3AF",
      warn: "#F59E0B",
      warnBg: "#2A1F08",
    },
    Banner: stub("Banner"),
    Btn: stub("Btn"),
    Card: stub("Card"),
    DL: stub("DL"),
    Field: stub("Field"),
    PageHeader: stub("PageHeader"),
    Pill: stub("Pill"),
    Shell: stub("Shell"),
  };
});

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
  }),
  recoverDriverSessionFromApiError: vi.fn(),
}));

vi.mock("@/lib/driver-sos-attachment-upload", () => ({
  syncDriverSosAttachments: vi.fn(),
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getLatestDriverLocationUpdate: () => null,
}));

import SosScreen from "../../app/sos";

// §1.3 禁止出現 — the subset that a driver order-context card could plausibly
// reintroduce. Matched case-insensitively against every rendered string.
const FORBIDDEN_TERMS = [
  "forwarded",
  "mirror",
  "native status",
  "外部平台名稱",
  "外部平台 badge",
  "平台聚合切換器",
];

const OWNED_TASK = {
  taskId: "TASK-OWNED-001",
  orderId: "ZX-240720-0186",
  orderDomain: "owned",
  sourcePlatform: "drts",
  platformDisplayName: "DRTS",
  externalOrderId: null,
  nativeStatus: null,
  localStatus: "in_progress",
  driverActionState: "none",
  allowedActions: [],
  routeLocked: false,
  fareAuthority: "platform",
  settlementAuthority: "platform",
  driverPayoutAuthority: "platform",
  requiresManualFallback: false,
  requiresReauth: false,
  syncIssueSummary: null,
  blockingReason: null,
  pickupSummary: "信義區松仁路 100 號",
  dropoffSummary: "中山區南京東路二段 100 號",
  deadlineAt: null,
  updatedAt: "2026-07-20T14:30:12.000Z",
};

// A cross-platform row that the pre-fix screen actively PREFERRED as the SOS
// context. Its identifiers are the ones that must never surface under
// multi_taxi_direct.
const AGGREGATED_TASK = {
  ...OWNED_TASK,
  taskId: "TASK-EXTERNAL-002",
  orderId: "MIRROR-9001",
  orderDomain: "forwarded",
  sourcePlatform: "yueyu",
  platformDisplayName: "яндекс",
  externalOrderId: "EXT-77421",
  nativeStatus: "confirmed_by_platform",
  localStatus: "accept_pending",
};

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderSosScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(SosScreen));
    await flushEffects();
  });
  return renderer;
}

function findContextCard(renderer: any) {
  return renderer.root.find(
    (node: any) =>
      node.type === "Card" && node.props.title === "當前訂單情境",
  );
}

function contextRows(renderer: any): Array<{ label: string; value: string }> {
  return findContextCard(renderer).findByType("DL").props.items;
}

/** Every string that actually reaches the rendered tree. */
function renderedStrings(renderer: any): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    for (const value of Object.values(node.props ?? {})) {
      if (typeof value === "string") out.push(value);
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry && typeof entry === "object") {
            for (const inner of Object.values(entry)) {
              if (typeof inner === "string") out.push(inner);
            }
          }
        }
      }
    }
    (node.children ?? []).forEach(walk);
  };
  walk(renderer.root);
  return out;
}

describe("SOS screen · runtime profile capability gate", () => {
  const originalProfile = process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE;
    mocks.listUnifiedDriverTasks
      .mockReset()
      .mockResolvedValue([AGGREGATED_TASK, OWNED_TASK]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalProfile === undefined) {
      delete process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE;
    } else {
      process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE = originalProfile;
    }
  });

  it("renders no §1.3 forbidden vocabulary anywhere under multi_taxi_direct", async () => {
    const renderer = await renderSosScreen();
    const strings = renderedStrings(renderer);

    // Guard against a vacuous pass: if the walker stopped collecting copy, the
    // forbidden-term filter below would be empty for the wrong reason.
    expect(strings).toContain("當前訂單情境");
    expect(strings).toContain("ZX-240720-0186");

    const offenders = strings.filter((text) =>
      FORBIDDEN_TERMS.some((term) =>
        text.toLowerCase().includes(term.toLowerCase()),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("omits the aggregation rows from the component tree, rather than hiding them", async () => {
    const renderer = await renderSosScreen();

    const labels = contextRows(renderer).map((row) => row.label);

    expect(labels).toEqual([
      "行程編號",
      "任務編號",
      "目前狀態",
      "目前位置",
    ]);
    expect(labels).not.toContain("來源平台");
    expect(labels).not.toContain("平台狀態");
    expect(labels).not.toContain("平台訂單編號");
  });

  it("never selects a cross-platform task as the SOS context under multi_taxi_direct", async () => {
    const renderer = await renderSosScreen();
    const rows = contextRows(renderer);

    const orderRow = rows.find((row) => row.label === "行程編號");
    const taskRow = rows.find((row) => row.label === "任務編號");

    // The aggregated task is first in the API response and was previously
    // preferred outright; the gate must fall through to the owned-domain task.
    expect(orderRow?.value).toBe("ZX-240720-0186");
    expect(taskRow?.value).toBe("TASK-OWNED-001");

    const values = rows.map((row) => row.value);
    expect(values).not.toContain("MIRROR-9001");
    expect(values).not.toContain("EXT-77421");
    expect(values).not.toContain("яндекс");
  });

  it("marks the context as an owned-platform trip", async () => {
    const renderer = await renderSosScreen();

    const pills = findContextCard(renderer).findAllByType("Pill");
    expect(pills[0].props.children).toBe("本平台行程");
  });

  it("still shows aggregation rows for a profile that permits forwarded_order_ui", async () => {
    // Proves the gate is conditional on the capability contract rather than a
    // blanket deletion: ordinary_taxi declares no forbidden capabilities.
    process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE = "ordinary_taxi";

    const renderer = await renderSosScreen();
    const rows = contextRows(renderer);
    const labels = rows.map((row) => row.label);

    expect(labels).toContain("來源平台");
    expect(labels).toContain("平台狀態");
    expect(labels).toContain("平台訂單編號");
    expect(rows.find((row) => row.label === "平台訂單編號")?.value).toBe(
      "EXT-77421",
    );
  });

  it("fails closed to multi_taxi_direct when the profile override is unrecognised", async () => {
    process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE = "multi_taxi_dirct";

    const renderer = await renderSosScreen();
    const labels = contextRows(renderer).map((row) => row.label);

    expect(labels).not.toContain("來源平台");
  });
});
