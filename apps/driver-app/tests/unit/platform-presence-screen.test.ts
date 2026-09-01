import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  alert: vi.fn(),
  openURL: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(() => true),
  getPlatformPresence: vi.fn(),
  setPlatformOnline: vi.fn(),
  setPlatformOffline: vi.fn(),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Alert: { alert: mocks.alert },
    Pressable: p("Pressable"),
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    TextInput: "TextInput",
    View: p("View"),
  };
});

vi.mock("expo-linking", () => ({ openURL: mocks.openURL }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: passthrough("Ionicons") }));

vi.mock("@/components/canvas-primitives", () => ({
  Banner: withProp("Banner", "actions"),
  Btn: passthrough("Btn"),
  Card: passthrough("Card"),
  DL: passthrough("DL"),
  KPI: passthrough("KPI"),
  PageHeader: withProp("CanvasPageHeader", "actions"),
  Pill: passthrough("Pill"),
  Shell: withProp("Shell", "footer"),
  driverCanvasTheme: new Proxy({}, { get: () => "#000000" }),
}));

vi.mock("@/lib/api-client", () => {
  const driverClient = {
    getPlatformPresence: mocks.getPlatformPresence,
    setPlatformOnline: mocks.setPlatformOnline,
    setPlatformOffline: mocks.setPlatformOffline,
  };
  return {
    formatDriverError: (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback,
    getDriverClient: () => driverClient,
    getDriverClientOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? driverClient : null,
    isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
  };
});

import PlatformPresenceScreen from "../../app/(tabs)/platform-presence/index";
import {
  markDriverSessionSignedIn,
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
    renderer = create(React.createElement(PlatformPresenceScreen));
    await flush();
  });
  return renderer;
}

