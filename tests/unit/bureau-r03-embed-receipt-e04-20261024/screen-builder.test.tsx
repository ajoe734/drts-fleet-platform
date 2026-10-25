// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { getByText } from "@testing-library/dom";
import { renderToString } from "react-dom/server";
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";
import {
  REFERRAL_RECEIPT_MISSING_VALUE,
  buildReferralReceiptE04Fields,
  type ReferralPassengerReceipt,
} from "@drts/contracts";

const context = {
  entry: {
    entrySlug: "r03-entry",
    displayName: "測試合作入口",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "r03-handoff",
    recoveryScope: "r03-scope",
    identityActive: true,
    partnerEntrySlug: "r03-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "receipt",
  requestedScreen: "receipt",
  handoff: { apiKey: null, partnerUserRef: null },
  decision: { requestedEntryHost: "partner.example.test", block: false },
  accent: "#123456",
  strings: {
    appName: "測試社區",
    displayName: "測試合作入口",
    supportPhone: "02-2944-0985",
  },
  issues: [],
  fallbackEntry: null,
};

// The pre-R03 wire shape: none of the E-04 fields are present.
const legacyReceipt: ReferralPassengerReceipt = {
  orderId: "own-r03",
  orderNo: "R03-ORDER-1",
  status: "completed",
  completedAt: "2026-10-20T08:00:00.000Z",
  passengerNameMasked: "測*",
  passengerPhoneMasked: "0912-***-678",
  driverName: null,
  plateNumber: null,
  vehicleType: "standard",
  pickupAddress: "合成上車",
  dropoffAddress: "合成下車",
  fareBase: null,
  fareDistance: null,
  fareTime: null,
  fareNight: null,
  totalFare: null,
  formattedTotal: "實際車資待確認",
  paymentChannel: "付款及結算狀態未提供",
};

const fullReceipt: ReferralPassengerReceipt = {
  ...legacyReceipt,
  driverName: "合成駕駛",
  plateNumber: "UNIT-0001",
  fareBase: 85,
  fareDistance: 20,
  fareTime: 0,
  fareNight: 15,
  totalFare: 120,
  formattedTotal: "NT$ 120",
  fleetOperatorName: "合成車隊股份有限公司",
  driverSurname: "王",
  driverSurnameSource: "driver_profile_declared",
  driverRegistrationMasked: "••••5678",
  pickupAt: "2026-10-20T07:40:00.000Z",
  dropoffAt: "2026-10-20T08:00:00.000Z",
  distanceMeters: 5234,
  paymentMethodDisplay: "信用卡 ••••4242",
  certificateNo: null,
};

function render(receipt: ReferralPassengerReceipt) {
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <PassengerEmbed
      context={context as never}
      liveData={{
        activeTrip: null,
        history: { items: [] },
        receipt,
        selectedOrderId: receipt.orderId,
      }}
    />,
  );
  return host;
}

const rowText = (host: HTMLElement, label: string) => {
  const section = host.querySelector("[data-drt-receipt-e04]") as HTMLElement;
  expect(section).not.toBeNull();
  return getByText(section, label, { exact: true }).parentElement?.textContent;
};

it("the shared builder renders every E-04 field as 未提供 for a receipt without the facts", () => {
  const fields = buildReferralReceiptE04Fields(legacyReceipt);
  expect(fields.map((f) => f.key)).toEqual([
    "certificateNo",
    "fleetOperatorName",
    "driverName",
    "driverSurname",
    "driverRegistrationMasked",
    "plateNo",
    "pickupAt",
    "dropoffAt",
    "routeSummary",
    "distance",
    "fareStart",
    "fareDistance",
    "fareDelay",
    "fareNight",
    "fareTotal",
    "paymentMethod",
    "consumerServicePhone",
    "authorityComplaintPhone",
  ]);
  for (const field of fields) {
    if (
      field.key === "consumerServicePhone" ||
      field.key === "authorityComplaintPhone" ||
      field.key === "routeSummary"
    )
      continue;
    expect(field, field.key).toMatchObject({
      value: REFERRAL_RECEIPT_MISSING_VALUE,
      provided: false,
    });
  }
  expect(JSON.stringify(fields)).not.toMatch(/undefined|null|NaN|待更新|N\/A/);
});

it("the shared builder keeps a genuine zero fare component and never relabels the order number", () => {
  const fields = Object.fromEntries(
    buildReferralReceiptE04Fields(fullReceipt).map((f) => [f.key, f.value]),
  );
  expect(fields).toMatchObject({
    certificateNo: "未提供",
    fleetOperatorName: "合成車隊股份有限公司",
    driverSurname: "王○○",
    driverRegistrationMasked: "••••5678",
    plateNo: "UNIT-0001",
    pickupAt: "2026/10/20 15:40:00",
    dropoffAt: "2026/10/20 16:00:00",
    routeSummary: "合成上車 → 合成下車",
    distance: "5.23 公里（5234 公尺）",
    fareStart: "NT$ 85",
    fareDelay: "NT$ 0",
    fareNight: "NT$ 15",
    fareTotal: "NT$ 120",
    paymentMethod: "信用卡 ••••4242",
    consumerServicePhone: "02-2944-0985",
    authorityComplaintPhone: "1999",
  });
  expect(Object.values(fields)).not.toContain(fullReceipt.orderNo);
});

it("the receipt screen shows the E-04 field set with 未提供 for missing facts and keeps the informal notice", () => {
  const host = render(legacyReceipt);
  expect(rowText(host, "證明編號")).toBe("證明編號未提供");
  expect(rowText(host, "車隊／派遣業者")).toBe("車隊／派遣業者未提供");
  expect(rowText(host, "執業登記證號（遮碼）")).toBe(
    "執業登記證號（遮碼）未提供",
  );
  expect(rowText(host, "上車時間（臺灣）")).toBe("上車時間（臺灣）未提供");
  expect(rowText(host, "實際里程")).toBe("實際里程未提供");
  expect(rowText(host, "支付方式")).toBe("支付方式未提供");
  expect(rowText(host, "起程")).toBe("起程未提供");
  expect(host.textContent).toContain("非正式稅務憑證");
  expect(host.textContent).not.toContain("待更新");
});

it("the receipt screen shows the canonical E-04 values when the producer supplies them", () => {
  const host = render(fullReceipt);
  expect(rowText(host, "車隊／派遣業者")).toBe(
    "車隊／派遣業者合成車隊股份有限公司",
  );
  expect(rowText(host, "駕駛自填姓氏（非身分核驗）")).toBe(
    "駕駛自填姓氏（非身分核驗）王○○",
  );
  expect(rowText(host, "執業登記證號（遮碼）")).toBe(
    "執業登記證號（遮碼）••••5678",
  );
  expect(rowText(host, "下車時間（臺灣）")).toBe(
    "下車時間（臺灣）2026/10/20 16:00:00",
  );
  expect(rowText(host, "支付方式")).toBe("支付方式信用卡 ••••4242");
  expect(rowText(host, "主管機關申訴電話")).toBe("主管機關申訴電話1999");
});
