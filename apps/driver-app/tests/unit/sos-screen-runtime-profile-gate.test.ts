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
  submitDriverSosEvent: vi.fn(),
  getSosEvent: vi.fn(),
  secureGetItem: vi.fn(),
  appStateHandlers: [] as Array<(state: string) => void>,
}));

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  AppState: {
    addEventListener: (_type: string, handler: (state: string) => void) => {
      mocks.appStateHandlers.push(handler);
      return {
        remove: () => {
          const index = mocks.appStateHandlers.indexOf(handler);
          if (index >= 0) mocks.appStateHandlers.splice(index, 1);
        },
      };
    },
  },
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
  getItemAsync: (...args: unknown[]) => mocks.secureGetItem(...args),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

// The canvas primitives are stubbed as host elements so the rendered tree keeps
// its labels/values inspectable. The theme is a flat token stub rather than the
// real module: canvas-primitives pulls in @drts/ui-web/canvas-tokens, which is
// not aliased for this app's vitest resolver. The screen only reads scalar
// colour/font tokens off THEME at module scope, so a flat object is sufficient
// — this test asserts on copy and row structure, never on rendered colour.
// Element-valued slots (Card/PageHeader `actions`, Shell `footer`) are rendered
// as extra children so the SOS hold button and status pills are in the tree.
vi.mock("@/components/canvas-primitives", () => {
  type StubProps = Record<string, unknown> & {
    children?: React.ReactNode;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
  };
  const stub = (name: string) => (props: StubProps) =>
    React.createElement(
      name,
      props,
      props.children,
      ...[props.actions, props.footer].filter((slot) => slot != null),
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
    submitDriverSosEvent: mocks.submitDriverSosEvent,
    get: mocks.getSosEvent,
  }),
  formatDriverError: (_error: unknown, fallback: string) => fallback,
  isDriverIdentityProvisioned: vi.fn().mockReturnValue(true),
  registerProtectedCacheClearHandler: vi.fn().mockReturnValue(() => {}),
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
    (node: any) => node.type === "Card" && node.props.title === "當前訂單情境",
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
    mocks.secureGetItem.mockReset().mockResolvedValue(null);
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

    expect(labels).toEqual(["行程編號", "任務編號", "目前狀態", "目前位置"]);
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

// DRIVER-SOS-CLEANUP-20261126: the owner read this screen on a phone during a
// test and saw developer wording: "outbox", "driver-sos 服務", "timeline", the
// on-duty staff principal id, an invented "image/jpeg" MIME type, retry
// counters, and the same status repeated three times. These render the real
// screen and check what reaches the tree.
const DEVELOPER_COPY = [
  "outbox",
  "driver-sos",
  "timeline",
  "driver safety",
  "slide",
  "清除此 case",
  "image/jpeg",
  "ops-duty-01",
  "INC-000042",
  "尚無更新",
  "下次重試",
  "嘗試次數",
  "離線觸發",
  "避免只靠顏色",
  "不會併入一般事故",
  "同一附件驗證",
  "目前狀態：",
  "狀態 · ",
];

function developerCopyIn(strings: string[]): string[] {
  return strings.filter((text) =>
    DEVELOPER_COPY.some((term) =>
      text.toLowerCase().includes(term.toLowerCase()),
    ),
  );
}

const STORED_CASE_TRIGGERED_AT = "2026-11-26T01:05:00.000Z";

function storedAcknowledgedCase() {
  return {
    clientEventId: "client-event-cleanup-1",
    incidentId: "INC-000042",
    eventNo: "SOS-20261126010500-AB12CD",
    eventType: "security_incident",
    situation: "passenger_conflict",
    severity: "major",
    description: "事件情況：乘客衝突",
    attachments: [
      {
        id: "sos-attachment-1",
        uri: "file:///photo-1.jpg",
        fileName: "photo-1.jpg",
        mimeType: null,
        fileSize: 1024,
        addedAt: STORED_CASE_TRIGGERED_AT,
        uploadState: "failed_retryable",
        serverAttachmentId: null,
        scanStatus: null,
        lastError: "Attachment upload failed.",
      },
    ],
    originalTriggeredAt: STORED_CASE_TRIGGERED_AT,
    offlineAtTrigger: true,
    location: null,
    orderId: null,
    taskId: null,
    syncState: "submitted",
    attemptCount: 3,
    nextAttemptAt: "2026-11-26T01:35:00.000Z",
    lastError: null,
    receipt: {
      sosEventId: "sos-event-cleanup-1",
      incidentId: "INC-000042",
      clientEventId: "client-event-cleanup-1",
      eventNo: "SOS-20261126010500-AB12CD",
      duplicate: false,
      serverReceivedAt: STORED_CASE_TRIGGERED_AT,
      fleetReportConfirmedAt: STORED_CASE_TRIGGERED_AT,
    },
    supplements: [],
    dialRecords: [],
    falseAlarm: {
      dismissed: true,
      dismissedAt: "2026-11-26T01:10:00.000Z",
      note: null,
    },
    dutyAcknowledgement: {
      acknowledgedAt: STORED_CASE_TRIGGERED_AT,
      acknowledgedByActorId: "ops-duty-01",
    },
    status: "acknowledged",
    timeline: [],
  };
}

/**
 * Strings on host elements only (what the stubs actually render), so a raw
 * value carried in a composite component's props (for example an attachment's
 * stored lastError) is not mistaken for rendered copy.
 */
function hostStrings(renderer: any): string[] {
  const out: string[] = [];
  const hosts = renderer.root.findAll(
    (node: any) => typeof node.type === "string",
  );
  for (const node of hosts) {
    for (const [key, value] of Object.entries(node.props ?? {})) {
      if (key !== "children" && typeof value === "string") out.push(value);
    }
    if (node.type === "DL") {
      for (const item of node.props.items ?? []) {
        out.push(item.label, item.value);
      }
    }
    for (const child of node.children ?? []) {
      if (typeof child === "string") out.push(child);
    }
  }
  return out;
}

function findHoldButton(renderer: any) {
  return renderer.root.find(
    (node: any) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel === "長按確認求援",
  );
}

function bannerBodies(renderer: any): string[] {
  return renderer.root
    .findAll((node: any) => node.type === "Banner")
    .map((node: any) => node.props.body);
}

describe("SOS screen · driver-facing copy", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE;
    mocks.secureGetItem.mockReset().mockResolvedValue(null);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.submitDriverSosEvent.mockReset();
    mocks.getSosEvent.mockReset().mockRejectedValue(new Error("offline"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("shows a plain empty context and a single connection status before an SOS exists", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const renderer = await renderSosScreen();
    const strings = hostStrings(renderer);

    expect(strings).toContain("目前沒有進行中的行程，仍可直接送出 SOS。");
    expect(strings).toContain("請選擇目前狀況");
    expect(developerCopyIn(strings)).toEqual([]);
    // The chip label used to be repeated as the prefix of its own detail line
    // ("連線正常 · 可直接送達…") and again in a card subtitle ("目前狀態：…").
    expect(strings).toContain("連線正常");
    expect(strings).toContain("SOS 會直接送到車隊值班人員。");
    expect(
      strings.filter(
        (text) => text.includes("連線正常") && text !== "連線正常",
      ),
    ).toEqual([]);

    act(() => renderer.unmount());
  });

  it("keeps sending and failure notices free of service names and outbox wording", async () => {
    let rejectSubmit: (error: Error) => void = () => {};
    mocks.submitDriverSosEvent.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSubmit = reject;
      }),
    );

    const renderer = await renderSosScreen();

    await act(async () => {
      findHoldButton(renderer).props.onLongPress();
      await flushEffects();
    });

    // The send path itself is unchanged: one submit, idempotency-keyed.
    expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);
    const [, options] = mocks.submitDriverSosEvent.mock.calls[0];
    expect(options.headers["Idempotency-Key"]).toEqual(expect.any(String));
    expect(bannerBodies(renderer)).toContain("正在送出 SOS…");
    expect(developerCopyIn(hostStrings(renderer))).toEqual([]);

    await act(async () => {
      rejectSubmit(new Error("network down"));
      await flushEffects();
    });

    expect(bannerBodies(renderer)).toContain(
      "SOS 還沒送到，已存在手機，連線後會自動再送。",
    );
    const strings = hostStrings(renderer);
    expect(developerCopyIn(strings)).toEqual([]);
    // The failed case is still stored locally and offered for a resend.
    const retry = renderer.root.find(
      (node: any) => node.type === "Btn" && node.props.children === "重新送出",
    );
    expect(retry).toBeTruthy();

    act(() => renderer.unmount());
  });

  it("shows an acknowledged SOS without staff ids, retry counters or invented file types, in Taiwan time", async () => {
    // Prove the time does not depend on the phone's own time zone.
    process.env.TZ = "America/Los_Angeles";
    mocks.secureGetItem.mockResolvedValue(
      JSON.stringify(storedAcknowledgedCase()),
    );

    const renderer = await renderSosScreen();
    const strings = hostStrings(renderer);

    expect(strings).toContain("值班人員已收到");
    expect(strings).toContain("清除這筆紀錄");
    expect(strings).toContain("目前還沒有進度。");
    expect(strings).toContain("SOS-20261126010500-AB12CD");
    expect(developerCopyIn(strings)).toEqual([]);
    expect(
      strings.some((text) => text.includes("Attachment upload failed")),
    ).toBe(false);

    const caseCard = renderer.root.find(
      (node: any) => node.type === "Card" && node.props.title === "本次 SOS",
    );
    expect(caseCard.props.subtitle).toBeUndefined();
    expect(
      caseCard.findByType("DL").props.items.map((row: any) => row.label),
    ).toEqual(["觸發時間", "任務編號", "行程編號"]);

    // 01:05 UTC is 09:05 in Taiwan.
    const triggeredAt = caseCard
      .findByType("DL")
      .props.items.find((row: any) => row.label === "觸發時間").value;
    expect(triggeredAt).toContain("09:05");
    expect(strings.filter((text) => text.includes("01:05"))).toEqual([]);
    expect(strings.filter((text) => text.includes("09:05")).length).toBe(2);

    act(() => renderer.unmount());
  });
});

