import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverTaskRecord } from "@drts/contracts";

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
  replace: vi.fn(),
  canDismiss: vi.fn(() => false),
  dismissAll: vi.fn(),
  alert: vi.fn(),
  listDriverTasks: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  getOrder: vi.fn(),
  getPlatformPresence: vi.fn(),
  acceptTask: vi.fn(),
  departTask: vi.fn(),
  arrivedPickupTask: vi.fn(),
  startTask: vi.fn(),
  submitDriverTaskCompletion: vi.fn(),
  acceptForwardedDriverOffer: vi.fn(),
  rejectForwardedDriverOffer: vi.fn(),
  getPendingDriverTaskCompletion: vi.fn(),
  replayPendingDriverTaskCompletion: vi.fn(),
  getDriverIdentityIssue: vi.fn(() => null as string | null),
  syncDriverLocationHeartbeat: vi.fn(),
  stopDriverLocationHeartbeat: vi.fn(),
  getLatestDriverLocationUpdate: vi.fn(() => null),
  subscribeToDriverLocationUpdates: vi.fn(() => () => {}),
  subscribeTrackingDiagnostic: vi.fn(
    (listener: (state: unknown) => void): (() => void) => {
      void listener;
      return () => {};
    },
  ),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Alert: { alert: mocks.alert },
    Image: p("Image"),
    Platform: { OS: "ios", select: (spec: any) => spec.ios ?? spec.default },
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    View: p("View"),
  };
});

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    canDismiss: mocks.canDismiss,
    dismissAll: mocks.dismissAll,
  }),
}));

vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: mocks.requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync:
    mocks.requestMediaLibraryPermissionsAsync,
  launchCameraAsync: mocks.launchCameraAsync,
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: passthrough("Ionicons") }));

vi.mock("@/components/canvas-primitives", () => ({
  Banner: withProp("Banner", "body"),
  Btn: passthrough("Btn"),
  Card: passthrough("Card"),
  DL: passthrough("DL"),
  Field: passthrough("Field"),
  Input: passthrough("Input"),
  PageHeader: withProp("CanvasPageHeader", "actions"),
  Pill: passthrough("Pill"),
  Shell: withProp("Shell", "footer"),
  driverCanvasTheme: new Proxy({}, { get: () => "#000000" }),
}));

vi.mock("@/components/driver-trip-map", () => ({
  default: passthrough("DriverTripMap"),
}));

vi.mock("@/lib/api-client", () => ({
  acceptForwardedDriverOffer: mocks.acceptForwardedDriverOffer,
  rejectForwardedDriverOffer: mocks.rejectForwardedDriverOffer,
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  getDriverClient: () => ({
    listDriverTasks: mocks.listDriverTasks,
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    getOrder: mocks.getOrder,
    getPlatformPresence: mocks.getPlatformPresence,
    acceptTask: mocks.acceptTask,
    departTask: mocks.departTask,
    arrivedPickupTask: mocks.arrivedPickupTask,
    startTask: mocks.startTask,
  }),
  getDriverIdentityIssue: mocks.getDriverIdentityIssue,
  getPendingDriverTaskCompletion: mocks.getPendingDriverTaskCompletion,
  replayPendingDriverTaskCompletion: mocks.replayPendingDriverTaskCompletion,
  submitDriverTaskCompletion: mocks.submitDriverTaskCompletion,
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getLatestDriverLocationUpdate: mocks.getLatestDriverLocationUpdate,
  stopDriverLocationHeartbeat: mocks.stopDriverLocationHeartbeat,
  subscribeToDriverLocationUpdates: mocks.subscribeToDriverLocationUpdates,
  syncDriverLocationHeartbeat: mocks.syncDriverLocationHeartbeat,
  HEARTBEAT_TRACKED_TASK_STATUSES: new Set([
    "accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
  ]),
}));

