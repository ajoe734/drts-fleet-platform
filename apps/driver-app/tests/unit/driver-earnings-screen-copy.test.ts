import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  PLATFORM_CODE_FORWARDER_SANDBOX,
  PLATFORM_CODE_GRAB_TAIWAN,
  PLATFORM_CODE_UBER,
  type DriverStatementRecord,
  type PlatformEarningsItem,
} from "@drts/contracts";

// Regression guard for the driver earnings screen copy: plain wording instead
// of finance jargon, the "other platforms are for reference" note shown once,
// period labels on the Taiwan calendar, and never a raw platform code.

const boundary = vi.hoisted(() => ({
  getList: vi.fn(),
  getPlatformEarningsSummary: vi.fn(),
  getPlatformEarningsByPlatform: vi.fn(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: {
    OS: "web",
    select: (values: { web?: unknown; default?: unknown }) =>
      values.web ?? values.default,
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  Linking: { openURL: vi.fn() },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("expo-router", () => ({ Redirect: "Redirect" }));
vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    ...boundary,
    get: vi.fn(),
    isFeatureEnabled: async () => true,
  }),
  isDriverIdentityProvisioned: () => true,
  registerProtectedCacheClearHandler: () => () => {},
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import EarningsScreen from "../../app/earnings";
import { driverStrings } from "../../lib/strings";

type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string)[];
};
type Renderer = ReactTestRenderer & {
  root: { findAll(predicate: (node: Node) => boolean): Node[] };
};

const money = (amountMinor: number) => ({ currency: "TWD", amountMinor });
const item = (platformCode: string, net: number): PlatformEarningsItem =>
  ({
    platformCode,
    grossEarning: money(net + 1000),
    serviceFee: money(1000),
    subsidy: money(0),
    netAmount: money(net),
  }) as PlatformEarningsItem;

const statement = (
  periodMonth: string,
  payoutStatus: DriverStatementRecord["payoutStatus"],
  net: number,
): DriverStatementRecord =>
  ({
    statementId: `statement-${periodMonth}`,
    driverId: "driver-1",
    periodMonth,
    receiptNo: `RECEIPT-${periodMonth}`,
    feePlanVersion: "plan-1",
    payoutStatus,
    grossEarning: money(net),
    serviceFee: money(0),
    subsidy: money(0),
    netAmount: money(net),
    lines: [],
    artifactUrl: null,
    createdAt: `${periodMonth}-28T00:00:00Z`,
    updatedAt: `${periodMonth}-28T00:00:00Z`,
  }) as DriverStatementRecord;

const renderers: Renderer[] = [];

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.clearAllMocks();
  // 2026-11-25 18:00 UTC is Thursday 2026-11-26 02:00 in Taiwan.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T18:00:00.000Z"));
  boundary.getList.mockResolvedValue([]);
  boundary.getPlatformEarningsSummary.mockResolvedValue({
    totalGross: money(0),
    totalServiceFee: money(0),
    totalSubsidy: money(0),
    totalNet: money(0),
    platformCount: 0,
    notes: ["Summary totals are derived from the per-platform aggregation."],
  });
  boundary.getPlatformEarningsByPlatform.mockResolvedValue({
    items: [
      // The fleet's own dispatch source.
      item("drts", 30000),
      item(PLATFORM_CODE_UBER, 20000),
      item(PLATFORM_CODE_FORWARDER_SANDBOX, 5000),
    ],
  });
});
afterEach(async () => {
  vi.useRealTimers();
  await act(async () => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});

function text(node: Node | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}
function textNodes(renderer: Renderer): string[] {
  return renderer.root.findAll((node) => node.type === "Text").map(text);
}
function allText(renderer: Renderer) {
  return textNodes(renderer).join("\n");
}
async function mount(): Promise<Renderer> {
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(React.createElement(EarningsScreen)) as Renderer;
  });
  renderers.push(renderer);
  return renderer;
}
async function selectPeriod(renderer: Renderer, label: string) {
  const [button] = renderer.root.findAll(
    (node) => node.type === "Pressable" && text(node) === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    (button!.props.onPress as () => void)();
  });
}