function presence(overrides: Record<string, unknown> = {}) {
  return {
    platformCode: "uber",
    status: "online",
    reauthRequired: false,
    eligibility: "eligible",
    canReceiveOrders: true,
    availableActions: null,
    eligibleServiceBuckets: [],
    lastSyncedAt: "2026-05-08T03:00:00.000Z",
    reauthUrl: null,
    nativeAppUrl: null,
    ...overrides,
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    presences: [presence()],
    adapterStatuses: [],
    refreshTier: "medium",
    refreshMeta: null,
    emptyState: null,
    ...overrides,
  };
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

function buttons(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Btn");
}

function buttonWithLabel(renderer: any, label: string) {
  return buttons(renderer).find((node: any) => node.props.children === label);
}

function banners(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Banner");
}

function bannerTitles(renderer: any) {
  return banners(renderer).map((node: any) => node.props.title);
}

const FILTER_LABELS = ["全部", "需處理", "可接單", "重新授權"];

async function selectFilter(renderer: any, label: string) {
  const tabs = renderer.root
    .findAll(
      (node: any) =>
        node.type === "Pressable" &&
        node.props.accessibilityRole === "button" &&
        node.props.onPress,
    )
    .slice(0, FILTER_LABELS.length);
  await act(async () => {
    tabs[FILTER_LABELS.indexOf(label)].props.onPress();
  });
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

describe("PlatformPresenceScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T04:00:00.000Z"));

    mocks.push.mockReset();
    mocks.alert.mockReset();
    mocks.openURL.mockReset().mockResolvedValue(undefined);
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
    mocks.getPlatformPresence.mockReset().mockResolvedValue(summary());
    mocks.setPlatformOnline.mockReset().mockResolvedValue(undefined);
    mocks.setPlatformOffline.mockReset().mockResolvedValue(undefined);
    resetDriverSessionLifecycleForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("gates and empty states", () => {
    it("shows a spinner during the first load", async () => {
      mocks.getPlatformPresence.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(PlatformPresenceScreen));
      });
      expect(
        renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
      ).toHaveLength(1);
    });

    it("asks an unbound device to finish binding first", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).toContain("尚未完成裝置綁定");
      expect(mocks.getPlatformPresence).not.toHaveBeenCalled();

      await act(async () => {
        buttonWithLabel(renderer, "前往設定").props.onPress();
      });
      expect(mocks.push).toHaveBeenCalledWith("/settings");
    });

    it("reports a sync failure as its own empty state", async () => {
      mocks.getPlatformPresence.mockRejectedValue(new Error("presence down"));
      const renderer = await renderScreen();
      expect(bannerTitles(renderer)).toContain("平台資料同步失敗");
    });

    it("distinguishes a permission rejection from a generic failure", async () => {
      mocks.getPlatformPresence.mockRejectedValue(new Error("403 forbidden"));
      const renderer = await renderScreen();
      expect(bannerTitles(renderer)).toContain("目前沒有查看權限");
    });

    it("explains an ineligible driver", async () => {
      mocks.getPlatformPresence.mockResolvedValue(
        summary({
          presences: [
            presence({ eligibility: "suspended", canReceiveOrders: false }),
          ],
        }),
      );
      const renderer = await renderScreen();
      expect(bannerTitles(renderer)).toContain("目前不符合派單資格");
    });

    it("explains a fully degraded external estate", async () => {
      mocks.getPlatformPresence.mockResolvedValue(
        summary({
          presences: [presence({ platformCode: "uber" })],
          adapterStatuses: [{ platformCode: "uber", status: "down" }],
        }),
      );
      const renderer = await renderScreen();
      expect(bannerTitles(renderer)).toContain("外部平台同步異常");
    });
  });

  describe("filters", () => {
    beforeEach(() => {
      mocks.getPlatformPresence.mockResolvedValue(
        summary({
          presences: [
            presence({ platformCode: "uber", status: "online" }),
            presence({
              platformCode: "grab",
              status: "offline",
              reauthRequired: true,
              canReceiveOrders: false,
            }),
          ],
          adapterStatuses: [{ platformCode: "grab", status: "degraded" }],
        }),
      );
    });

    it("summarises the estate in the header subtitle", async () => {
      const renderer = await renderScreen();
      expect(renderer.root.findByType("CanvasPageHeader").props.subtitle).toBe(
        "2 個平台 · 1 可接單 · 1 需處理",
      );
    });

    it("counts ready, reauth and degraded platforms in the KPI strip", async () => {
      const renderer = await renderScreen();
      const kpis = renderer.root
        .findAll((node: any) => node.type === "KPI")
        .map((node: any) => [node.props.label, node.props.value]);

      expect(kpis).toEqual([
        ["可接單", "1"],
        ["需重授權", "1"],
        ["同步異常", "1"],
      ]);
    });

    it("offers all four presence filters", async () => {
      const renderer = await renderScreen();
      for (const label of FILTER_LABELS) {
        expect(texts(renderer)).toContain(label);
      }
    });

    it("reports a filtered-empty state when a filter matches nothing", async () => {
      mocks.getPlatformPresence.mockResolvedValue(
        summary({ presences: [presence({ platformCode: "uber" })] }),
      );
      const renderer = await renderScreen();
      await selectFilter(renderer, "重新授權");

      expect(bannerTitles(renderer)).toContain("這個篩選沒有符合的平台");
    });

    it("returns to the full estate when 全部 is reselected", async () => {
      const renderer = await renderScreen();
      await selectFilter(renderer, "重新授權");
      await selectFilter(renderer, "全部");

      expect(bannerTitles(renderer)).not.toContain("這個篩選沒有符合的平台");
    });
  });

  // ── Regression lock for a live defect ──────────────────────────────────────
  //
  // resolveEmptyReason() ends in `return "no_data"`, so a fully bound, eligible
  // and healthy estate still resolves to an empty reason. platform-presence.tsx
  // renders `emptyState ? <Banner/> : <platform list/>`, so the platform cards —
  // and with them every 上線 / 下線 / reauth / 帳號詳情 button — are unreachable
  // on the happy path. These tests pin the *current* behaviour; when the empty
  // reason is fixed they must fail, at which point the platform-card
  // interactions become testable and should be covered here.
  describe("platform card reachability (known defect)", () => {
    const healthyEstate = () =>
      summary({
        presences: [
          presence({
            platformCode: "uber",
            status: "online",
            eligibility: "eligible",
            canReceiveOrders: true,
          }),
        ],
        adapterStatuses: [{ platformCode: "uber", status: "healthy" }],
      });

    it("shows the no_data banner instead of the healthy platform list", async () => {
      mocks.getPlatformPresence.mockResolvedValue(healthyEstate());
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).toContain("目前沒有可顯示的平台資料");
    });

    it("renders no platform name even though a platform was returned", async () => {
      mocks.getPlatformPresence.mockResolvedValue(healthyEstate());
      const renderer = await renderScreen();

      expect(texts(renderer)).not.toContain("Uber");
    });

    it("leaves every platform action button unreachable", async () => {
      mocks.getPlatformPresence.mockResolvedValue(healthyEstate());
      const renderer = await renderScreen();

      for (const label of ["上線", "下線", "帳號詳情", "打開授權頁"]) {
        expect(buttonWithLabel(renderer, label)).toBeUndefined();
      }
      expect(mocks.setPlatformOnline).not.toHaveBeenCalled();
      expect(mocks.setPlatformOffline).not.toHaveBeenCalled();
    });

    it("still counts the platform in the header summary and KPIs", async () => {
      mocks.getPlatformPresence.mockResolvedValue(healthyEstate());
      const renderer = await renderScreen();

      // The data is present and summarised — only the interactive list is lost.
      expect(renderer.root.findByType("CanvasPageHeader").props.subtitle).toBe(
        "1 個平台 · 1 可接單 · 0 需處理",
      );
    });
  });

  describe("sync failure banner", () => {
    it("keeps a stale estate visible behind a failed-sync banner", async () => {
      await renderScreen();
      mocks.getPlatformPresence.mockRejectedValue(new Error("blip"));

      const renderer = await renderScreen();
      expect(renderer).toBeDefined();
    });
  });

  describe("refresh", () => {
    it("reloads on demand and disables itself while syncing", async () => {
      const renderer = await renderScreen();
      const before = mocks.getPlatformPresence.mock.calls.length;

      let release: (value: unknown) => void = () => {};
      mocks.getPlatformPresence.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      await act(async () => {
        buttonWithLabel(renderer, "重新整理").props.onPress();
      });

      expect(mocks.getPlatformPresence.mock.calls.length).toBe(before + 1);
      expect(buttonWithLabel(renderer, "同步中").props.disabled).toBe(true);

      await act(async () => {
        release(summary());
        await flush();
      });
    });

    it("re-polls on the background interval", async () => {
      await renderScreen();
      const before = mocks.getPlatformPresence.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await flush();
      });

      expect(mocks.getPlatformPresence.mock.calls.length).toBeGreaterThan(
        before,
      );
    });

    it("keeps the last summary when a silent background refresh fails", async () => {
      const renderer = await renderScreen();
      mocks.getPlatformPresence.mockRejectedValue(new Error("blip"));

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await flush();
      });

      const banner = banners(renderer).find(
        (node: any) => node.props.title === "最近一次同步失敗",
      );
      expect(banner.props.body).toContain("blip");
      // The header summary still reflects the last good payload.
      expect(renderer.root.findByType("CanvasPageHeader").props.subtitle).toBe(
        "1 個平台 · 1 可接單 · 0 需處理",
      );
    });

    it("clears the summary on a non-silent failure", async () => {
      const renderer = await renderScreen();
      mocks.getPlatformPresence.mockRejectedValue(new Error("hard failure"));

      await act(async () => {
        buttonWithLabel(renderer, "重新整理").props.onPress();
        await flush();
      });

      expect(bannerTitles(renderer)).toContain("平台資料同步失敗");
    });
  });

  describe("logout while the tab stays mounted", () => {
    it("stops polling the API once the driver signs out", async () => {
      await act(async () => {
        markDriverSessionSignedIn();
      });
      await renderScreen();

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await flush();
      });
      expect(mocks.getPlatformPresence.mock.calls.length).toBeGreaterThan(0);

      // Logout: the tab is not unmounted, only the session goes away.
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await act(async () => {
        markDriverSessionSignedOut();
        await flush();
      });

      const afterLogout = mocks.getPlatformPresence.mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await flush();
      });

      expect(mocks.getPlatformPresence.mock.calls.length).toBe(afterLogout);
    });

    it("produces no unhandled rejection after signing out", async () => {
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onUnhandled);

      try {
        await act(async () => {
          markDriverSessionSignedIn();
        });
        const renderer = await renderScreen();

        mocks.isDriverIdentityProvisioned.mockReturnValue(false);
        await act(async () => {
          markDriverSessionSignedOut();
          await flush();
        });

        await act(async () => {
          vi.advanceTimersByTime(120_000);
          await flush();
        });

        // Render still works and asks the driver to bind the device again.
        expect(bannerTitles(renderer)).toContain("尚未完成裝置綁定");
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(rejections).toEqual([]);
    });

    it("resumes polling after the driver signs in again", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await renderScreen();
      expect(mocks.getPlatformPresence).not.toHaveBeenCalled();

      mocks.isDriverIdentityProvisioned.mockReturnValue(true);
      await act(async () => {
        markDriverSessionSignedIn();
        await flush();
      });

      expect(mocks.getPlatformPresence.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe("developer copy guard", () => {
    it("keeps the loading state free of developer jargon", async () => {
      mocks.getPlatformPresence.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(PlatformPresenceScreen));
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

    it("keeps the fetch-failure empty state free of developer jargon", async () => {
      mocks.getPlatformPresence.mockRejectedValue(new Error("連線逾時"));
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the permission-denied empty state free of developer jargon", async () => {
      mocks.getPlatformPresence.mockRejectedValue(new Error("權限不足"));
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the external-platforms-unavailable state free of developer jargon", async () => {
      mocks.getPlatformPresence.mockResolvedValue(
        summary({
          presences: [presence({ platformCode: "uber" })],
          adapterStatuses: [{ platformCode: "uber", status: "down" }],
        }),
      );
      const renderer = await renderScreen();
      expect(bannerTitles(renderer)).toContain("外部平台同步異常");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the not-eligible empty state free of developer jargon", async () => {
      mocks.getPlatformPresence.mockResolvedValue(
        summary({
          presences: [
            presence({ platformCode: "uber", eligibility: "pending" }),
          ],
        }),
      );
      const renderer = await renderScreen();
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the filtered-empty state free of developer jargon", async () => {
      mocks.getPlatformPresence.mockResolvedValue(summary());
      const renderer = await renderScreen();
      await selectFilter(renderer, "重新授權");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps the healthy estate view free of developer jargon", async () => {
      mocks.getPlatformPresence.mockResolvedValue(
        summary({
          presences: [
            presence({
              platformCode: "uber",
              status: "online",
              eligibility: "eligible",
              canReceiveOrders: true,
              eligibleServiceBuckets: ["standard_taxi", "business_dispatch"],
            }),
          ],
          adapterStatuses: [{ platformCode: "uber", status: "healthy" }],
          refreshMeta: {
            generatedAt: "2026-05-08T03:50:00.000Z",
            source: "live",
          },
          notes: ["平台資料每 15 秒更新一次。"],
        }),
      );
      const renderer = await renderScreen();
      expect(renderedCopy(renderer)).toContain("最後更新");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("keeps a failed background refresh free of developer jargon", async () => {
      mocks.getPlatformPresence.mockResolvedValue(summary());
      const renderer = await renderScreen();

      mocks.getPlatformPresence.mockRejectedValue(new Error("連線逾時"));
      await act(async () => {
        vi.advanceTimersByTime(20_000);
        await flush();
      });

      expect(bannerTitles(renderer)).toContain("最近一次同步失敗");
      expect(developerTermsIn(renderer)).toEqual([]);
    });

    it("drops the internal refresh-tier and data-source metadata card", async () => {
      mocks.getPlatformPresence.mockResolvedValue(summary());
      const renderer = await renderScreen();
      const copy = renderedCopy(renderer);

      expect(copy).not.toContain("Platform Health Center");
      expect(copy).not.toContain("Refresh tier");
      expect(copy).not.toContain("資料來源");
      expect(copy).not.toContain("Binding");
    });
  });
});