vi.mock("@/lib/driver-tracking-recovery", () => ({
  formatTrackingGapNotice: (gap: { lastTaskId: string | null }) =>
    `追蹤中斷：${gap.lastTaskId ?? "未知任務"}`,
  subscribeTrackingDiagnostic: mocks.subscribeTrackingDiagnostic,
}));

import TripScreen from "../../app/(tabs)/trip/index";

async function flush() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(TripScreen));
    await flush();
  });
  return renderer;
}

function ownedTask(overrides: Partial<DriverTaskRecord> = {}) {
  return {
    taskId: "task-001",
    orderId: "order-001",
    driverId: "drv-001",
    status: "pending_acceptance",
    sourcePlatform: null,
    acceptedAt: null,
    startedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    updatedAt: "2026-05-08T03:00:00.000Z",
    ...overrides,
  } as unknown as DriverTaskRecord;
}

function forwardedTask(overrides: Partial<DriverTaskRecord> = {}) {
  return ownedTask({
    taskId: "task-fwd",
    sourcePlatform: "grab",
    ...overrides,
  });
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-001",
    pickup: { address: "台北車站" },
    dropoff: { address: "台北 101" },
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    quotedFare: { currency: "TWD", amountMinor: 25000 },
    recordingId: null,
    etaSnapshot: null,
    fixedPrice: false,
    serviceBucket: null,
    businessDispatchSubtype: null,
    dispatchSemantics: null,
    ...overrides,
  };
}

function actionButtons(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Btn");
}

function buttonWithLabel(renderer: any, label: string) {
  return actionButtons(renderer).find(
    (node: any) => node.props.children === label,
  );
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

function inputWithPlaceholder(renderer: any, placeholder: string) {
  return renderer.root.find(
    (node: any) => node.type === "Input" && node.props.ph === placeholder,
  );
}

function lastAlert(): any[] {
  return mocks.alert.mock.calls.at(-1) as any[];
}


// --- developer-copy guard ---------------------------------------------------
// Requirement 2: no screen state may show system architecture, API paths, spec
// numbers, code identifiers or internal sync strategy. The guard walks every
// rendered host node and reads back only the props that actually carry copy,
// so it sees titles/subtitles/labels handed to the mocked primitives too.
const COPY_BEARING_PROPS = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "actionTitle",
  "authorityLabel",
  "body",
  "children",
  "code",
  "description",
  "detail",
  "error",
  "eyebrow",
  "helpText",
  "hint",
  "items",
  "label",
  "message",
  "name",
  "ph",
  "placeholder",
  "subtitle",
  "text",
  "title",
  "value",
]);

function collectCopy(value: unknown, out: string[]) {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCopy(entry, out);
    }
    return;
  }
  if (value && typeof value === "object") {
    if ((value as { $$typeof?: symbol }).$$typeof) {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (COPY_BEARING_PROPS.has(key)) {
        collectCopy(nested, out);
      }
    }
  }
}

function renderedCopy(renderer: any): string {
  const out: string[] = [];
  const nodes = renderer.root.findAll(
    (node: any) => typeof node.type === "string" && node.type !== "Ionicons",
  );
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.props ?? {})) {
      if (COPY_BEARING_PROPS.has(key)) {
        collectCopy(value, out);
      }
    }
  }
  return out.join("\n");
}