// DRIVER-SOS-CLEANUP-20261126, send-path fixes. Before this change:
// - the phone app (React Native) has no navigator.onLine, so connectivity
//   stayed "unknown" forever and auto-resend, 重新送出 and supplement sends
//   were all disabled: a failed SOS on the phone was never sent again;
// - where the browser did report online, a failed send was re-sent
//   immediately on every state change, ignoring the case's nextAttemptAt.
const SEND_NOW = new Date("2026-11-26T01:00:00.000Z");
const RETRY_BACKOFF_MS = 60_000; // first backoff step in driver-sos-outbox

/** Enough microtask turns for one full send/fail cycle to settle. */
async function settle() {
  for (let turn = 0; turn < 30; turn += 1) {
    await Promise.resolve();
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  });
}

/** React Native: a global `window` with no event methods, no onLine flag. */
function useNativeConnectivity() {
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", {});
}

/** Web build: navigator.onLine plus online/offline events on window. */
function useWebConnectivity(onLine: boolean) {
  const target = new EventTarget();
  vi.stubGlobal("navigator", { onLine });
  vi.stubGlobal("window", target);
  return target;
}

function findResendButton(renderer: any) {
  return renderer.root.find(
    (node: any) => node.type === "Btn" && node.props.children === "重新送出",
  );
}

