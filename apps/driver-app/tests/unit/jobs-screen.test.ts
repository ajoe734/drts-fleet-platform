import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedDriverTaskView } from "@drts/contracts";

const { passthrough, withProp } = vi.hoisted(() => {
  return {
    passthrough: (name: string) => (props: Record<string, unknown>) =>
      React.createElement(name, props, props.children as never),
    // Some canvas primitives take element-valued props (actions/body/icon);
    // render them so assertions can reach the nodes they contain.
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
  const passthroughLocal = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Animated: {
      View: passthroughLocal("AnimatedView"),
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
    Pressable: passthroughLocal("Pressable"),
    ScrollView: passthroughLocal("ScrollView"),
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: (s: unknown) => s,
    },
    Text: passthroughLocal("Text"),
    View: passthroughLocal("View"),
  };
});

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: passthrough("Ionicons") }));

vi.mock("@/components/canvas-primitives", () => ({
  Banner: withProp("Banner", "actions"),
  Btn: passthrough("Btn"),
  Card: passthrough("Card"),
  KPI: passthrough("KPI"),
  PageHeader: withProp("CanvasPageHeader", "actions"),
  Pill: passthrough("Pill"),
  Shell: withProp("Shell", "footer"),
  driverCanvasTheme: new Proxy({}, { get: () => "#000000" }),
}));

vi.mock("@/components/ui", () => ({
  AuthorityBanner: passthrough("AuthorityBanner"),
  PlatformBadge: passthrough("PlatformBadge"),
}));

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

import JobsScreen from "../../app/(tabs)/jobs/index";
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

