import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { passthrough } = vi.hoisted(() => ({
  passthrough: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

const mocks = vi.hoisted(() => ({
  isDriverIdentityProvisioned: vi.fn(() => true),
  isFeatureEnabled: vi.fn(),
  getPlatformEarningsSummary: vi.fn(),
  getPlatformEarningsByPlatform: vi.fn(),
  listDriverStatements: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: passthrough("Pressable"),
  ScrollView: passthrough("ScrollView"),
  StyleSheet: { create: <T>(styles: T) => styles, flatten: (s: unknown) => s },
  Text: passthrough("Text"),
  View: passthrough("View"),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: passthrough("Ionicons"),
}));

vi.mock("@/components/canvas-primitives", () => ({
  // Banner body and PageHeader actions are element-valued props; render them so
  // the assertions can reach the nodes inside.
  Banner: (props: Record<string, unknown>) =>
    React.createElement("Banner", props, props.body as never),
  Btn: passthrough("Btn"),
  Card: passthrough("Card"),
  PageHeader: (props: Record<string, unknown>) =>
    React.createElement("CanvasPageHeader", props, props.actions as never),
  Pill: passthrough("Pill"),
  Shell: passthrough("Shell"),
  driverCanvasTheme: {
    accent: "#7BC0FF",
    accentHi: "#A9D6FF",
    border: "#273244",
    danger: "#FF6B6B",
    fontFamily: "System",
    info: "#7BC0FF",
    monoFamily: "Menlo",
    success: "#4ED8A0",
    text: "#E6ECF5",
    textMuted: "#8DA0BC",
    warn: "#F2C14E",
  },
}));

// The screen pulls in `@/lib/driver-diagnostics` (which imports
// `sanitizeLogMessage` from here) and `@/lib/driver-feature-flags`, so the mock
// has to expose those plus the null-returning identity accessors.
vi.mock("@/lib/api-client", () => {
  const driverClient = {
    isFeatureEnabled: mocks.isFeatureEnabled,
    getPlatformEarningsSummary: mocks.getPlatformEarningsSummary,
    getPlatformEarningsByPlatform: mocks.getPlatformEarningsByPlatform,
    listDriverStatements: mocks.listDriverStatements,
  };
  return {
    formatDriverError: (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback,
    sanitizeLogMessage: (value: unknown) =>
      typeof value === "string" ? value : null,
    getDriverClient: () => driverClient,
    getDriverClientOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? driverClient : null,
    getDriverId: () => "drv-001",
    getDriverIdOrNull: () =>
      mocks.isDriverIdentityProvisioned() ? "drv-001" : null,
    isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
  };
});

import EarningsScreen from "../../app/(tabs)/index/earnings";
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
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(EarningsScreen));
    await flush();
  });
  return renderer;
}

function money(amountMinor: number, currency = "TWD") {
  return { currency, amountMinor };
}

function platformItem(
  platformCode: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    platformCode,
    grossEarning: money(100_00),
    serviceFee: money(20_00),
    subsidy: money(0),
    netAmount: money(80_00),
    ...overrides,
  };
}