async function pressHoldToSend(renderer: any) {
  await act(async () => {
    findHoldButton(renderer).props.onLongPress();
    await settle();
  });
}

function storedUnsentCase(overrides: Record<string, unknown>) {
  return {
    ...storedAcknowledgedCase(),
    attachments: [],
    receipt: null,
    incidentId: null,
    eventNo: null,
    status: null,
    falseAlarm: { dismissed: false, dismissedAt: null, note: null },
    dutyAcknowledgement: { acknowledgedAt: null, acknowledgedByActorId: null },
    ...overrides,
  };
}

describe("SOS screen · resend safety", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: SEND_NOW,
    });
    delete process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE;
    mocks.appStateHandlers.length = 0;
    mocks.secureGetItem.mockReset().mockResolvedValue(null);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getSosEvent.mockReset().mockRejectedValue(new Error("offline"));
    mocks.submitDriverSosEvent
      .mockReset()
      .mockRejectedValue(new Error("network down"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("on the phone (no online flag) retries a failed SOS once its backoff is due, and 重新送出 works", async () => {
    useNativeConnectivity();
    const renderer = await renderSosScreen();
    try {
      await pressHoldToSend(renderer);

      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);
      expect(findResendButton(renderer).props.disabled).toBe(false);

      await advance(RETRY_BACKOFF_MS - 1_000);
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);

      await advance(1_000);
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(2);

      // The same event is re-sent, so the server can dedupe it.
      const keys = mocks.submitDriverSosEvent.mock.calls.map(
        ([, options]) => options.headers["Idempotency-Key"],
      );
      expect(new Set(keys).size).toBe(1);

      // 重新送出 sends straight away, without waiting for the backoff.
      await act(async () => {
        findResendButton(renderer).props.onPress();
        await settle();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(3);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("where the browser reports online, a failed send is not repeated before nextAttemptAt", async () => {
    useWebConnectivity(true);
    const renderer = await renderSosScreen();
    try {
      await pressHoldToSend(renderer);
      await act(async () => {
        await settle();
      });

      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);

      await advance(RETRY_BACKOFF_MS - 1_000);
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);

      await advance(1_000);
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(2);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("where the browser reports offline, nothing is sent and 重新送出 is disabled until it is back online", async () => {
    const browser = useWebConnectivity(false);
    const renderer = await renderSosScreen();
    try {
      await pressHoldToSend(renderer);

      expect(mocks.submitDriverSosEvent).not.toHaveBeenCalled();
      expect(findResendButton(renderer).props.disabled).toBe(true);

      await act(async () => {
        browser.dispatchEvent(new Event("online"));
        await settle();
      });
      // Back online: the stored SOS goes out once; the failure then waits
      // for its backoff instead of looping.
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);
      await advance(RETRY_BACKOFF_MS - 1_000);
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("returning to the foreground sends a resend that came due while the app was in the background", async () => {
    useNativeConnectivity();
    mocks.secureGetItem.mockResolvedValue(
      JSON.stringify(
        storedUnsentCase({
          syncState: "failed_retryable",
          attemptCount: 1,
          nextAttemptAt: new Date(
            SEND_NOW.getTime() + RETRY_BACKOFF_MS,
          ).toISOString(),
        }),
      ),
    );
    const renderer = await renderSosScreen();
    try {
      await act(async () => {
        await settle();
      });
      expect(mocks.submitDriverSosEvent).not.toHaveBeenCalled();

      // Background: the clock moves past nextAttemptAt but JS timers do not
      // run, as on a suspended phone app.
      vi.setSystemTime(SEND_NOW.getTime() + RETRY_BACKOFF_MS + 5_000);
      expect(mocks.submitDriverSosEvent).not.toHaveBeenCalled();

      expect(mocks.appStateHandlers.length).toBeGreaterThan(0);
      await act(async () => {
        mocks.appStateHandlers.forEach((handler) => handler("active"));
        await settle();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("re-sends an SOS that was stored mid-send when the app was closed", async () => {
    useNativeConnectivity();
    mocks.secureGetItem.mockResolvedValue(
      JSON.stringify(
        storedUnsentCase({
          syncState: "sending",
          attemptCount: 0,
          nextAttemptAt: SEND_NOW.toISOString(),
        }),
      ),
    );
    const renderer = await renderSosScreen();
    try {
      await act(async () => {
        await settle();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);
      expect(
        mocks.submitDriverSosEvent.mock.calls[0][1].headers["Idempotency-Key"],
      ).toBe("client-event-cleanup-1");
    } finally {
      act(() => renderer.unmount());
    }
  });
});
