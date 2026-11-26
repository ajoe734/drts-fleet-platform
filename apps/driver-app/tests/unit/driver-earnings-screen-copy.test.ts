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
  PLATFORM_CODE_UBER,
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
      // Codes outside the platform registry are the fleet's own dispatch.
      item("drts-owned", 30000),
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
      "drts-owned",
      "DRTS-",
      "UBER",
      "FORW",
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
    // The fleet's own dispatch gets a readable name, not its code.
    expect(rendered).toContain(driverStrings.platformPresence.managedByDrts);
    expect(rendered).toContain("Uber");
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
      items: [item("drts-owned", 30000)],
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
});