const DEVELOPER_COPY_PATTERNS: Array<[string, RegExp]> = [
  ["spec", /\bspec/i],
  ["§", /§/],
  ["Q-DRV", /q-drv/i],
  ["capability", /capabilit/i],
  ["guardrail", /guardrail/i],
  ["forwarded", /forwarded/i],
  ["sync_failed", /sync_failed/i],
  ["degraded", /degraded/i],
  ["down", /\bdown\b/i],
  ["sitemap", /sitemap/i],
  ["cockpit", /cockpit/i],
  ["packet", /packet/i],
  ["Phase 1", /phase\s*1/i],
  ["fallback", /fallback/i],
  ["API", /\bapi\b/i],
  ["/api/", /\/api\//i],
  ["EmptyReason", /emptyreason/i],
  ["ResourceActionDescriptor", /resourceaction/i],
  ["CrossAppResourceLink", /crossapp/i],
  ["next-best-action", /next-best/i],
  ["deep link", /deep[ _-]?link/i],
  ["allowedActions/availableActions", /(allowed|available)actions/i],
  ["web console", /web console/i],
  ["EXPO_PUBLIC", /expo_public/i],
  ["outbox", /outbox/i],
  ["idempotency", /idempoten/i],
  ["relay", /\brelay\b/i],
  ["requirements", /requirement/i],
  ["mirror jargon", /鏡像|生命周期|生命週期|旗標|降級|主控/],
];

function developerTermsIn(renderer: any): string[] {
  const copy = renderedCopy(renderer);
  return DEVELOPER_COPY_PATTERNS.filter(([, pattern]) =>
    pattern.test(copy),
  ).map(([term]) => term);
}

describe("TripScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T04:00:00.000Z"));

    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.canDismiss.mockReset().mockReturnValue(false);
    mocks.dismissAll.mockReset();
    mocks.alert.mockReset();
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getOrder.mockReset().mockResolvedValue(order());
    mocks.getPlatformPresence.mockReset().mockResolvedValue({ presences: [] });
    mocks.acceptTask.mockReset().mockResolvedValue(undefined);
    mocks.departTask.mockReset().mockResolvedValue(undefined);
    mocks.arrivedPickupTask.mockReset().mockResolvedValue(undefined);
    mocks.startTask.mockReset().mockResolvedValue(undefined);
    mocks.submitDriverTaskCompletion.mockReset().mockResolvedValue(undefined);
    mocks.acceptForwardedDriverOffer
      .mockReset()
      .mockResolvedValue({
        outcome: "accept_pending",
        driverMessage: "已送出",
      });
    mocks.rejectForwardedDriverOffer
      .mockReset()
      .mockResolvedValue({ outcome: "rejected", driverMessage: "已婉拒" });
    mocks.getPendingDriverTaskCompletion.mockReset().mockResolvedValue(null);
    mocks.replayPendingDriverTaskCompletion.mockReset().mockResolvedValue(null);
    mocks.getDriverIdentityIssue.mockReset().mockReturnValue(null);
    mocks.syncDriverLocationHeartbeat
      .mockReset()
      .mockResolvedValue({
        status: "active",
        message: null,
        latestUpdate: null,
      });
    mocks.stopDriverLocationHeartbeat.mockReset().mockResolvedValue(undefined);
    mocks.getLatestDriverLocationUpdate.mockReset().mockReturnValue(null);
    mocks.subscribeToDriverLocationUpdates
      .mockReset()
      .mockReturnValue(() => {});
    mocks.subscribeTrackingDiagnostic.mockReset().mockReturnValue(() => {});
    mocks.requestCameraPermissionsAsync
      .mockReset()
      .mockResolvedValue({ granted: true });
    mocks.requestMediaLibraryPermissionsAsync
      .mockReset()
      .mockResolvedValue({ granted: true });
    mocks.launchCameraAsync
      .mockReset()
      .mockResolvedValue({ canceled: true, assets: [] });
    mocks.launchImageLibraryAsync
      .mockReset()
      .mockResolvedValue({ canceled: true, assets: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("loading and empty states", () => {
    it("shows a spinner during the first load", async () => {
      mocks.listDriverTasks.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(TripScreen));
      });
      expect(
        renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
      ).toHaveLength(1);
    });

    it("shows an empty state with a refresh action when no task is assigned", async () => {
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("目前沒有進行中的行程");
      const refresh = buttonWithLabel(renderer, "重新整理");
      await act(async () => {
        refresh.props.onPress();
        await flush();
      });
      expect(mocks.listDriverTasks.mock.calls.length).toBeGreaterThan(1);
    });

    it("renders no footer bar without a task", async () => {
      const renderer = await renderScreen();
      expect(renderer.root.findByType("Shell").props.footer).toBeUndefined();
    });

    it("surfaces a load error message", async () => {
      mocks.listDriverTasks.mockRejectedValue(new Error("行程服務離線"));
      const renderer = await renderScreen();
      const bodies = renderer.root
        .findAll((node: any) => node.type === "Banner")
        .map((node: any) => node.props.body);
      expect(bodies).toContain("行程服務離線");
    });
  });

  describe("owned trip workflow", () => {
    it("offers 接受任務 for a pending task and calls acceptTask", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      const renderer = await renderScreen();

      const primary = buttonWithLabel(renderer, "接受任務");
      expect(primary).toBeDefined();

      await act(async () => {
        primary.props.onPress();
        await flush();
      });

      expect(mocks.acceptTask).toHaveBeenCalledWith("task-001", {
        acceptedAt: "2026-05-08T04:00:00.000Z",
      });
      expect(lastAlert()[0]).toBe("成功");
      expect(lastAlert()[1]).toBe("已完成操作：接受任務");
    });

    it("advances to 前往接送點 once the task is accepted", async () => {
      mocks.listDriverTasks.mockResolvedValue([
        ownedTask({ status: "accepted" }),
      ]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "前往接送點").props.onPress();
        await flush();
      });
      expect(mocks.departTask).toHaveBeenCalledWith("task-001", {
        departedAt: "2026-05-08T04:00:00.000Z",
      });
    });

    it("advances to 抵達上車點 while en route", async () => {
      mocks.listDriverTasks.mockResolvedValue([
        ownedTask({ status: "enroute_pickup" }),
      ]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "抵達上車點").props.onPress();
        await flush();
      });
      expect(mocks.arrivedPickupTask).toHaveBeenCalledWith("task-001", {
        arrivedAt: "2026-05-08T04:00:00.000Z",
      });
    });

    it("advances to 開始行程 once at the pickup point", async () => {
      mocks.listDriverTasks.mockResolvedValue([
        ownedTask({ status: "arrived_pickup" }),
      ]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "開始行程").props.onPress();
        await flush();
      });
      expect(mocks.startTask).toHaveBeenCalledWith("task-001", {
        startedAt: "2026-05-08T04:00:00.000Z",
      });
    });

    it("reloads the trip after a successful action", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      const renderer = await renderScreen();
      const before = mocks.listDriverTasks.mock.calls.length;

      await act(async () => {
        buttonWithLabel(renderer, "接受任務").props.onPress();
        await flush();
      });
      expect(mocks.listDriverTasks.mock.calls.length).toBe(before + 1);
    });

    it("reports an action failure as an error alert", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      mocks.acceptTask.mockRejectedValue(new Error("派單已被收回"));
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受任務").props.onPress();
        await flush();
      });

      expect(lastAlert()).toEqual(["錯誤", "派單已被收回"]);
    });

    it("returns to onboarding when an action fails on a revoked session", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      mocks.acceptTask.mockRejectedValue(new Error("401"));
      mocks.getDriverIdentityIssue.mockReturnValue("device_revoked");
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受任務").props.onPress();
        await flush();
      });

      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
      expect(mocks.stopDriverLocationHeartbeat).toHaveBeenCalled();
      expect(mocks.alert).not.toHaveBeenCalledWith("錯誤", expect.anything());
    });
  });

  describe("completion gating", () => {
    const onTripTask = () =>
      ownedTask({
        status: "on_trip",
        startedAt: "2026-05-08T03:30:00.000Z",
      });

    it("completes a trip with no proof requirements", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "完成行程").props.onPress();
        await flush();
      });

      expect(mocks.submitDriverTaskCompletion).toHaveBeenCalledWith(
        "task-001",
        expect.objectContaining({
          completedAt: "2026-05-08T04:00:00.000Z",
          actualDistanceKm: 0,
          actualDurationSec: 1800,
          proof: undefined,
        }),
      );
      expect(mocks.stopDriverLocationHeartbeat).toHaveBeenCalled();
    });

    // Note: getCompletionSubmitBlocker() only hard-blocks on unavailable proof
    // requirements, an invalid expense amount, or lost tracking. A missing
    // photo or signoff is surfaced as a footer notice and left to the server.
    it("nags but does not hard-block when the required photo count is unmet", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.getOrder.mockResolvedValue(
        order({
          proofRequirements: {
            minPhotoCount: 2,
            signoffRequired: false,
            expenseProofRequired: false,
          },
        }),
      );
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("完單前仍需補上 2 張佐證照片。");
      expect(buttonWithLabel(renderer, "完成行程").props.disabled).toBe(false);
    });

    it("nags but does not hard-block when a required signoff is blank", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.getOrder.mockResolvedValue(
        order({
          proofRequirements: {
            minPhotoCount: 0,
            signoffRequired: true,
            expenseProofRequired: false,
          },
        }),
      );
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("此行程仍缺少簽收識別資料。");
      expect(buttonWithLabel(renderer, "完成行程").props.disabled).toBe(false);
    });

    it("unblocks completion once the signoff is typed and sends it as proof", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.getOrder.mockResolvedValue(
        order({
          proofRequirements: {
            minPhotoCount: 0,
            signoffRequired: true,
            expenseProofRequired: false,
          },
        }),
      );
      const renderer = await renderScreen();

      await act(async () => {
        inputWithPlaceholder(renderer, "乘客簽收或簽收單號").props.onChangeText(
          "SIGN-001",
        );
      });

      expect(texts(renderer)).toContain("簽收需求已完成。");

      await act(async () => {
        buttonWithLabel(renderer, "完成行程").props.onPress();
        await flush();
      });

      expect(mocks.submitDriverTaskCompletion).toHaveBeenCalledWith(
        "task-001",
        expect.objectContaining({
          proof: expect.objectContaining({ signatureId: "SIGN-001" }),
        }),
      );
    });

    it("blocks completion when the order (and its requirements) failed to load", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.getOrder.mockRejectedValue(new Error("404"));
      const renderer = await renderScreen();

      expect(buttonWithLabel(renderer, "完成行程").props.disabled).toBe(true);
      expect(texts(renderer)).toContain(
        "完單前需先載入訂單佐證需求，請重新整理後再送出。",
      );
    });

    it("blocks completion while location tracking is not active", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.syncDriverLocationHeartbeat.mockResolvedValue({
        status: "permission_denied",
        message: "尚未授權定位權限。",
        latestUpdate: null,
      });
      const renderer = await renderScreen();

      expect(buttonWithLabel(renderer, "完成行程").props.disabled).toBe(true);
      expect(texts(renderer)).toContain("尚未授權定位權限。");
    });

    it("offers a tracking retry when the permission was denied mid-trip", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.syncDriverLocationHeartbeat.mockResolvedValue({
        status: "permission_denied",
        message: "尚未授權定位權限。",
        latestUpdate: null,
      });
      const renderer = await renderScreen();

      const before = mocks.syncDriverLocationHeartbeat.mock.calls.length;
      await act(async () => {
        buttonWithLabel(renderer, "重試追蹤").props.onPress();
        await flush();
      });
      expect(mocks.syncDriverLocationHeartbeat.mock.calls.length).toBe(
        before + 1,
      );
    });

    it("rejects a malformed expense amount", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.getOrder.mockResolvedValue(
        order({
          proofRequirements: {
            minPhotoCount: 0,
            signoffRequired: false,
            expenseProofRequired: true,
          },
        }),
      );
      const renderer = await renderScreen();

      await act(async () => {
        inputWithPlaceholder(renderer, "例如 40 或 40.50").props.onChangeText(
          "abc",
        );
      });

      expect(buttonWithLabel(renderer, "完成行程").props.disabled).toBe(true);
      expect(texts(renderer)).toContain(
        "費用金額格式無效，請輸入有效的正數後再完成行程。",
      );
    });

    it("records the tracking gap notice reported by the diagnostic stream", async () => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.subscribeTrackingDiagnostic.mockImplementation(
        (listener: (state: unknown) => void) => {
          listener({ gap: { lastTaskId: "task-001" } });
          return () => {};
        },
      );
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("追蹤中斷：task-001");
    });
  });

  describe("completion proof photos", () => {
    const onTripTask = () =>
      ownedTask({ status: "on_trip", startedAt: "2026-05-08T03:30:00.000Z" });

    beforeEach(() => {
      mocks.listDriverTasks.mockResolvedValue([onTripTask()]);
      mocks.getOrder.mockResolvedValue(
        order({
          proofRequirements: {
            minPhotoCount: 1,
            signoffRequired: false,
            expenseProofRequired: false,
          },
        }),
      );
    });

    it("stops at the permission prompt when the camera is denied", async () => {
      mocks.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "拍照上傳").props.onPress();
        await flush();
      });

      expect(lastAlert()[0]).toBe("需要權限");
      expect(mocks.launchCameraAsync).not.toHaveBeenCalled();
    });

    it("stops at the permission prompt when the library is denied", async () => {
      mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({
        granted: false,
      });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "從相簿選取").props.onPress();
        await flush();
      });

      expect(lastAlert()[1]).toContain("相簿權限");
      expect(mocks.launchImageLibraryAsync).not.toHaveBeenCalled();
    });

    it("adds a captured photo and clears the outstanding-photo notice", async () => {
      mocks.launchCameraAsync.mockResolvedValue({
        canceled: false,
        assets: [{ base64: "aGVsbG8=", fileName: "a.jpg" }],
      });
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("完單前仍需補上 1 張佐證照片。");

      await act(async () => {
        buttonWithLabel(renderer, "拍照上傳").props.onPress();
        await flush();
      });

      expect(texts(renderer)).not.toContain("完單前仍需補上 1 張佐證照片。");
      expect(buttonWithLabel(renderer, "移除")).toBeDefined();
    });

    it("removes an added photo again", async () => {
      mocks.launchCameraAsync.mockResolvedValue({
        canceled: false,
        assets: [{ base64: "aGVsbG8=", fileName: "a.jpg" }],
      });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "拍照上傳").props.onPress();
        await flush();
      });
      await act(async () => {
        buttonWithLabel(renderer, "移除").props.onPress();
      });

      expect(buttonWithLabel(renderer, "移除")).toBeUndefined();
      expect(texts(renderer)).toContain("完單前仍需補上 1 張佐證照片。");
    });

    it("does nothing when the picker is cancelled", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "拍照上傳").props.onPress();
        await flush();
      });
      expect(buttonWithLabel(renderer, "移除")).toBeUndefined();
      expect(texts(renderer)).toContain("完單前仍需補上 1 張佐證照片。");
    });

    it("sends the collected photo in the completion proof bundle", async () => {
      mocks.launchCameraAsync.mockResolvedValue({
        canceled: false,
        assets: [{ base64: "aGVsbG8=", fileName: "a.jpg" }],
      });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "拍照上傳").props.onPress();
        await flush();
      });
      await act(async () => {
        buttonWithLabel(renderer, "完成行程").props.onPress();
        await flush();
      });

      expect(mocks.submitDriverTaskCompletion).toHaveBeenCalledWith(
        "task-001",
        expect.objectContaining({
          proof: expect.objectContaining({ photos: ["aGVsbG8="] }),
        }),
      );
    });
  });

  describe("forwarded relay", () => {
    it("offers accept and reject for an offered forwarded task", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      const renderer = await renderScreen();

      expect(buttonWithLabel(renderer, "接受平台訂單")).toBeDefined();
      expect(buttonWithLabel(renderer, "婉拒平台訂單")).toBeDefined();
    });

    it("relays the accept and announces the platform outcome", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      expect(mocks.acceptForwardedDriverOffer).toHaveBeenCalledWith("task-fwd");
      expect(lastAlert()[1]).toBe("已送出");
    });

    it("relays the reject with the documented reason code", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "婉拒平台訂單").props.onPress();
        await flush();
      });

      expect(mocks.rejectForwardedDriverOffer).toHaveBeenCalledWith(
        "task-fwd",
        "driver_declined_forwarded_offer",
      );
    });

    it("locks both relay actions while the source platform is offline", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [{ platformCode: "grab", status: "offline" }],
      });
      const renderer = await renderScreen();

      expect(buttonWithLabel(renderer, "接受平台訂單").props.disabled).toBe(
        true,
      );
      expect(texts(renderer)).toContain(
        "來源平台目前離線，無法轉送接單要求。",
      );

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });
      expect(mocks.acceptForwardedDriverOffer).not.toHaveBeenCalled();
    });

    it("disables the accept when the platform view forbids it", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        {
          taskId: "task-fwd",
          allowedActions: ["reject"],
          driverActionState: "action_required",
          localStatus: "offered",
          blockingReason: "平台尚未開放接單",
          syncIssueSummary: null,
        },
      ]);
      const renderer = await renderScreen();

      expect(buttonWithLabel(renderer, "接受平台訂單").props.disabled).toBe(
        true,
      );
      expect(texts(renderer)).toContain("平台尚未開放接單");
    });

    it("relabels the secondary action when the platform forbids reject", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        {
          taskId: "task-fwd",
          allowedActions: ["accept"],
          driverActionState: "action_required",
          localStatus: "offered",
          blockingReason: null,
          syncIssueSummary: null,
        },
      ]);
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [{ platformCode: "grab", status: "offline" }],
      });
      const renderer = await renderScreen();

      const secondary = buttonWithLabel(renderer, "平台不支援婉拒");
      expect(secondary).toBeDefined();
      expect(secondary.props.disabled).toBe(true);
    });

    it("reports a relay failure as an error alert", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockRejectedValue(
        new Error("平台回應逾時"),
      );
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      expect(lastAlert()).toEqual(["錯誤", "平台回應逾時"]);
    });

    it("never starts the location heartbeat for a forwarded trip", async () => {
      mocks.listDriverTasks.mockResolvedValue([
        forwardedTask({ status: "on_trip" }),
      ]);
      const renderer = await renderScreen();

      expect(mocks.syncDriverLocationHeartbeat).not.toHaveBeenCalled();
      expect(texts(renderer)).toContain("追蹤 · 未啟用");
      // Tracking never gates a forwarded completion, so the action stays live.
      expect(buttonWithLabel(renderer, "完成行程").props.disabled).toBe(false);
    });
  });

  describe("offline completion queue", () => {
    it("tells the driver a queued completion will resend", async () => {
      mocks.listDriverTasks.mockResolvedValue([
        ownedTask({ status: "on_trip", startedAt: "2026-05-08T03:30:00.000Z" }),
      ]);
      mocks.getPendingDriverTaskCompletion.mockResolvedValue({
        taskId: "task-001",
        updatedAt: "2026-05-08T03:55:00.000Z",
      });
      const renderer = await renderScreen();

      const bodies = renderer.root
        .findAll((node: any) => node.type === "Banner")
        .map((node: any) => node.props.body)
        .filter((value: unknown) => typeof value === "string");
      expect(
        bodies.some((value: string) => value.includes("完單資料已暫存佇列")),
      ).toBe(true);
    });
  });

  describe("header actions", () => {
    it("refreshes the trip", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      const renderer = await renderScreen();
      const before = mocks.listDriverTasks.mock.calls.length;

      await act(async () => {
        buttonWithLabel(renderer, "重新整理").props.onPress();
        await flush();
      });
      expect(mocks.listDriverTasks.mock.calls.length).toBe(before + 1);
    });

    // The safety request screen is the only entry point and it already
    // requires a deliberate 2-second hold, so a confirmation dialog in front
    // of it only costs time in an emergency.
    it("opens the safety request screen directly, with no dialog in the way", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      const renderer = await renderScreen();
      const alertsBefore = mocks.alert.mock.calls.length;

      await act(async () => {
        buttonWithLabel(renderer, "SOS").props.onPress();
      });

      expect(mocks.push).toHaveBeenCalledWith("/sos");
      expect(mocks.alert.mock.calls.length).toBe(alertsBefore);
    });
  });

  describe("route summary", () => {
    it("shows the order addresses and fare", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).toContain("台北車站");
      expect(rendered).toContain("台北 101");
      expect(rendered.some((value) => value.includes("250"))).toBe(true);
    });

    it("falls back to placeholders when the order is unavailable", async () => {
      mocks.listDriverTasks.mockResolvedValue([
        ownedTask({ orderId: null as never }),
      ]);
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).toContain("待確認上車點");
      expect(rendered).toContain("待確認下車點");
      expect(rendered).toContain("金額待確認");
    });
  });

  describe("developer copy guard", () => {
    it("keeps the loading state free of developer jargon", async () => {
      mocks.listDriverTasks.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(TripScreen));
      });
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the no-trip empty state free of developer jargon", async () => {
      const renderer = await renderScreen();
      // Also proves the collector really reaches the screen's copy.
      expect(renderedCopy(renderer)).toContain("目前沒有進行中的行程");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the load-failure state free of developer jargon", async () => {
      mocks.listDriverTasks.mockRejectedValue(new Error("連線逾時，請稍後再試"));
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps an owned trip free of developer jargon", async () => {
      mocks.listDriverTasks.mockResolvedValue([
        ownedTask({ status: "on_trip" }),
      ]);
      const renderer = await renderScreen();
      expect(renderedCopy(renderer)).toContain("行程作業台");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps an offered platform order free of developer jargon", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the offline source-platform lock free of developer jargon", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.getPlatformPresence.mockResolvedValue({
        presences: [{ platformCode: "grab", status: "offline" }],
      });
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps every platform-relayed trip state free of developer jargon", async () => {
      // Drives getTripExperienceState through each branch, so every authority
      // banner, lock card and idle footer label gets rendered at least once.
      const nativeStatuses = [
        "offered",
        "accept_pending",
        "confirmed_by_platform",
        "completed_synced",
        "lost_race",
        "cancelled_by_platform",
        "sync_failed",
      ];

      for (const nativeStatus of nativeStatuses) {
        mocks.listDriverTasks.mockResolvedValue([
          forwardedTask({ nativeStatus } as never),
        ]);
        const renderer = await renderScreen();
        expect(renderedCopy(renderer).length).toBeGreaterThan(0);
        expect(developerTermsIn(renderer)).toEqual([]);
      }
    });

    it("keeps a relayed accept result free of developer jargon", async () => {
      mocks.listDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockResolvedValue({
        outcome: "sync_failed",
        action: "accept",
        driverMessage: null,
        managementCorrelationIds: null,
      });
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("gives the SOS entry a spoken name and still opens the safety screen", async () => {
      mocks.listDriverTasks.mockResolvedValue([ownedTask()]);
      const renderer = await renderScreen();
      const sos = buttonWithLabel(renderer, "SOS");

      expect(sos.props.accessibilityLabel).toBe("開啟安全求援");
      await act(async () => {
        sos.props.onPress();
      });
      expect(mocks.push).toHaveBeenCalledWith("/sos");
    });
  });
});