function statement(
  statementId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    statementId,
    driverId: "drv-001",
    periodMonth: "2026-04",
    receiptNo: `RC-${statementId}`,
    feePlanVersion: "v1",
    lines: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    grossEarning: money(500_00),
    serviceFee: money(50_00),
    subsidy: money(0),
    netAmount: money(450_00),
    payoutStatus: "pending",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function banners(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Banner");
}

function bannerTitles(renderer: any) {
  return banners(renderer).map((node: any) => node.props.title);
}

function buttons(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Btn");
}

function periodButton(renderer: any, label: string) {
  return buttons(renderer).find((node: any) => node.props.children === label);
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

function header(renderer: any) {
  return renderer.root.findByType("CanvasPageHeader");
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

describe("EarningsScreen", () => {
  beforeEach(() => {
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.getPlatformEarningsSummary.mockReset().mockResolvedValue({
      totalNet: money(80_00),
      notes: [],
    });
    mocks.getPlatformEarningsByPlatform
      .mockReset()
      .mockResolvedValue({ items: [platformItem("uber")] });
    mocks.listDriverStatements.mockReset().mockResolvedValue([]);
    // Module-level state: last-known-good flags, the diagnostic ring buffer
    // and the session epoch all survive across tests otherwise.
    resetDriverFeatureCache();
    clearDriverDiagnostics();
    resetDriverSessionLifecycleForTests();
  });

  describe("provisioning gate", () => {
    it("blocks the dashboard until the device is bound", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).toContain("裝置尚未綁定司機身份");
      expect(mocks.isFeatureEnabled).not.toHaveBeenCalled();
      expect(mocks.getPlatformEarningsSummary).not.toHaveBeenCalled();
    });
  });

  describe("loading", () => {
    it("shows a spinner while the first fetch is in flight", async () => {
      mocks.isFeatureEnabled.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(EarningsScreen));
      });
      expect(
        renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
      ).toHaveLength(1);
    });
  });

  describe("feature flag", () => {
    it("shows a paused notice when driver-app.earnings is off", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).toContain("收益儀表板暫停提供");
      expect(mocks.getPlatformEarningsSummary).not.toHaveBeenCalled();
    });

    it("checks the flag by its documented key", async () => {
      await renderScreen();
      expect(mocks.isFeatureEnabled).toHaveBeenCalledWith(
        "driver-app.earnings",
      );
    });

    it("still loads the dashboard when the flag lookup itself fails", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("flag service down"));
      const renderer = await renderScreen();

      expect(mocks.getPlatformEarningsSummary).toHaveBeenCalled();
      expect(bannerTitles(renderer)).not.toContain("收益儀表板暫停提供");
    });
  });

  describe("error handling", () => {
    it("shows a blocking failure banner with a retry when nothing loaded", async () => {
      mocks.getPlatformEarningsByPlatform.mockRejectedValue(
        new Error("earnings offline"),
      );
      const renderer = await renderScreen();

      const failure = banners(renderer).find(
        (node: any) => node.props.title === "收益資料同步失敗",
      );
      expect(failure.props.body).toBe("earnings offline");
      expect(buttons(renderer)).toHaveLength(1);
    });

    it("retries the fetch from the failure banner action", async () => {
      mocks.getPlatformEarningsByPlatform.mockRejectedValue(
        new Error("earnings offline"),
      );
      const renderer = await renderScreen();

      mocks.getPlatformEarningsByPlatform.mockResolvedValue({
        items: [platformItem("uber")],
      });
      await act(async () => {
        buttons(renderer)[0].props.onPress();
        await flush();
      });

      expect(bannerTitles(renderer)).not.toContain("收益資料同步失敗");
      const cardTitles = renderer.root
        .findAll((node: any) => node.type === "Card")
        .map((node: any) => node.props.title);
      expect(cardTitles).toContain("平台分項");
    });

    it("downgrades to a stale-data warning when older data is on screen", async () => {
      const renderer = await renderScreen();
      mocks.getPlatformEarningsByPlatform.mockRejectedValue(
        new Error("refresh failed"),
      );

      const refresh = buttons(renderer).find(
        (node: any) => node.props.children === "重新整理",
      );
      await act(async () => {
        refresh.props.onPress();
        await flush();
      });

      const warning = banners(renderer).find(
        (node: any) => node.props.title === "資料可能不是最新",
      );
      expect(warning.props.body).toBe("refresh failed");
      // The previously-loaded breakdown stays on screen behind the warning.
      expect(texts(renderer)).toContain("Uber");
    });

    it("keeps the dashboard alive when only the statements route is forbidden", async () => {
      mocks.listDriverStatements.mockRejectedValue(new Error("403 realm"));
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).not.toContain("收益資料同步失敗");
      expect(texts(renderer)).toContain("尚無月結報表");
    });
  });

  describe("period selector", () => {
    it("renders all three periods with 今日 active by default", async () => {
      const renderer = await renderScreen();

      expect(periodButton(renderer, "今日").props.variant).toBe("primary");
      expect(periodButton(renderer, "本週").props.variant).toBe("secondary");
      expect(periodButton(renderer, "本月").props.variant).toBe("secondary");
      expect(mocks.getPlatformEarningsByPlatform).toHaveBeenCalledWith("today");
    });

    it("refetches for the newly selected period", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        periodButton(renderer, "本月").props.onPress();
        await flush();
      });

      expect(mocks.getPlatformEarningsByPlatform).toHaveBeenLastCalledWith(
        "month",
      );
      expect(periodButton(renderer, "本月").props.variant).toBe("primary");
    });

    it("ignores a press on the already-selected period", async () => {
      const renderer = await renderScreen();
      const callsBefore = mocks.getPlatformEarningsByPlatform.mock.calls.length;

      await act(async () => {
        periodButton(renderer, "今日").props.onPress();
        await flush();
      });

      expect(mocks.getPlatformEarningsByPlatform.mock.calls).toHaveLength(
        callsBefore,
      );
    });

    it("disables the inactive periods while a refresh is in flight", async () => {
      const renderer = await renderScreen();
      let release: (value: unknown) => void = () => {};
      mocks.getPlatformEarningsByPlatform.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      await act(async () => {
        periodButton(renderer, "本週").props.onPress();
      });

      expect(periodButton(renderer, "本月").props.disabled).toBe(true);
      expect(periodButton(renderer, "本週").props.disabled).toBe(false);

      await act(async () => {
        release({ items: [] });
        await flush();
      });
    });

    it("relabels the refresh action while syncing", async () => {
      const renderer = await renderScreen();
      let release: (value: unknown) => void = () => {};
      mocks.getPlatformEarningsByPlatform.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      const refresh = buttons(renderer).find(
        (node: any) => node.props.children === "重新整理",
      );
      await act(async () => {
        refresh.props.onPress();
      });

      const syncing = buttons(renderer).find(
        (node: any) => node.props.children === "同步中",
      );
      expect(syncing.props.disabled).toBe(true);

      await act(async () => {
        release({ items: [] });
        await flush();
      });
    });
  });

  describe("hero summary", () => {
    it("labels and contextualises the today slice", async () => {
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("淨收入 · 本日");
      expect(texts(renderer)).toContain("即時金額");
      expect(texts(renderer)).toContain(
        "這裡顯示各平台的收益明細，月結報表仍以最近一次對帳週期為準。",
      );
    });

    it("switches the hero to the latest statement month under 本月", async () => {
      mocks.listDriverStatements.mockResolvedValue([
        statement("st-1", { periodMonth: "2026-03" }),
        statement("st-2", {
          periodMonth: "2026-04",
          updatedAt: "2026-05-02T00:00:00.000Z",
        }),
      ]);
      const renderer = await renderScreen();

      await act(async () => {
        periodButton(renderer, "本月").props.onPress();
        await flush();
      });

      expect(texts(renderer)).toContain("淨收入 · 2026-04");
      expect(texts(renderer)).toContain("月結 2026-04");
      expect(header(renderer).props.subtitle).toBe("月結 2026-04");
    });

    it("falls back to 本月月結 when no statement month exists", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        periodButton(renderer, "本月").props.onPress();
        await flush();
      });

      expect(texts(renderer)).toContain("淨收入 · 本月");
      expect(header(renderer).props.subtitle).toBe("本月月結");
    });

    it("totals gross, fee and net across every platform row", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({
        items: [
          platformItem("uber", {
            grossEarning: money(100_00),
            serviceFee: money(20_00),
            netAmount: money(80_00),
          }),
          platformItem("grab", {
            grossEarning: money(50_00),
            serviceFee: money(10_00),
            netAmount: money(40_00),
          }),
        ],
      });
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).toContain("120"); // net 80 + 40
      expect(rendered).toContain("150"); // gross 100 + 50
      expect(rendered).toContain("−30"); // fee shown as a negative
    });

    it("renders a zero fee without a sign", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({
        items: [platformItem("uber", { serviceFee: money(0) })],
      });
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("0");
    });

    it("counts only external platforms in the 外部平台 metric", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({
        items: [
          // uber is runtime_seeded -> external, counted
          platformItem("uber", { netAmount: money(70_00) }),
          // forwarder_sandbox is forwarder_stub -> shadow, excluded
          platformItem("forwarder_sandbox", { netAmount: money(900_00) }),
          // an unknown code falls back to owned, excluded
          platformItem("drts-own", { netAmount: money(500_00) }),
        ],
      });
      const renderer = await renderScreen();

      expect(texts(renderer)).toContain("外部平台");
      expect(texts(renderer)).toContain("70");
    });

    it("switches the third metric to 待撥款 for the month view", async () => {
      mocks.listDriverStatements.mockResolvedValue([
        statement("st-paid", {
          payoutStatus: "paid",
          netAmount: money(1_000_00),
        }),
        statement("st-pending", {
          payoutStatus: "pending",
          netAmount: money(250_00),
          updatedAt: "2026-05-02T00:00:00.000Z",
        }),
      ]);
      const renderer = await renderScreen();
      await act(async () => {
        periodButton(renderer, "本月").props.onPress();
        await flush();
      });

      const rendered = texts(renderer);
      expect(rendered).toContain("待撥款");
      expect(rendered).toContain("250"); // only the unpaid statement
    });
  });

  describe("finance authority banner", () => {
    it("repeats every summary note from the API", async () => {
      mocks.getPlatformEarningsSummary.mockResolvedValue({
        totalNet: money(0),
        notes: ["Uber 金額為平台參考值", "Grab 對帳中"],
      });
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).toContain("Uber 金額為平台參考值");
      expect(rendered).toContain("Grab 對帳中");
    });

    it("renders with no notes at all", async () => {
      const renderer = await renderScreen();
      expect(bannerTitles(renderer)).toContain("外部平台結算方");
    });
  });

  describe("platform breakdown", () => {
    it("renders one row per platform", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({
        items: [platformItem("uber"), platformItem("grab")],
      });
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered).toContain("Uber");
      expect(rendered).toContain("Grab");
    });

    it("humanises an unregistered platform code instead of leaking it raw", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({
        items: [platformItem("mystery-platform")],
      });
      const renderer = await renderScreen();
      const rendered = texts(renderer);
      // 需求 2：未登記的平台代碼不得原樣顯示成內部代碼樣式。
      expect(rendered).not.toContain("mystery-platform");
      expect(rendered).toContain("Mystery Platform");
    });

    it("shows an empty-period banner when there are no rows", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({ items: [] });
      const renderer = await renderScreen();
      expect(bannerTitles(renderer)).toContain("這段期間還沒有平台收益");
    });
  });

  describe("monthly statements", () => {
    it("orders statements newest-updated first", async () => {
      mocks.listDriverStatements.mockResolvedValue([
        statement("st-old", {
          periodMonth: "2026-02",
          updatedAt: "2026-03-01T00:00:00.000Z",
        }),
        statement("st-new", {
          periodMonth: "2026-04",
          updatedAt: "2026-05-01T00:00:00.000Z",
        }),
      ]);
      const renderer = await renderScreen();
      const rendered = texts(renderer);

      expect(rendered.indexOf("2026-04")).toBeLessThan(
        rendered.indexOf("2026-02"),
      );
    });

    it("shows an empty state when no statement exists", async () => {
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("尚無月結報表");
    });
  });
  // Requirement 4 & 5: the flag endpoint is admin-realm only, and the workspace
  // tab is never unmounted, so a logout must be observed explicitly.
  describe("identity, session and fail-open flags", () => {
    it("keeps the full dashboard when the flag endpoint refuses the driver realm", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403"));
      const renderer = await renderScreen();

      expect(mocks.getPlatformEarningsSummary).toHaveBeenCalled();
      expect(mocks.getPlatformEarningsByPlatform).toHaveBeenCalled();
      expect(texts(renderer)).not.toContain("收益總覽暫停提供");
      expect(bannerTitles(renderer)).not.toContain("裝置尚未綁定司機身份");
    });

    it("never leaks the flag failure into the rendered screen", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("API error 403"));
      const renderer = await renderScreen();

      expect(getDriverDiagnostics().map((entry) => entry.kind)).toContain(
        "feature_flag_fallback",
      );
      const rendered = texts(renderer).join(" ");
      for (const leak of [
        "403",
        "driver-app.earnings",
        "/api/",
        "feature_flag",
      ]) {
        expect(rendered).not.toContain(leak);
      }
    });

    it("stops calling the earnings API once the driver signs out", async () => {
      await renderScreen();
      const callsBefore = mocks.getPlatformEarningsSummary.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onUnhandled);

      try {
        await act(async () => {
          markDriverSessionSignedOut();
          await flush();
        });
        await act(async () => {
          await flush();
        });
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(mocks.getPlatformEarningsSummary.mock.calls.length).toBe(
        callsBefore,
      );
      expect(rejections).toEqual([]);
    });

    it("renders the binding notice without throwing when no device is bound", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const renderer = await renderScreen();

      expect(bannerTitles(renderer)).toContain("裝置尚未綁定司機身份");
      expect(mocks.isFeatureEnabled).not.toHaveBeenCalled();
      expect(mocks.getPlatformEarningsSummary).not.toHaveBeenCalled();
    });
  });

  // Requirement 2: no developer copy in any screen state.
  describe("driver-facing copy guard", () => {
    it("keeps the loaded dashboard free of developer copy", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({
        items: [platformItem("uber"), platformItem("drts")],
      });
      mocks.listDriverStatements.mockResolvedValue([statement("st-1")]);
      const renderer = await renderScreen();

      expect(renderedCopy(renderer)).toContain("淨收入 · 本日");
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the monthly view free of developer copy", async () => {
      mocks.listDriverStatements.mockResolvedValue([statement("st-1")]);
      const renderer = await renderScreen();
      await act(async () => {
        periodButton(renderer, "本月").props.onPress();
        await flush();
      });
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the loading state free of developer copy", async () => {
      mocks.getPlatformEarningsSummary.mockReturnValue(new Promise(() => {}));
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(EarningsScreen));
      });
      expectNoDeveloperCopy(renderer);
    });

    it("keeps the unprovisioned state free of developer copy", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the feature-disabled state free of developer copy", async () => {
      mocks.isFeatureEnabled.mockResolvedValue(false);
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps the empty breakdown free of developer copy", async () => {
      mocks.getPlatformEarningsByPlatform.mockResolvedValue({ items: [] });
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a hard load failure free of developer copy", async () => {
      mocks.getPlatformEarningsSummary.mockRejectedValue(
        new Error("Network request failed"),
      );
      mocks.getPlatformEarningsByPlatform.mockRejectedValue(
        new Error("Network request failed"),
      );
      mocks.listDriverStatements.mockRejectedValue(
        new Error("Network request failed"),
      );
      expectNoDeveloperCopy(await renderScreen());
    });

    it("keeps a denied feature flag out of the rendered copy", async () => {
      mocks.isFeatureEnabled.mockRejectedValue(new Error("403"));
      expectNoDeveloperCopy(await renderScreen());
    });
  });

});