function forwardedTask(overrides: Partial<UnifiedDriverTaskView> = {}) {
  return task({
    taskId: "task-fwd",
    orderDomain: "forwarded",
    sourcePlatform: "grab",
    platformDisplayName: "Grab",
    externalOrderId: "ext-1",
    nativeStatus: "offered",
    allowedActions: ["accept", "reject"],
    fareAuthority: "external_platform",
    settlementAuthority: "external_platform",
    driverPayoutAuthority: "external_platform",
    ...overrides,
  });
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

function kpis(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "KPI")
    .map((node: any) => [node.props.label, node.props.value]);
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

const FILTER_LABELS = ["全部", "待處理", "進行中", "平台結案", "需同步"];

async function selectFilter(renderer: any, label: string) {
  const row = renderer.root.findByType("ScrollView");
  const pressables = row.findAll((node: any) => node.type === "Pressable");
  const index = FILTER_LABELS.indexOf(label);
  await act(async () => {
    pressables[index].props.onPress();
  });
}

function taskCards(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "PlatformBadge");
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

describe("JobsScreen", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getOrder.mockReset().mockRejectedValue(new Error("no order"));
    mocks.getPendingDriverTaskCompletion.mockReset().mockResolvedValue(null);
    mocks.acceptForwardedDriverOffer
      .mockReset()
      .mockResolvedValue({ outcome: "accept_pending", driverMessage: null });
    mocks.rejectForwardedDriverOffer
      .mockReset()
      .mockResolvedValue({ outcome: "rejected", driverMessage: null });
    mocks.getDriverIdentityIssue.mockReset().mockReturnValue(null);
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
    mocks.getDriverId.mockReset().mockReturnValue("drv-001");
    // All three hold module-level state that would otherwise leak between
    // tests (last-known-good flags, diagnostic ring buffer, session epoch).
    resetDriverFeatureCache();
    clearDriverDiagnostics();
    resetDriverSessionLifecycleForTests();
  });

  describe("feature flag and loading", () => {
    it("shows a spinner while the first fetch is in flight", async () => {
      mocks.isFeatureEnabled.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(JobsScreen));
      });
      expect(
        renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
      ).toHaveLength(1);
    });

    it("checks driver-app.tasks before listing anything", async () => {
      await renderScreen();
      expect(mocks.isFeatureEnabled).toHaveBeenCalledWith("driver-app.tasks");
    });

    it("offers the trip workspace when the inbox is disabled", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("任務清單暫停提供");
      const openTrip = buttonWithLabel(renderer, "開啟行程作業");
      await act(async () => {
        openTrip.props.onPress();
      });
      expect(mocks.push).toHaveBeenCalledWith("/trip");
    });

    it("still lists tasks when the flag lookup itself fails", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("flags down"));
      await renderScreen();
      expect(mocks.listUnifiedDriverTasks).toHaveBeenCalled();
    });
  });

  describe("legacy fallback", () => {
    it("falls back to the legacy task API and warns about the mirror", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("410 gone"));
      mocks.listDriverTasks.mockResolvedValue([
        {
          taskId: "legacy-1",
          orderId: "order-legacy",
          status: "assigned",
          updatedAt: "2026-05-08T03:00:00.000Z",
        },
      ]);
      const renderer = await renderScreen();

      expect(banners(renderer).map((node: any) => node.props.title)).toContain(
        "任務資料同步延遲",
      );
      expect(kpis(renderer)).toContainEqual(["總計", 1]);
    });

    it("surfaces a load failure with a retry action", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("unified down"));
      mocks.listDriverTasks.mockRejectedValue(new Error("legacy down too"));
      const renderer = await renderScreen();

      const failure = banners(renderer).find(
        (node: any) => node.props.title === "任務收件匣載入失敗",
      );
      expect(failure.props.body).toBe("legacy down too");

      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      await act(async () => {
        buttonWithLabel(renderer, "重新整理").props.onPress();
        await flush();
      });
      expect(
        banners(renderer).map((node: any) => node.props.title),
      ).not.toContain("任務收件匣載入失敗");
    });
  });

  describe("offline completion queue", () => {
    it("warns that a queued completion is still waiting to resend", async () => {
      mocks.getPendingDriverTaskCompletion.mockResolvedValue({
        taskId: "task-queued",
      });
      const renderer = await renderScreen();

      const queued = banners(renderer).find(
        (node: any) => node.props.title === "離線佇列待重送",
      );
      expect(queued.props.body).toContain("task-queued");
    });

    it("tolerates a failing pending-completion lookup", async () => {
      mocks.getPendingDriverTaskCompletion.mockRejectedValue(
        new Error("sqlite locked"),
      );
      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      const renderer = await renderScreen();

      expect(kpis(renderer)).toContainEqual(["總計", 1]);
    });
  });

  describe("KPI counters", () => {
    it("counts assigned, needs-action and forwarded tasks separately", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "own-1", driverActionState: "in_progress" }),
        task({ taskId: "own-2", driverActionState: "action_required" }),
        forwardedTask({
          taskId: "fwd-1",
          driverActionState: "awaiting_platform",
        }),
        forwardedTask({
          taskId: "fwd-2",
          driverActionState: "in_progress",
          requiresReauth: true,
        }),
      ]);
      const renderer = await renderScreen();

      expect(kpis(renderer)).toEqual([
        ["總計", 4],
        ["需動作", 3],
        ["外部平台", 2],
      ]);
    });
  });

  describe("filters", () => {
    const fixtures = [
      task({ taskId: "own-progress", driverActionState: "in_progress" }),
      task({ taskId: "own-action", driverActionState: "action_required" }),
      forwardedTask({
        taskId: "fwd-closed",
        nativeStatus: "lost_race",
        driverActionState: "read_only",
        allowedActions: [],
      }),
      forwardedTask({
        taskId: "fwd-sync",
        driverActionState: "blocked",
        syncIssueSummary: "平台回應逾時",
        allowedActions: [],
      }),
    ];

    beforeEach(() => {
      mocks.listUnifiedDriverTasks.mockResolvedValue(fixtures);
    });

    it("shows every task under 全部", async () => {
      const renderer = await renderScreen();
      expect(taskCards(renderer)).toHaveLength(4);
    });

    it("narrows to in-progress tasks", async () => {
      const renderer = await renderScreen();
      await selectFilter(renderer, "進行中");

      expect(taskCards(renderer)).toHaveLength(1);
      expect(texts(renderer)).toContain("台北車站 → 台北 101");
    });

    it("narrows to tasks needing driver action, including sync failures", async () => {
      const renderer = await renderScreen();
      await selectFilter(renderer, "待處理");
      expect(taskCards(renderer)).toHaveLength(2);
    });

    it("narrows to platform-closed tasks", async () => {
      const renderer = await renderScreen();
      await selectFilter(renderer, "平台結案");
      expect(taskCards(renderer)).toHaveLength(1);
    });

    it("narrows to sync issues", async () => {
      const renderer = await renderScreen();
      await selectFilter(renderer, "需同步");
      expect(taskCards(renderer)).toHaveLength(1);
    });

    it("shows an empty state when a filter matches nothing", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ driverActionState: "completed" }),
      ]);
      const renderer = await renderScreen();
      await selectFilter(renderer, "需同步");

      expect(texts(renderer)).toContain("此篩選條件下沒有任務");
    });

    it("never counts a synced-failed task as platform-closed", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        forwardedTask({
          nativeStatus: "cancelled_by_platform",
          syncIssueSummary: "同步失敗",
          driverActionState: "blocked",
        }),
      ]);
      const renderer = await renderScreen();
      await selectFilter(renderer, "平台結案");
      expect(texts(renderer)).toContain("此篩選條件下沒有任務");
    });
  });

  describe("ordering", () => {
    it("puts in-progress first, then action-required, then awaiting", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        forwardedTask({
          taskId: "c",
          driverActionState: "awaiting_platform",
          pickupSummary: "C",
          dropoffSummary: null,
        }),
        task({
          taskId: "a",
          driverActionState: "action_required",
          pickupSummary: "A",
          dropoffSummary: null,
        }),
        task({
          taskId: "b",
          driverActionState: "in_progress",
          pickupSummary: "B",
          dropoffSummary: null,
        }),
      ]);
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered.indexOf("B")).toBeLessThan(rendered.indexOf("A"));
      expect(rendered.indexOf("A")).toBeLessThan(rendered.indexOf("C"));
    });

    it("breaks a priority tie by the earlier deadline", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({
          taskId: "later",
          pickupSummary: "LATER",
          dropoffSummary: null,
          deadlineAt: "2026-05-08T05:00:00.000Z",
        }),
        task({
          taskId: "sooner",
          pickupSummary: "SOONER",
          dropoffSummary: null,
          deadlineAt: "2026-05-08T04:00:00.000Z",
        }),
      ]);
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered.indexOf("SOONER")).toBeLessThan(
        rendered.indexOf("LATER"),
      );
    });

    it("sorts deadline-less tasks after those with a deadline", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({
          taskId: "none",
          pickupSummary: "NONE",
          dropoffSummary: null,
          deadlineAt: null,
        }),
        task({
          taskId: "dated",
          pickupSummary: "DATED",
          dropoffSummary: null,
          deadlineAt: "2026-05-08T04:00:00.000Z",
        }),
      ]);
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered.indexOf("DATED")).toBeLessThan(rendered.indexOf("NONE"));
    });
  });

  describe("accepting a forwarded offer", () => {
    it("offers the accept action only for an actionable forwarded task", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        forwardedTask({ driverActionState: "action_required" }),
      ]);
      const renderer = await renderScreen();
      expect(buttonWithLabel(renderer, "接受平台訂單")).toBeDefined();
    });

    it("hides the accept action once the task has a sync issue", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        forwardedTask({
          driverActionState: "action_required",
          requiresReauth: true,
        }),
      ]);
      const renderer = await renderScreen();
      expect(buttonWithLabel(renderer, "接受平台訂單")).toBeUndefined();
    });

    it("never offers the platform accept action for an owned task", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ driverActionState: "action_required" }),
      ]);
      const renderer = await renderScreen();
      expect(buttonWithLabel(renderer, "接受平台訂單")).toBeUndefined();
      expect(buttonWithLabel(renderer, "開啟目前行程")).toBeDefined();
    });

    it("sends the accept and reports the pending platform confirmation", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      expect(mocks.acceptForwardedDriverOffer).toHaveBeenCalledWith("task-fwd");
      expect(banners(renderer).map((node: any) => node.props.title)).toContain(
        "已送出接單，等待平台確認",
      );
      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBeGreaterThan(1);
    });

    it("reports a confirmed platform acceptance as success", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockResolvedValue({
        outcome: "confirmed_by_platform",
        driverMessage: "  ",
      });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      const notice = banners(renderer).find(
        (node: any) => node.props.title === "平台已確認接單",
      );
      expect(notice.props.tone).toBe("success");
      expect(notice.props.body).toBeUndefined();
    });

    it("reports losing the race to another driver", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockResolvedValue({
        outcome: "lost_race",
        driverMessage: "已由其他司機接走",
      });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      const notice = banners(renderer).find(
        (node: any) => node.props.title === "其他司機已被平台確認",
      );
      expect(notice.props.body).toBe("已由其他司機接走");
    });

    it("escalates a platform sync failure as danger", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockResolvedValue({
        outcome: "sync_failed",
        driverMessage: null,
      });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      const notice = banners(renderer).find(
        (node: any) => node.props.title === "平台同步異常，需派車台處理",
      );
      expect(notice.props.tone).toBe("danger");
    });

    it("falls back to a neutral notice for an unknown outcome", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockResolvedValue({
        outcome: "something_new",
        driverMessage: null,
      });
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      expect(banners(renderer).map((node: any) => node.props.title)).toContain(
        "平台回覆已更新",
      );
    });

    it("surfaces a rejected platform call as a failure banner", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockRejectedValue(
        new Error("平台連線逾時"),
      );
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      const notice = banners(renderer).find(
        (node: any) => node.props.title === "平台回覆失敗",
      );
      expect(notice.props.tone).toBe("danger");
      expect(notice.props.body).toBe("平台連線逾時");
    });

    it("returns to onboarding when the failure is an identity issue", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      mocks.acceptForwardedDriverOffer.mockRejectedValue(new Error("401"));
      mocks.getDriverIdentityIssue.mockReturnValue("device_revoked");
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
        await flush();
      });

      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
      expect(
        banners(renderer).map((node: any) => node.props.title),
      ).not.toContain("平台回覆失敗");
    });

    it("disables the button and shows progress while submitting", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([forwardedTask()]);
      let release: (value: unknown) => void = () => {};
      mocks.acceptForwardedDriverOffer.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "接受平台訂單").props.onPress();
      });

      const submitting = buttonWithLabel(renderer, "提交中…");
      expect(submitting.props.disabled).toBe(true);

      await act(async () => {
        release({ outcome: "accept_pending", driverMessage: null });
        await flush();
      });
    });
  });

  describe("layout toggle", () => {
    it("switches between the card and dense queue layouts", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      const renderer = await renderScreen();

      expect(kpis(renderer)).toHaveLength(3);

      await act(async () => {
        buttonWithLabel(renderer, "佇列").props.onPress();
      });

      expect(kpis(renderer)).toHaveLength(0);
      expect(texts(renderer)).toContain("排序：時效 ▾");
      expect(buttonWithLabel(renderer, "卡片")).toBeDefined();
    });

    it("shows the dense swipe hint only for actionable forwarded rows", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        forwardedTask({ driverActionState: "action_required" }),
      ]);
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "佇列").props.onPress();
      });

      expect(texts(renderer)).toContain("右滑接受 · 左滑婉拒");
    });

    it("omits the swipe hint for owned tasks in the dense layout", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "佇列").props.onPress();
      });

      expect(texts(renderer)).not.toContain("右滑接受 · 左滑婉拒");
    });
  });

  describe("refresh action", () => {
    it("reloads the inbox and disables itself while syncing", async () => {
      const renderer = await renderScreen();
      const before = mocks.listUnifiedDriverTasks.mock.calls.length;

      let release: (value: unknown) => void = () => {};
      mocks.listUnifiedDriverTasks.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      await act(async () => {
        buttonWithLabel(renderer, "同步").props.onPress();
      });

      expect(mocks.listUnifiedDriverTasks.mock.calls.length).toBe(before + 1);
      expect(buttonWithLabel(renderer, "同步").props.disabled).toBe(true);

      await act(async () => {
        release([]);
        await flush();
      });
      expect(buttonWithLabel(renderer, "同步").props.disabled).toBe(false);
    });
  });

  describe("order enrichment", () => {
    it("shows the quoted fare when the order lookup succeeds", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      mocks.getOrder.mockResolvedValue({
        orderId: "order-001",
        quotedFare: { currency: "TWD", amountMinor: 25000 },
      });
      const renderer = await renderScreen();

      expect(texts(renderer).some((value) => value.includes("250"))).toBe(true);
    });

    it("renders the task without a fare when the order lookup fails", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      mocks.getOrder.mockRejectedValue(new Error("404"));
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("台北車站 → 台北 101");
    });

    it("looks each distinct order up exactly once", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "t1", orderId: "order-shared" }),
        task({ taskId: "t2", orderId: "order-shared" }),
      ]);
      await renderScreen();
      expect(mocks.getOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe("navigation chrome", () => {
    // The screen used to draw its own copy of the five global tabs into the
    // shell footer, so the app showed two tab bars stacked on top of each
    // other. Navigation now belongs solely to app/(tabs)/_layout.tsx.
    it("hands the shell no footer at all", async () => {
      const renderer = await renderScreen();
      expect(renderer.root.findByType("Shell").props.footer).toBeUndefined();
    });

    it("renders none of the global tab labels itself", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      const renderer = await renderScreen();

      const rendered = texts(renderer);
      for (const label of ["工作台", "行程", "平台", "設定"]) {
        expect(rendered).not.toContain(label);
      }
    });

    it("keeps the needs-action count on the summary row instead of a tab badge", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "t1" }),
        task({ taskId: "t2" }),
      ]);
      const renderer = await renderScreen();

      expect(kpis(renderer)).toContainEqual(["需動作", 2]);
    });
  });
  // Requirement 4 & 5: the admin-realm flag endpoint always rejects a real
  // driver token, and bottom tabs stay mounted after a logout.
  describe("identity, session and fail-open flags", () => {
    it("keeps the whole task inbox when the flag endpoint refuses the driver realm", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403"));
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task({ taskId: "t1" }),
        task({ taskId: "t2", driverActionState: "in_progress" }),
      ]);
      const renderer = await renderScreen();

      // Fail-open: the list is loaded and rendered, no "feature off" state.
      expect(mocks.listUnifiedDriverTasks).toHaveBeenCalled();
      expect(kpis(renderer)).toContainEqual(["總計", 2]);
      expect(texts(renderer)).not.toContain("任務清單暫停提供");
      expect(texts(renderer)).not.toContain("尚未完成裝置綁定");
    });

    it("shows the binding empty state and calls no API when no device is bound", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("尚未完成裝置綁定");
      expect(mocks.isFeatureEnabled).not.toHaveBeenCalled();
      expect(mocks.listUnifiedDriverTasks).not.toHaveBeenCalled();
      expect(mocks.listDriverTasks).not.toHaveBeenCalled();
    });

    it("stops calling the task API once the driver signs out", async () => {
      const renderer = await renderScreen();
      expect(mocks.listUnifiedDriverTasks).toHaveBeenCalledTimes(1);

      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await act(async () => {
        markDriverSessionSignedOut();
        await flush();
      });

      expect(mocks.listUnifiedDriverTasks).toHaveBeenCalledTimes(1);
      expect(texts(renderer)).toContain("尚未完成裝置綁定");
    });

    it("produces no unhandled rejection across an unbound render and a sign-out", async () => {
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onUnhandled);

      try {
        const renderer = await renderScreen();
        mocks.isDriverIdentityProvisioned.mockReturnValue(false);
        await act(async () => {
          markDriverSessionSignedOut();
          await flush();
        });
        await act(async () => {
          await flush();
        });

        expect(texts(renderer)).toContain("尚未完成裝置綁定");
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(rejections).toEqual([]);
    });

    it("keeps the flag fallback out of the screen and only in diagnostics", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403"));
      const renderer = await renderScreen();

      const kinds = getDriverDiagnostics().map((entry) => entry.kind);
      expect(kinds).toContain("feature_flag_fallback");

      const rendered = texts(renderer).join(" ");
      for (const leak of ["403", "driver-app.tasks", "/api/", "feature_flag"]) {
        expect(rendered).not.toContain(leak);
      }
    });
  });

  describe("developer copy guard", () => {
    it("keeps the loading state free of developer jargon", async () => {
      mocks.isFeatureEnabled.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(JobsScreen));
      });
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the unbound-device empty state free of developer jargon", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();
      // Also proves the collector really reaches the screen's copy.
      expect(renderedCopy(renderer)).toContain("尚未完成裝置綁定");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the disabled-inbox empty state free of developer jargon", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the load-failure state free of developer jargon", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("連線逾時"));
      mocks.listDriverTasks.mockRejectedValue(new Error("連線逾時"));
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the legacy-mirror notice free of developer jargon", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("暫時無法連線"));
      mocks.listDriverTasks.mockResolvedValue([
        {
          taskId: "legacy-1",
          orderId: "order-legacy",
          status: "assigned",
          sourcePlatform: "grab",
          updatedAt: "2026-05-08T03:00:00.000Z",
        },
      ]);
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the populated inbox free of developer jargon in both layouts", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        task(),
        forwardedTask(),
        forwardedTask({
          taskId: "task-sync",
          nativeStatus: "sync_failed",
          driverActionState: "blocked",
          allowedActions: [],
        }),
        forwardedTask({
          taskId: "task-read",
          nativeStatus: "confirmed",
          driverActionState: "read_only",
          allowedActions: [],
        }),
        forwardedTask({
          taskId: "task-done",
          nativeStatus: "completed_synced",
          driverActionState: "completed",
          allowedActions: [],
        }),
      ]);
      const renderer = await renderScreen();
      expect(renderedCopy(renderer)).toContain("平台訂單");
      expect(developerTermsIn(renderer)).toEqual([]);

      await act(async () => {
        buttonWithLabel(renderer, "佇列").props.onPress();
        await flush();
      });
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the filtered-empty state free of developer jargon", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([task()]);
      const renderer = await renderScreen();
      await selectFilter(renderer, "平台結案");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the queued-completion notice free of developer jargon", async () => {
      mocks.getPendingDriverTaskCompletion.mockResolvedValue({
        taskId: "task-queued",
      });
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });
  });
});