describe("Driver earnings screen copy", () => {
  it("uses plain settlement wording and never shows jargon, raw codes or API notes", async () => {
    const renderer = await mount();
    const rendered = allText(renderer);

    for (const jargon of [
      "切片",
      "鏡像",
      "DRTS",
      "財務主導",
      "權威",
      "對帳金額",
      "UBER",
      "FORW",
      "forwarder_sandbox",
      "Forwarder Sandbox",
      "TWD",
      "Summary totals",
    ]) {
      expect(rendered).not.toContain(jargon);
    }

    expect(rendered).toContain(driverStrings.earnings.sections.ownedSettlement);
    expect(rendered).toContain(
      driverStrings.earnings.sections.platformSettlement,
    );
    expect(rendered).toContain(driverStrings.earnings.sections.referenceOnly);
    // Readable names, never codes or English descriptions.
    expect(rendered).toContain("Uber");
    expect(rendered).toContain("測試平台");
    // The fleet's own dispatch is 車隊派單, named once on its row (no second
    // pill repeating it), and the old name 自營 is gone.
    expect(rendered).not.toContain("自營");
    const ownedRows = renderer.root.findAll(
      (node) =>
        typeof node.type === "function" &&
        (node.type as { name?: string }).name === "BreakdownRow" &&
        String((node.props.item as PlatformEarningsItem).platformCode) ===
          "drts",
    );
    expect(ownedRows).toHaveLength(1);
    expect(text(ownedRows[0]!).split("車隊派單")).toHaveLength(2);
  });

  it("shows platforms the app does not know as other platforms, never as the fleet's own settlement", async () => {
    boundary.getPlatformEarningsByPlatform.mockResolvedValue({
      items: [
        item("drts", 30000),
        item("zeta-cabs", 7000),
        item("acme-taxi", 6000),
        item(PLATFORM_CODE_GRAB_TAIWAN, 4000),
      ],
    });
    const renderer = await mount();
    const rows = renderer.root.findAll(
      (node) =>
        typeof node.type === "function" &&
        (node.type as { name?: string }).name === "BreakdownRow",
    );
    expect(rows).toHaveLength(4);
    const rowText = (code: string) =>
      text(
        rows.find(
          (row) =>
            (row.props.item as PlatformEarningsItem).platformCode === code,
        )!,
      );

    // Only the fleet's own dispatch is 車隊結算.
    expect(rowText("drts")).toContain("車隊結算");
    for (const code of ["zeta-cabs", "acme-taxi"]) {
      expect(rowText(code)).not.toContain("車隊結算");
      expect(rowText(code)).not.toContain("車隊派單");
      expect(rowText(code)).toContain("平台入帳");
      expect(rowText(code)).not.toContain(code);
    }
    // Two unknown platforms stay distinguishable, in a stable order.
    expect(rowText("acme-taxi")).toContain("其他平台 1");
    expect(rowText("zeta-cabs")).toContain("其他平台 2");
    expect(rowText(PLATFORM_CODE_GRAB_TAIWAN)).toContain("Grab 台灣");
    // Unknown platforms count as other platforms for the note and the total.
    expect(allText(renderer)).toContain(
      driverStrings.earnings.sections.platformNote,
    );
    expect(allText(renderer)).toContain("130");
  });

  it("names a single unknown platform 其他平台 without a number", async () => {
    boundary.getPlatformEarningsByPlatform.mockResolvedValue({
      items: [item("acme-taxi", 6000)],
    });
    const renderer = await mount();
    expect(textNodes(renderer)).toContain("其他平台");
    expect(allText(renderer)).not.toContain("其他平台 1");
    expect(allText(renderer)).not.toContain("車隊結算");
  });

  it("shows the other-platforms note exactly once", async () => {
    const renderer = await mount();
    const note = driverStrings.earnings.sections.platformNote;
    expect(note).toBe("其他平台金額僅供參考，以該平台入帳為準。");
    expect(allText(renderer).split(note)).toHaveLength(2);
    expect(allText(renderer)).not.toContain("不同平台有不同的結算權威");
  });

  it("omits the other-platforms note when only the fleet's own dispatch has earnings", async () => {
    boundary.getPlatformEarningsByPlatform.mockResolvedValue({
      items: [item("drts", 30000)],
    });
    const renderer = await mount();
    expect(allText(renderer)).not.toContain(
      driverStrings.earnings.sections.platformNote,
    );
  });

  it("labels today, the Monday-to-Sunday week and the month on the Taiwan calendar", async () => {
    const renderer = await mount();
    const texts = () => textNodes(renderer);

    expect(texts()).toContain("今日 11/26");

    await selectPeriod(renderer, "本週");
    expect(boundary.getPlatformEarningsByPlatform).toHaveBeenLastCalledWith(
      "week",
    );
    expect(texts()).toContain("本週 11/23–11/29");
    // The week label is a range, not just today's date.
    expect(texts()).not.toContain("本週 11/26");

    await selectPeriod(renderer, "本月");
    expect(texts()).toContain("本月 2026年11月");
    expect(texts()).toContain("淨收入 · 本月");
  });

  it("keeps an unpaid statement total visible when the period has no income", async () => {
    boundary.getPlatformEarningsByPlatform.mockResolvedValue({ items: [] });
    boundary.getList.mockResolvedValue([
      statement("2026-10", "pending", 14000),
      statement("2026-09", "pending", 5000),
      statement("2026-08", "paid", 9000),
    ]);
    const renderer = await mount();
    await selectPeriod(renderer, "本月");

    expect(textNodes(renderer)).toContain(driverStrings.earnings.emptyPeriod);
    const [pending] = renderer.root.findAll(
      (node) =>
        node.props?.testID === "earnings-pending-payout" &&
        typeof node.type === "string",
    );
    expect(pending).toBeDefined();
    // Both unpaid statements count; the paid one does not.
    expect(text(pending!)).toBe(
      `${driverStrings.earnings.metrics.pendingPayout}$190.00`,
    );
  });

  it("shows no pending total once every statement is paid", async () => {
    boundary.getPlatformEarningsByPlatform.mockResolvedValue({ items: [] });
    boundary.getList.mockResolvedValue([statement("2026-10", "paid", 14000)]);
    const renderer = await mount();
    expect(
      renderer.root.findAll(
        (node) => node.props?.testID === "earnings-pending-payout",
      ),
    ).toHaveLength(0);
  });
});
