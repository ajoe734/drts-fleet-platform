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
import type { DriverStatementRecord } from "@drts/contracts";

const boundary = vi.hoisted(() => ({
  get: vi.fn(),
  getList: vi.fn(),
  getPlatformEarningsSummary: vi.fn(),
  getPlatformEarningsByPlatform: vi.fn(),
  openURL: vi.fn(),
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
  Linking: { openURL: boundary.openURL },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("expo-router", () => ({ Redirect: "Redirect" }));
vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({ ...boundary, isFeatureEnabled: async () => true }),
  isDriverIdentityProvisioned: () => true,
  registerProtectedCacheClearHandler: () => () => {},
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import EarningsScreen from "../../app/earnings";
import { DriverStatementRow } from "../../components/earnings/driver-statement-row";
import { formatMoney } from "../../lib/money";
import { driverStrings } from "../../lib/strings";

type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string)[];
};
type Renderer = ReactTestRenderer & {
  root: { findAll(predicate: (node: Node) => boolean): Node[] };
  update(element: React.ReactElement): void;
};
const renderers: Renderer[] = [];
const copy = driverStrings.earnings.statement;
const money = (amountMinor: number) => ({ currency: "TWD", amountMinor });

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

function record(
  overrides: Partial<DriverStatementRecord> = {},
): DriverStatementRecord {
  return {
    statementId: "statement /driver-1",
    driverId: "driver-1",
    periodMonth: "2026-10",
    receiptNo: "RECEIPT-OLD",
    feePlanVersion: "plan-old",
    payoutStatus: "pending",
    grossEarning: money(15000),
    serviceFee: money(1000),
    subsidy: money(0),
    netAmount: money(14000),
    lines: [
      {
        lineId: "line-1",
        orderId: "order-detail",
        grossEarning: money(15000),
        serviceFee: money(1000),
        subsidy: money(0),
        netAmount: money(14000),
        reimbursementRequired: true,
      },
    ],
    artifactUrl: "https://example.invalid/old.pdf",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}
function freshRecord(): DriverStatementRecord {
  return record({
    receiptNo: "RECEIPT-FRESH",
    feePlanVersion: "plan-fresh",
    payoutStatus: "paid",
    artifactUrl: "https://example.invalid/current.pdf",
  });
}
function refreshedRecord(): DriverStatementRecord {
  return record({
    receiptNo: "RECEIPT-REFRESHED",
    feePlanVersion: "plan-refreshed",
    payoutStatus: "paid",
    grossEarning: money(25000),
    netAmount: money(24000),
    lines: [
      {
        lineId: "line-refreshed",
        orderId: "order-refreshed",
        grossEarning: money(25000),
        serviceFee: money(1000),
        subsidy: money(0),
        netAmount: money(24000),
        reimbursementRequired: false,
      },
    ],
    artifactUrl: "https://example.invalid/refreshed.pdf",
    updatedAt: "2026-10-13T00:00:00Z",
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function text(node: Node | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}
function allText(renderer: Renderer) {
  return renderer.root
    .findAll((node) => node.type === "Text")
    .map(text)
    .join("\n");
}
function button(renderer: Renderer, label: string): Node {
  const found = renderer.root.findAll(
    (node) => node.type === "Pressable" && text(node) === label,
  );
  expect(found).toHaveLength(1);
  return found[0]!;
}
async function press(renderer: Renderer, label: string) {
  const action = button(renderer, label).props.onPress;
  expect(action).toBeTypeOf("function");
  await act(async () => {
    (action as () => void)();
  });
}
async function mount(element: React.ReactElement): Promise<Renderer> {
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(element) as Renderer;
  });
  renderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.get.mockReset().mockResolvedValue(freshRecord());
  boundary.getList.mockReset().mockResolvedValue([record()]);
  boundary.getPlatformEarningsSummary.mockReset().mockResolvedValue({
    totalGross: money(15000),
    totalServiceFee: money(1000),
    totalSubsidy: money(0),
    totalNet: money(14000),
    platformCount: 1,
    notes: [],
  });
  boundary.getPlatformEarningsByPlatform
    .mockReset()
    .mockResolvedValue({ items: [] });
  boundary.openURL.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});

describe("Driver monthly statement detail and download", () => {
  it("connects the actual Earnings screen row to current statement detail and its approved receipt/fee/line data", async () => {
    const renderer = await mount(React.createElement(EarningsScreen));
    expect(boundary.getList).toHaveBeenCalledWith(
      "/api/driver/profile/statements",
    );
    expect(button(renderer, copy.download).props.disabled).toBe(false);
    await press(renderer, copy.view);
    expect(boundary.get).toHaveBeenCalledWith(
      "/api/driver/profile/statements/statement%20%2Fdriver-1",
    );
    expect(allText(renderer)).toContain("RECEIPT-FRESH");
    expect(allText(renderer)).toContain("plan-fresh");
    expect(allText(renderer)).toContain("order-detail");
    expect(allText(renderer)).toContain(copy.reimbursement);
    expect(allText(renderer)).toContain("已撥款");
    await press(renderer, copy.close);
    expect(allText(renderer)).not.toContain("order-detail");
    expect(boundary.openURL).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "refreshes viewed statement summary and detail from the actual Earnings screen (collapsed=%s)",
    async (collapsed) => {
      boundary.get.mockResolvedValue(record());
      const renderer = await mount(React.createElement(EarningsScreen));
      await press(renderer, copy.view);
      if (collapsed) await press(renderer, copy.close);
      const refreshed = record({
        receiptNo: "RECEIPT-REFRESHED",
        feePlanVersion: "plan-refreshed",
        payoutStatus: "paid",
        grossEarning: money(26000),
        serviceFee: money(2000),
        subsidy: money(500),
        netAmount: money(24500),
        lines: [
          {
            ...record().lines[0]!,
            orderId: "order-refreshed",
            netAmount: money(24500),
          },
        ],
        updatedAt: "2026-10-13T00:00:00Z",
      });
      boundary.getList.mockResolvedValue([refreshed]);
      await press(renderer, driverStrings.common.refresh);
      expect(boundary.getList).toHaveBeenCalledTimes(2);
      expect(boundary.get).toHaveBeenCalledTimes(1);
      const row = renderer.root.findAll(
        (node) => node.type === DriverStatementRow,
      )[0]!;
      expect(row.props.statement).toEqual(refreshed);
      const rendered = text(row);
      expect(rendered).toContain("已撥款");
      expect(rendered).not.toContain("待撥款");
      expect(rendered).toContain("RECEIPT-REFRESHED");
      expect(rendered).not.toContain("RECEIPT-OLD");
      expect(rendered).toContain("plan-refreshed");
      expect(rendered).toContain("245.00");
      expect(
        button(renderer, collapsed ? copy.view : copy.close).props.disabled,
      ).toBe(false);
      if (collapsed) {
        expect(rendered).not.toContain("order-refreshed");
      } else {
        expect(rendered).toContain(
          `${copy.net}：${formatMoney(refreshed.netAmount)}`,
        );
        expect(rendered).toContain("260.00");
        expect(rendered).toContain("20.00");
        expect(rendered).toContain("5.00");
        expect(rendered).toContain("order-refreshed");
        expect(rendered).not.toContain("order-detail");
        expect(rendered).not.toContain("140.00");
      }
    },
  );

  it.each(["detail", "download"] as const)(
    "enables a newly available artifact after actual screen refresh following a missing %s read, then re-reads before opening",
    async (operation) => {
      const missing = record({ artifactUrl: null });
      boundary.get.mockResolvedValue(missing);
      const renderer = await mount(React.createElement(EarningsScreen));
      await press(renderer, operation === "detail" ? copy.view : copy.download);
      expect(allText(renderer)).toContain(copy.missing);
      expect(button(renderer, copy.download).props.disabled).toBe(true);
      boundary.getList.mockResolvedValue([freshRecord()]);
      await press(renderer, driverStrings.common.refresh);
      expect(boundary.getList).toHaveBeenCalledTimes(2);
      expect(button(renderer, copy.download).props.disabled).toBe(false);
      expect(allText(renderer)).not.toContain(copy.missing);
      expect(boundary.openURL).not.toHaveBeenCalled();
      boundary.get.mockResolvedValue(
        record({ artifactUrl: "https://example.invalid/fresh-read.pdf" }),
      );
      await press(renderer, copy.download);
      expect(boundary.get).toHaveBeenCalledTimes(2);
      expect(boundary.openURL).toHaveBeenCalledExactlyOnceWith(
        "https://example.invalid/fresh-read.pdf",
      );
    },
  );

  it("keeps a deferred detail read visibly loading and prevents duplicate requests", async () => {
    const pending = deferred<DriverStatementRecord>();
    boundary.get.mockReturnValue(pending.promise);
    const renderer = await mount(
      React.createElement(DriverStatementRow, {
        statement: record(),
        last: true,
        onLoaded: vi.fn(),
      }),
    );
    const onPress = button(renderer, copy.view).props.onPress as () => void;
    await act(async () => {
      onPress();
      onPress();
    });
    expect(allText(renderer)).toContain(copy.loading);
    expect(button(renderer, copy.download).props.disabled).toBe(true);
    expect(boundary.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(freshRecord());
    });
    expect(allText(renderer)).not.toContain(copy.loading);
  });

  it("shows a detail read failure and retries the same statement instead of reporting success", async () => {
    boundary.get
      .mockRejectedValueOnce(new Error("Statement not available"))
      .mockResolvedValueOnce(freshRecord());
    const renderer = await mount(React.createElement(EarningsScreen));
    await press(renderer, copy.view);
    expect(allText(renderer)).toContain("Statement not available");
    expect(allText(renderer)).not.toContain("RECEIPT-FRESH");
    await press(renderer, copy.retry);
    expect(boundary.get.mock.calls).toEqual([
      ["/api/driver/profile/statements/statement%20%2Fdriver-1"],
      ["/api/driver/profile/statements/statement%20%2Fdriver-1"],
    ]);
    expect(allText(renderer)).toContain("RECEIPT-FRESH");
    expect(boundary.openURL).not.toHaveBeenCalled();
  });

  it("re-reads the statement before opening its refreshed server-issued download URL", async () => {
    const oldMetadata = {
      kind: "report",
      subjectId: "statement /driver-1",
      manifestHash: "hash",
      host: "example.invalid",
      keyId: "key",
      signedAt: "2000-01-01T00:00:00Z",
      expiresAt: "2000-01-02T00:00:00Z",
      ttlMinutes: 60,
      signatureVersion: 1,
      signature: "old",
      downloadUrl: "https://example.invalid/expired.pdf",
      immutable: true as const,
    };
    boundary.getList.mockResolvedValue([
      record({ artifactDownloadMetadata: oldMetadata }),
    ]);
    boundary.get.mockResolvedValue(
      record({
        artifactDownloadMetadata: {
          ...oldMetadata,
          expiresAt: "2099-01-01T00:00:00Z",
          signature: "new",
          downloadUrl: "https://example.invalid/refreshed.pdf?signature=new",
        },
      }),
    );
    const renderer = await mount(React.createElement(EarningsScreen));
    await press(renderer, copy.download);
    expect(boundary.get).toHaveBeenCalledWith(
      "/api/driver/profile/statements/statement%20%2Fdriver-1",
    );
    expect(boundary.openURL).toHaveBeenCalledWith(
      "https://example.invalid/refreshed.pdf?signature=new",
    );
    expect(boundary.openURL).toHaveBeenCalledTimes(1);
    expect(allText(renderer)).not.toContain("下載成功");
  });

  it("never opens the cached artifact when the current download read is denied", async () => {
    boundary.get.mockRejectedValue(new Error("Statement access denied"));
    const renderer = await mount(React.createElement(EarningsScreen));
    await press(renderer, copy.download);
    expect(allText(renderer)).toContain("Statement access denied");
    expect(boundary.openURL).not.toHaveBeenCalled();
    expect(boundary.get).toHaveBeenCalledWith(
      "/api/driver/profile/statements/statement%20%2Fdriver-1",
    );
  });

  it("keeps missing artifacts unavailable until a real detail retry returns one", async () => {
    boundary.get
      .mockResolvedValueOnce(record({ artifactUrl: null }))
      .mockResolvedValueOnce(freshRecord());
    boundary.getList.mockResolvedValue([record({ artifactUrl: null })]);
    const renderer = await mount(React.createElement(EarningsScreen));
    expect(button(renderer, copy.download).props.disabled).toBe(true);
    await press(renderer, copy.view);
    expect(allText(renderer)).toContain(copy.missing);
    expect(boundary.openURL).not.toHaveBeenCalled();
    await press(renderer, copy.retry);
    expect(button(renderer, copy.download).props.disabled).toBe(false);
  });

  it("does not open an expired link returned by a fresh read", async () => {
    const expired = {
      kind: "report",
      subjectId: "statement /driver-1",
      manifestHash: "hash",
      host: "example.invalid",
      keyId: "key",
      signedAt: "2000-01-01T00:00:00Z",
      expiresAt: "2000-01-02T00:00:00Z",
      ttlMinutes: 60,
      signatureVersion: 1,
      signature: "signature",
      downloadUrl: "https://example.invalid/expired.pdf",
      immutable: true as const,
    };
    boundary.get.mockResolvedValue(
      record({ artifactDownloadMetadata: expired }),
    );
    const renderer = await mount(React.createElement(EarningsScreen));
    await press(renderer, copy.download);
    expect(allText(renderer)).toContain(copy.expired);
    expect(boundary.openURL).not.toHaveBeenCalled();
  });

  it("reports an opener failure and retries with another fresh statement read", async () => {
    boundary.openURL
      .mockRejectedValueOnce(new Error("Could not open document"))
      .mockResolvedValueOnce(undefined);
    const renderer = await mount(React.createElement(EarningsScreen));
    await press(renderer, copy.download);
    expect(allText(renderer)).toContain("Could not open document");
    await press(renderer, copy.download);
    expect(boundary.get).toHaveBeenCalledTimes(2);
    expect(boundary.openURL).toHaveBeenCalledTimes(2);
    expect(allText(renderer)).not.toContain("Could not open document");
  });

  it("keeps an accepted download pending while its own fresh record is published into the actual Earnings screen", async () => {
    const pendingOpen = deferred<void>();
    boundary.openURL.mockReturnValueOnce(pendingOpen.promise);
    const renderer = await mount(React.createElement(EarningsScreen));

    await press(renderer, copy.download);

    const row = renderer.root.findAll(
      (node) => node.type === DriverStatementRow,
    )[0]!;
    expect((row.props.statement as DriverStatementRecord).receiptNo).toBe(
      "RECEIPT-FRESH",
    );
    expect(allText(renderer)).toContain("RECEIPT-FRESH");
    expect(allText(renderer)).toContain(copy.opening);
    expect(button(renderer, copy.download).props.disabled).toBe(true);
    expect(boundary.get).toHaveBeenCalledTimes(1);
    expect(boundary.openURL).toHaveBeenCalledTimes(1);

    await act(async () => pendingOpen.resolve());

    expect(allText(renderer)).not.toContain(copy.opening);
    expect(button(renderer, copy.download).props.disabled).toBe(false);
    expect(allText(renderer)).toContain("RECEIPT-FRESH");
    expect(allText(renderer)).toContain("order-detail");
  });

  it("does not open or republish a pending response after its row is removed", async () => {
    const pending = deferred<DriverStatementRecord>();
    const onLoaded = vi.fn();
    boundary.get.mockReturnValue(pending.promise);
    const renderer = await mount(
      React.createElement(DriverStatementRow, {
        statement: record(),
        last: true,
        onLoaded,
      }),
    );
    await press(renderer, copy.download);
    await act(async () => {
      renderer.unmount();
    });
    renderers.splice(renderers.indexOf(renderer), 1);
    await act(async () => {
      pending.resolve(freshRecord());
    });
    expect(onLoaded).not.toHaveBeenCalled();
    expect(boundary.openURL).not.toHaveBeenCalled();
  });

  it.each(["expanded", "collapsed"] as const)(
    "shows refreshed same-statement payout, receipt, amounts and lines after viewing %s detail in the actual Earnings screen",
    async (visibility) => {
      const old = record();
      const refreshed = refreshedRecord();
      boundary.get.mockResolvedValue(old);
      boundary.getList
        .mockResolvedValueOnce([old])
        .mockResolvedValueOnce([refreshed]);
      const renderer = await mount(React.createElement(EarningsScreen));
      await press(renderer, copy.view);
      if (visibility === "collapsed") await press(renderer, copy.close);

      await press(renderer, driverStrings.common.refresh);

      expect(boundary.getList).toHaveBeenCalledTimes(2);
      expect(allText(renderer)).toContain("RECEIPT-REFRESHED");
      expect(allText(renderer)).toContain("plan-refreshed");
      expect(allText(renderer)).toContain("已撥款");
      expect(allText(renderer)).toContain("240.00");
      expect(allText(renderer)).not.toContain("RECEIPT-OLD");
      expect(allText(renderer)).not.toContain("待撥款");
      expect(allText(renderer)).not.toContain("order-detail");
      if (visibility === "expanded") {
        expect(allText(renderer)).toContain("order-refreshed");
        expect(allText(renderer)).toContain("250.00");
      } else {
        expect(allText(renderer)).not.toContain("order-refreshed");
        expect(button(renderer, copy.view).props.disabled).toBe(false);
      }
      expect(boundary.get).toHaveBeenCalledTimes(1);
    },
  );

  it("makes a previously missing artifact downloadable after normal refresh and still reads its current URL before opening", async () => {
    const missing = record({ artifactUrl: null });
    const refreshed = refreshedRecord();
    boundary.get
      .mockResolvedValueOnce(missing)
      .mockResolvedValueOnce(refreshed);
    boundary.getList
      .mockResolvedValueOnce([missing])
      .mockResolvedValueOnce([refreshed]);
    const renderer = await mount(React.createElement(EarningsScreen));
    await press(renderer, copy.view);
    expect(button(renderer, copy.download).props.disabled).toBe(true);
    expect(allText(renderer)).toContain(copy.missing);

    await press(renderer, driverStrings.common.refresh);

    expect(button(renderer, copy.download).props.disabled).toBe(false);
    expect(allText(renderer)).not.toContain(copy.missing);
    expect(boundary.openURL).not.toHaveBeenCalled();
    await press(renderer, copy.download);
    expect(boundary.get).toHaveBeenCalledTimes(2);
    expect(boundary.openURL).toHaveBeenCalledWith(refreshed.artifactUrl);
    expect(allText(renderer)).toContain("RECEIPT-REFRESHED");
    expect(allText(renderer)).toContain("order-refreshed");
  });

  it.each(["detail", "download"] as const)(
    "discards a late pre-refresh %s response instead of reverting the actual Earnings row or opening its old artifact",
    async (operation) => {
      const old = record();
      const refreshed = refreshedRecord();
      const pending = deferred<DriverStatementRecord>();
      boundary.get.mockReturnValueOnce(pending.promise);
      boundary.getList
        .mockResolvedValueOnce([old])
        .mockResolvedValueOnce([refreshed]);
      const renderer = await mount(React.createElement(EarningsScreen));
      await press(
        renderer,
        operation === "download" ? copy.download : copy.view,
      );
      await press(renderer, driverStrings.common.refresh);
      expect(allText(renderer)).toContain("RECEIPT-REFRESHED");
      await act(async () => pending.resolve(old));
      expect(allText(renderer)).not.toContain(copy.loading);
      expect(allText(renderer)).not.toContain(copy.opening);

      const row = renderer.root.findAll(
        (node) => node.type === DriverStatementRow,
      )[0]!;
      expect((row.props.statement as DriverStatementRecord).receiptNo).toBe(
        "RECEIPT-REFRESHED",
      );
      expect(allText(renderer)).toContain("RECEIPT-REFRESHED");
      expect(allText(renderer)).not.toContain("RECEIPT-OLD");
      expect(allText(renderer)).toContain("240.00");
      expect(boundary.openURL).not.toHaveBeenCalled();
    },
  );

  it("keeps a post-refresh read pending when an older canceled response settles, then publishes only the current read", async () => {
    const old = record();
    const refreshed = refreshedRecord();
    const pendingOld = deferred<DriverStatementRecord>();
    const pendingCurrent = deferred<DriverStatementRecord>();
    const onLoaded = vi.fn();
    boundary.get
      .mockReturnValueOnce(pendingOld.promise)
      .mockReturnValueOnce(pendingCurrent.promise);
    const renderer = await mount(
      React.createElement(DriverStatementRow, {
        statement: old,
        last: true,
        onLoaded,
      }),
    );
    await press(renderer, copy.download);
    await act(async () => {
      renderer.update(
        React.createElement(DriverStatementRow, {
          statement: refreshed,
          last: true,
          onLoaded,
        }),
      );
    });
    expect(button(renderer, copy.download).props.disabled).toBe(false);
    const currentPress = button(renderer, copy.download).props
      .onPress as () => void;
    await act(async () => currentPress());
    await act(async () => pendingOld.resolve(old));
    expect(onLoaded).not.toHaveBeenCalled();
    expect(boundary.openURL).not.toHaveBeenCalled();
    expect(allText(renderer)).toContain(copy.opening);
    await act(async () => currentPress());
    expect(boundary.get).toHaveBeenCalledTimes(2);

    await act(async () => pendingCurrent.resolve(refreshed));
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith(refreshed);
    expect(boundary.openURL).toHaveBeenCalledOnce();
    expect(boundary.openURL).toHaveBeenCalledWith(refreshed.artifactUrl);
    expect(allText(renderer)).not.toContain(copy.opening);
  });

  it("separates a failed monthly-list read from no statements and offers an actual refresh", async () => {
    boundary.getList
      .mockRejectedValueOnce(new Error("Monthly statements unavailable"))
      .mockResolvedValueOnce([record()]);
    const renderer = await mount(React.createElement(EarningsScreen));
    expect(allText(renderer)).toContain("Monthly statements unavailable");
    expect(allText(renderer)).not.toContain("尚無月結報表");
    await press(renderer, copy.listRetry);
    expect(boundary.getList).toHaveBeenCalledTimes(2);
    expect(button(renderer, copy.view).props.disabled).toBe(false);
    expect(allText(renderer)).not.toContain("Monthly statements unavailable");
  });

  it("retains the honest empty monthly state after a successful zero-row read", async () => {
    boundary.getList.mockResolvedValue([]);
    const renderer = await mount(React.createElement(EarningsScreen));
    expect(allText(renderer)).toContain("尚無月結報表");
    expect(allText(renderer)).not.toContain(copy.errorTitle);
    expect(boundary.get).not.toHaveBeenCalled();
  });
});
