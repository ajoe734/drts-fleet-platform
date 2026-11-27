import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).__DEV__ = true;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * DRIVER-HOME-CLEANUP-20261126: the home tab (工作台) showed raw action codes,
 * English labels, task and driver IDs, rows of zero counts and repeated
 * buttons, and 開啟 on a plain announcement opened the SOS screen. These
 * tests mount the real screen and notice banner with mocked primitives and
 * a mocked API client, and check what a driver would actually see.
 */

const state = vi.hoisted(() => ({
  push: vi.fn(),
  tasks: [] as unknown[],
  tasksError: null as Error | null,
  presence: {
    driverId: "drv-test-001",
    presences: [],
    adapterStatuses: [],
  } as {
    driverId: string;
    presences: unknown[];
    adapterStatuses: unknown[];
  },
  shiftEnabled: true,
  shifts: [] as unknown[],
  notifications: [] as unknown[],
  notices: [] as unknown[],
  noticesError: null as Error | null,
  post: vi.fn(),
  clearHandlers: new Set<() => void>(),
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  View: "View",
}));

vi.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => React.createElement("Redirect", props),
  useFocusEffect: (callback: () => void) =>
    React.useEffect(callback, [callback]),
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
}));

vi.mock("@/components/canvas-primitives", () => {
  const comp =
    (name: string) =>
    (props: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(name, props, props.children);
  return {
    Banner: (props: Record<string, React.ReactNode>) =>
      React.createElement(
        "Banner",
        null,
        props.title,
        " ",
        props.body,
        props.actions,
      ),
    Btn: comp("Btn"),
    Card: comp("Card"),
    KPI: (props: Record<string, React.ReactNode>) =>
      React.createElement(
        "KPI",
        null,
        props.label,
        " ",
        props.value,
        " ",
        props.sub,
      ),
    PageHeader: (props: Record<string, React.ReactNode>) =>
      React.createElement(
        "PageHeader",
        null,
        props.title,
        props.subtitle,
        props.actions,
      ),
    Pill: comp("Pill"),
    Shell: comp("Shell"),
    driverCanvasTheme: new Proxy({}, { get: () => "#000" }),
  };
});

vi.mock("@/lib/api-client", () => {
  const client = {
    listUnifiedDriverTasks: vi.fn(async () => {
      if (state.tasksError) throw state.tasksError;
      return state.tasks;
    }),
    listDriverTasks: vi.fn(async () => {
      if (state.tasksError) throw state.tasksError;
      return [];
    }),
    getPlatformPresence: vi.fn(async () => state.presence),
    isFeatureEnabled: vi.fn(async () => state.shiftEnabled),
    listShifts: vi.fn(async () => state.shifts),
    getDriverTaskOrder: vi.fn(async () => {
      throw new Error("no order fixture");
    }),
    getOrder: vi.fn(async () => {
      throw new Error("no order fixture");
    }),
    getList: vi.fn(async (path: string) => {
      if (path === "/api/driver/platform-notices/notifications") {
        return state.notifications;
      }
      if (path === "/api/driver/platform-notices") {
        if (state.noticesError) throw state.noticesError;
        return state.notices;
      }
      throw new Error(`unexpected list ${path}`);
    }),
    post: state.post,
  };
  return {
    getDriverClient: () => client,
    getDriverId: () => "drv-test-001",
    initializeDriverIdentity: vi.fn(async () => {}),
    isDriverIdentityProvisioned: () => true,
    registerProtectedCacheClearHandler: (fn: () => void) => {
      state.clearHandlers.add(fn);
      return () => state.clearHandlers.delete(fn);
    },
    // Like the real helper, pass a plain error message through and fall back
    // only for "API error ..." text.
    formatDriverError: (error: unknown, fallback: string) =>
      error instanceof Error && !error.message.startsWith("API error ")
        ? error.message
        : fallback,
  };
});

import WorkspaceIndex from "../../app/index";
import { PlatformNoticeBanner } from "../../components/platform-notice-banner";

// react-test-renderer ships no usable types here; other driver-app screen
// tests use `any` for the renderer and its nodes too.
let renderer: any = null;

function collectText(node: any): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(collectText).join("");
  return collectText(node.children ?? []);
}

function screenText() {
  return collectText(renderer!.toJSON());
}

function buttons(label: string) {
  return renderer!.root
    .findAllByType("Btn" as never)
    .filter((node: any) => node.props.children === label);
}

function pressableAround(pattern: RegExp) {
  const label = renderer!.root
    .findAllByType("Text" as never)
    .find((node: any) => pattern.test(collectText(node.props.children)));
  let current = label?.parent ?? null;
  while (current && current.type !== "Pressable") {
    current = current.parent;
  }
  return current;
}

// Text of the card that contains a Text node matching the pattern.
function cardTextAround(pattern: RegExp) {
  const label = renderer!.root
    .findAllByType("Text" as never)
    .find((node: any) => pattern.test(collectText(node.props.children)));
  let current = label?.parent ?? null;
  while (current && current.type !== "Card") {
    current = current.parent;
  }
  return current ? collectText(current.children) : "";
}

async function openInbox() {
  const inboxToggle = pressableAround(/則待讀通知|通知已清空/);
  expect(inboxToggle).toBeTruthy();
  await act(async () => inboxToggle!.props.onPress());
}

function bellHasDot() {
  const bell = renderer!.root
    .findAllByType("Pressable" as never)
    .find((node: any) =>
      node
        .findAllByType("Ionicons" as never)
        .some((icon: any) => icon.props.name === "notifications-outline"),
    );
  expect(bell).toBeTruthy();
  return bell!.findAllByType("View" as never).length > 0;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) {
      await Promise.resolve();
    }
  });
}

async function mount(element: React.ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
  await flush();
}

function task(overrides: Record<string, unknown>) {
  return {
    taskId: "task-x",
    orderId: "order-x",
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    externalOrderId: null,
    nativeStatus: null,
    localStatus: "assigned",
    driverActionState: "action_required",
    allowedActions: ["accept", "reject"],
    routeLocked: false,
    fareAuthority: "drts",
    settlementAuthority: "drts",
    driverPayoutAuthority: "drts",
    requiresManualFallback: false,
    requiresReauth: false,
    syncIssueSummary: null,
    blockingReason: null,
    pickupSummary: null,
    dropoffSummary: null,
    deadlineAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function presence(overrides: Record<string, unknown>) {
  return {
    driverId: "drv-test-001",
    platformCode: "uber",
    accountId: null,
    status: "online",
    eligibility: "eligible",
    tokenExpiresAt: null,
    reauthRequired: false,
    lastOnlineAt: new Date().toISOString(),
    lastOfflineAt: null,
    lastHeartbeatAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function notification(id: string, title: string, message: string) {
  return {
    notificationId: id,
    channel: "ops_notice",
    title,
    message,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
}

const activeShift = {
  shiftId: "shift-1",
  driverId: "drv-test-001",
  status: "active",
  clockedInAt: new Date().toISOString(),
  totalHours: null,
};

beforeEach(() => {
  state.push.mockReset();
  state.post.mockReset();
  state.tasks = [];
  state.tasksError = null;
  state.presence = {
    driverId: "drv-test-001",
    presences: [],
    adapterStatuses: [],
  };
  state.shiftEnabled = true;
  state.shifts = [];
  state.notifications = [];
  state.notices = [];
  state.noticesError = null;
  state.clearHandlers.clear();
});

afterEach(async () => {
  if (renderer) {
    const current = renderer;
    renderer = null;
    await act(async () => current.unmount());
  }
});

describe("driver home: no raw codes, English or IDs", () => {
  it("shows Chinese copy only when there are no tasks and nothing is bound", async () => {
    await mount(React.createElement(WorkspaceIndex));
    const text = screenText();

    // Item 1, 2: no raw action pill and no English eyebrow / reason pill.
    for (const leak of [
      "availableAction",
      "Setup required",
      "Quiet lane",
      "not_provisioned",
      "manage_platform_binding",
      "start_shift",
      // Item 4: shortcut tiles printed raw action codes.
      "open_jobs",
      "open_trip",
      "open_earnings",
      "沒有進行中的行程時會顯示空態",
      // Item 5: the raw driver ID next to 尚未上班.
      "drv-test-001",
      // Item 7, 14: English and developer wording.
      "Online",
      "Urgent",
      "不只是入口頁",
      "即時",
      "快取",
      "靜態資料",
      // Item 9, 10: removed sections.
      "立即可做",
      "工作台當前可執行動作",
      "跨平台訊息處理方式",
      "目前沒有需要另外開啟的外部連結",
      "工作台入口與深連結",
      // Drivers cannot bind platforms or switch them online in the app any
      // more (PR #3451); nothing may tell them to.
      "請先完成平台綁定",
      "平台綁定與授權",
      "前往平台連線",
      "保持平台在線",
      "維持平台在線",
      // Nothing writes a platform binding, so no one may promise one.
      "車隊幫您綁定",
      "由車隊幫您",
    ]) {
      expect(text).not.toContain(leak);
    }

    expect(text).toContain("尚未綁定外部平台");
    expect(text).toContain(
      "目前無法在 App 內綁定外部平台。車隊派單不用綁定，上班打卡後就能接單。",
    );
    // The card has nothing to do in the app, so it offers no button.
    expect(buttons("管理平台")).toHaveLength(0);
    expect(text).toContain("捷徑");
    expect(text).toContain("目前沒有行程");
    expect(text).toMatch(/更新於 \d{2}:\d{2}/);
  });

  it("never shows a task ID in the top card or the trip card", async () => {
    state.tasks = [
      task({ taskId: "task-secret-123", orderId: "order-secret-123" }),
      task({
        taskId: "task-trip-456",
        orderId: "order-trip-456",
        driverActionState: "in_progress",
        localStatus: "accepted",
        allowedActions: ["depart"],
        pickupSummary: "台北車站",
        dropoffSummary: "松山機場",
      }),
    ];
    await mount(React.createElement(WorkspaceIndex));
    const text = screenText();

    expect(text).not.toContain("task-secret-123");
    expect(text).not.toContain("task-trip-456");
    expect(text).toContain("新任務");
    // The trip card (not the shortcut tile) names the trip by its address.
    const tripCard = cardTextAround(/^目前行程$/);
    expect(tripCard).toContain("松山機場");
    expect(tripCard).not.toContain("task-trip-456");
  });
});

describe("driver home: no raw error text or platform codes", () => {
  it("shows a fixed sentence when tasks cannot be loaded", async () => {
    state.tasksError = new TypeError("Network request failed");
    await mount(React.createElement(WorkspaceIndex));
    const text = screenText();

    expect(text).toContain("資料讀取失敗");
    expect(text).toContain("讀取失敗，請檢查網路後重新整理。");
    expect(text).not.toContain("Network");
  });

  it("names an unknown platform 外部平台 instead of its code, and says 更新於", async () => {
    state.shifts = [activeShift];
    state.presence = {
      driverId: "drv-test-001",
      presences: [
        presence({
          platformCode: "mystery-platform",
          status: "offline",
          reauthRequired: true,
        }),
      ],
      adapterStatuses: [],
    };
    await mount(React.createElement(WorkspaceIndex));
    const text = screenText();

    expect(text).toContain("先恢復 外部平台 授權");
    expect(text).not.toContain("mystery-platform");
    expect(text).not.toContain("最後同步");
  });

  it("names the source platform in the top card for an external trip", async () => {
    state.shifts = [activeShift];
    state.tasks = [
      task({
        taskId: "task-uber-1",
        orderId: "order-uber-1",
        orderDomain: "forwarded",
        sourcePlatform: "uber",
        platformDisplayName: "Uber",
        driverActionState: "in_progress",
        localStatus: "confirmed_by_platform",
        allowedActions: [],
        pickupSummary: "台北車站",
        dropoffSummary: "松山機場",
      }),
    ];
    await mount(React.createElement(WorkspaceIndex));

    // The top card is the trip, so the separate trip card is hidden and the
    // top card must carry the platform name.
    expect(cardTextAround(/^目前行程$/)).toBe("");
    expect(screenText()).toMatch(/Uber · 車資待確認 · 更新於/);
  });
});

describe("driver home: rows of zeros", () => {
  it("drops the zero KPI row, readiness strip, zero pills and the bottom summary card", async () => {
    await mount(React.createElement(WorkspaceIndex));
    const text = screenText();

    expect(renderer!.root.findAllByType("KPI" as never)).toHaveLength(0);
    for (const zero of [
      "待處理",
      "今日淨收",
      "整備狀態",
      "裝置 / 身份 / 平台整備狀態",
      "上線 0",
      "重新授權 0",
      "降級",
      "連線不穩 0",
      "待平台確認 0",
      "平台資格與工作台摘要",
      "不符合資格 0",
      "同步異常 0",
    ]) {
      expect(text).not.toContain(zero);
    }
  });

  it("shows a platform pill only for a count above zero and calls degraded 連線不穩", async () => {
    state.shifts = [activeShift];
    state.presence = {
      driverId: "drv-test-001",
      presences: [
        presence({ platformCode: "uber" }),
        presence({
          platformCode: "grab",
          status: "offline",
          reauthRequired: true,
        }),
      ],
      adapterStatuses: [
        {
          platformCode: "uber",
          status: "degraded",
          blockingReason: "adapter heartbeat timeout",
          lastSyncAt: null,
        },
      ],
    };
    await mount(React.createElement(WorkspaceIndex));
    const pills: string[] = renderer!.root
      .findAllByType("Pill" as never)
      .map((node: any) => collectText(node.props.children));

    expect(pills).toContain("重新授權 1");
    expect(pills).toContain("連線不穩 1");
    expect(pills.some((label) => label.startsWith("待平台確認"))).toBe(false);
    const text = screenText();
    expect(text).toContain("在線 2／3");
    expect(text).not.toContain("降級");
    expect(text).not.toContain("heartbeat");
  });

  it("labels today's completed fares as an estimate, not net income", async () => {
    state.shifts = [activeShift];
    state.tasks = [
      task({
        taskId: "task-done-1",
        orderId: "order-done-1",
        driverActionState: "completed",
        localStatus: "completed",
        allowedActions: [],
        orderSummary: {
          orderId: "order-done-1",
          quotedFare: { currency: "TWD", amountMinor: 25000 },
        },
      }),
      // Completed today but with no known fare: not part of the total, so it
      // must not be counted next to it either.
      task({
        taskId: "task-done-2",
        orderId: "order-done-2",
        driverActionState: "completed",
        localStatus: "completed",
        allowedActions: [],
        orderSummary: null,
      }),
    ];
    await mount(React.createElement(WorkspaceIndex));
    const text = screenText();

    expect(text).toContain("今日預估車資");
    expect(text).toContain("250");
    expect(text).toContain("已完成 1 趟");
    expect(text).not.toContain("今日淨收");
  });
});

describe("driver home: one button per destination", () => {
  it("shows 查看任務 and 查看收入 once when standing by with no tasks", async () => {
    state.shifts = [activeShift];
    state.presence = {
      driverId: "drv-test-001",
      presences: [presence({ platformCode: "uber" })],
      adapterStatuses: [],
    };
    await mount(React.createElement(WorkspaceIndex));

    expect(screenText()).toContain("工作台待命中");
    expect(buttons("查看任務")).toHaveLength(1);
    expect(buttons("查看收入")).toHaveLength(1);
  });
});

describe("driver home: buttons about different tasks", () => {
  it("keeps 查看任務 on a sync-issue card for another task under an urgent-task top card", async () => {
    state.shifts = [activeShift];
    state.tasks = [
      task({ taskId: "task-urgent-a", orderId: "order-urgent-a" }),
      task({
        taskId: "task-sync-b",
        orderId: "order-sync-b",
        orderDomain: "forwarded",
        sourcePlatform: "uber",
        platformDisplayName: "Uber",
        driverActionState: "blocked",
        localStatus: "sync_failed",
        allowedActions: [],
        requiresManualFallback: true,
        syncIssueSummary: "需由派車台協助處理。",
      }),
    ];
    await mount(React.createElement(WorkspaceIndex));

    expect(screenText()).toContain("Uber 同步異常");
    // The top card's 接受任務 / 婉拒任務 are about task A; the sync card is
    // about task B and keeps its own button.
    expect(buttons("接受任務")).toHaveLength(1);
    expect(buttons("查看任務")).toHaveLength(1);
  });

  it("offers no 查看班次 in the top card when the shift feature is off", async () => {
    state.shiftEnabled = false;
    await mount(React.createElement(WorkspaceIndex));

    const text = screenText();
    expect(text).toContain("目前沒有可接單的平台");
    // Said once, in the top card; the no-bindings card would only repeat it.
    expect(text.split("目前無法在 App 內綁定外部平台").length - 1).toBe(1);
    expect(text).not.toContain("車隊幫您");
    // The shift feature is off here, so no 打卡 promise either.
    expect(text).not.toContain("上班打卡");
    expect(text).not.toContain("讓至少一個平台上線");
    expect(buttons("前往平台連線")).toHaveLength(0);
    expect(buttons("平台中心")).toHaveLength(1);
    expect(buttons("查看班次")).toHaveLength(0);
  });
});

describe("driver home: notifications", () => {
  it("does not route a plain announcement to the SOS screen", async () => {
    state.notifications = [
      notification("n-plain", "系統維護公告", "今晚 23:00 至 23:30 暫停服務"),
      notification("n-task", "新任務指派", "請查看任務頁"),
    ];
    await mount(React.createElement(WorkspaceIndex));

    // Open the inbox from its header card.
    const inboxToggle = pressableAround(/則待讀通知/);
    expect(inboxToggle).toBeTruthy();
    await act(async () => inboxToggle!.props.onPress());

    const openButtons = buttons("開啟");
    expect(openButtons).toHaveLength(1);
    await act(async () => openButtons[0].props.onPress());
    expect(state.push).toHaveBeenCalledWith("/jobs");
    expect(state.push).not.toHaveBeenCalledWith("/sos");
  });

  it("does not treat a 緊急 maintenance notice as an SOS", async () => {
    state.notifications = [
      notification("n-urgent", "緊急維護通知", "今晚 23:00 至 23:30 系統維護"),
    ];
    await mount(React.createElement(WorkspaceIndex));

    expect(buttons("查看 SOS")).toHaveLength(0);
    await openInbox();
    expect(buttons("開啟")).toHaveLength(0);
  });

  it("routes an SOS notice to /sos and a platform notice to the platform page", async () => {
    state.notifications = [
      notification("n-sos", "SOS 已送達", "派車台已收到你的求救"),
      notification("n-platform", "平台公告", "今晚調整連線設定"),
    ];
    await mount(React.createElement(WorkspaceIndex));

    expect(buttons("查看 SOS")).toHaveLength(1);
    await openInbox();
    const openButtons = buttons("開啟");
    expect(openButtons).toHaveLength(2);
    for (const button of openButtons) {
      await act(async () => button.props.onPress());
    }
    expect(state.push.mock.calls.map(([route]) => route).sort()).toEqual([
      "/platform-presence",
      "/sos",
    ]);
  });

  it("lights the bell for unread notifications only, not for urgent cards", async () => {
    state.shifts = [activeShift];
    state.presence = {
      driverId: "drv-test-001",
      presences: [
        presence({
          platformCode: "grab",
          status: "offline",
          reauthRequired: true,
        }),
      ],
      adapterStatuses: [],
    };
    await mount(React.createElement(WorkspaceIndex));
    expect(screenText()).toContain("Grab 需重新授權");
    expect(bellHasDot()).toBe(false);
  });

  it("lights the bell when a notification is unread", async () => {
    state.notifications = [
      notification("n-plain", "系統維護公告", "今晚 23:00 至 23:30 暫停服務"),
    ];
    await mount(React.createElement(WorkspaceIndex));
    expect(bellHasDot()).toBe(true);
  });
});

describe("platform notice banner", () => {
  it("keeps the notices on screen when a refresh fails", async () => {
    state.notices = [
      {
        noticeId: "notice-1",
        title: "道路封閉",
        body: "市府路今晚封閉",
        severity: "info",
        outcome: { outcomeId: "o-1", notificationId: "n-1", readAt: null },
      },
    ];
    state.post.mockImplementation(async () => ({
      outcomeId: "o-1",
      readAt: new Date().toISOString(),
    }));
    await mount(React.createElement(PlatformNoticeBanner));
    expect(screenText()).toContain("道路封閉");

    // The read succeeds, but the refresh that follows it fails.
    state.noticesError = new TypeError("Network request failed");
    const markRead = pressableAround(/^標示已讀$/);
    await act(async () => markRead!.props.onPress());
    await flush();

    const text = screenText();
    expect(text).toContain("道路封閉");
    expect(text).not.toContain("Network");
    expect(text).not.toContain("無法標示已讀");
  });

  it.each([
    Object.assign(new Error('API error 500: {"error":"INTERNAL"}'), {
      statusCode: 500,
    }),
    new TypeError("Network request failed"),
  ])("hides a failed notice fetch (%s)", async (error) => {
    state.noticesError = error;
    await mount(React.createElement(PlatformNoticeBanner));
    const text = screenText();

    expect(text).not.toContain("API error");
    expect(text).not.toContain("Network");
    expect(
      renderer!.root
        .findAll((node: any) => node.props.accessibilityRole === "alert")
        .filter((node: any) => typeof node.type === "string"),
    ).toHaveLength(0);
  });

  it.each([
    ["an unconfirmed read", async () => ({ outcomeId: "o-1", readAt: null })],
    [
      "a network failure",
      async () => {
        throw new TypeError("Network request failed");
      },
    ],
  ])("shows one plain sentence after %s", async (_label, post) => {
    state.notices = [
      {
        noticeId: "notice-1",
        title: "道路封閉",
        body: "市府路今晚封閉",
        severity: "info",
        outcome: { outcomeId: "o-1", notificationId: "n-1", readAt: null },
      },
    ];
    state.post.mockImplementation(post);
    await mount(React.createElement(PlatformNoticeBanner));

    const markRead = pressableAround(/^標示已讀$/);
    expect(markRead).toBeTruthy();
    await act(async () => markRead!.props.onPress());
    await flush();

    const text = screenText();
    expect(text).toContain("無法標示已讀，請稍後再試");
    expect(text).not.toContain("讀取未獲確認");
    expect(text).not.toContain("Network");
  });
});
