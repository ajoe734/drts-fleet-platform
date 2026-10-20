// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "../referral-cancellation-window-canonical-20261020/mounted-dom";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const orderA = "a0000000-0000-4000-8000-000000000001";
const orderB = "a0000000-0000-4000-8000-000000000002";
const context = {
  entry: {
    entrySlug: "sim-entry",
    displayName: "測試社區",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "unit-handoff",
    recoveryScope: "unit-scope",
    identityActive: true,
    partnerEntrySlug: "sim-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "receipt",
  requestedScreen: "receipt",
  handoff: { apiKey: null, partnerUserRef: null },
  decision: { requestedEntryHost: "partner.example.test", block: false },
  accent: "#123456",
  strings: {
    appName: "社區",
    displayName: "測試社區",
    supportPhone: "0800-000-000",
  },
  issues: [],
  fallbackEntry: null,
};
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
function live(
  orderId: string,
  totalFare: number | null,
  status: string | null = "completed",
) {
  return deepFreeze({
    activeTrip: null,
    selectedOrderId: orderId,
    history: {
      items: [
        {
          orderId,
          orderNo: "N-UNIT",
          status: status ?? "completed",
          pickupAddress: "甲地",
          dropoffAddress: "乙地",
          createdAt: "2026-10-20T00:00:00Z",
          completedAt: "2026-10-20T01:00:00Z",
          fareTotal: totalFare,
          formattedFare:
            totalFare === null ? "實際車資待確認" : `NT$ ${totalFare}`,
          rating: {
            orderId,
            score: 2,
            tags: ["駕駛親切"],
            comment: "原有評價",
            contactRequested: false,
            complaintCaseNo: "CRM-UNIT",
            submittedAt: "2026-10-20T01:10:00Z",
          },
        },
      ],
    },
    receipt:
      status === null
        ? null
        : {
            orderId,
            orderNo: "N-UNIT",
            status,
            completedAt: "2026-10-20T01:00:00Z",
            passengerNameMasked: "測＊",
            passengerPhoneMasked: "09＊＊",
            driverName: "測試駕駛",
            plateNumber: "UNIT-1",
            vehicleType: "standard_taxi",
            pickupAddress: "甲地",
            dropoffAddress: "乙地",
            fareBase: null,
            fareDistance: null,
            fareTime: null,
            totalFare,
            formattedTotal:
              totalFare === null ? "實際車資待確認" : `NT$ ${totalFare}`,
            paymentChannel: "付款及結算狀態未提供",
            downloadUrl: `/api/referral/receipt/${orderId}/download`,
            quote: {
              quoteId: "estimate-only",
              estimatedMin: 1500,
              estimatedMax: 1600,
              fixedPrice: false,
              isGuaranteed: false,
              expiresAt: "2026-10-20T01:00:00Z",
              quotedFareRuleVersion: "unit",
            },
          },
  });
}
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sessionStorage.clear();
  fetchSpy = vi.fn(() => {
    throw new Error(
      "Unexpected fetch: this UI presentation must not issue a payment request",
    );
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it.each([
  [321.5, "NT$ 321.5"],
  [null, "實際車資待確認"],
  [0, "NT$ 0"],
] as const)(
  "real ReceiptScreen SIM uses only actualFare %s, then returns to the same original rating/readback",
  (fare, amount) => {
    const data = live(orderA, fare);
    const before = JSON.stringify(data);
    const view = render(
      <PassengerEmbed context={context as never} liveData={data as never} />,
    );
    const section = screen.getByRole("region", { name: "外部付款模擬示意" });
    expect(section.textContent).toContain("SIM");
    expect(section.textContent).toContain("不實際扣款");
    expect(
      screen.getByRole("link", { name: "下載收據" }).getAttribute("href"),
    ).toBe(`/api/referral/receipt/${orderA}/download`);
    fireEvent.click(
      within(section).getByRole("button", {
        name: "開啟外部付款模擬示意（SIM）",
      }),
    );
    const preview = within(section).getByRole("region", {
      name: "付款示意內容",
    });
    expect(preview.textContent).toContain(orderA);
    expect(preview.textContent).toContain(amount);
    expect(preview.textContent).not.toContain("1500");
    expect(preview.textContent).not.toContain("1600");
    expect(preview.textContent).toContain("SIM");
    expect(preview.textContent).toContain("不實際扣款");
    fireEvent.click(within(preview).getByRole("button", { name: "關閉示意" }));
    expect(screen.queryByRole("region", { name: "付款示意內容" })).toBeNull();
    fireEvent.click(
      within(section).getByRole("button", {
        name: "開啟外部付款模擬示意（SIM）",
      }),
    );
    const back = within(section).getByRole("link", {
      name: "返回本行程／評價（SIM）",
    });
    const href = back.getAttribute("href")!;
    const url = new URL(href, "https://unit-not-requested.invalid");
    expect(url.pathname).toBe("/embed/sim-entry");
    expect(url.searchParams.get("orderId")).toBe(orderA);
    expect(url.searchParams.get("screen")).toBe("completed");
    expect(url.searchParams.get("state")).toBe("handoff");
    // Only the Next navigation boundary is controlled; render its actual existing destination, not a mirrored screen.
    const prevent = (event: MouseEvent) => event.preventDefault();
    back.addEventListener("click", prevent);
    fireEvent.click(back);
    back.removeEventListener("click", prevent);
    view.rerender(
      <PassengerEmbed
        context={
          {
            ...context,
            screen: "completed",
            requestedScreen: "completed",
          } as never
        }
        liveData={data as never}
      />,
    );
    expect(screen.getByRole("button", { name: "評分已送出" })).toBeTruthy();
    expect(screen.getByText(/CRM-UNIT/).textContent).toContain(
      "不需客服聯絡，僅供內部檢視",
    );
    expect(
      screen.getByRole("link", { name: "查看收據" }).getAttribute("href"),
    ).toContain(`orderId=${orderA}`);
    expect(
      screen.queryByRole("region", { name: "外部付款模擬示意" }),
    ).toBeNull();
    expect(JSON.stringify(data)).toBe(before);
    expect(data.receipt?.status).toBe("completed");
    expect(data.receipt).not.toHaveProperty("paid");
    expect(data.receipt).not.toHaveProperty("settled");
  },
);

it.each(["cancelled", "on_trip", null])(
  "existing receipt fallback for %s never invents an eligible completed SIM entry",
  (status) => {
    const data = live(orderA, null, status);
    const before = JSON.stringify(data);
    render(
      <PassengerEmbed context={context as never} liveData={data as never} />,
    );
    expect(
      screen.queryByRole("region", { name: "外部付款模擬示意" }),
    ).toBeNull();
    expect(screen.getByText("我的行程")).toBeTruthy();
    expect(JSON.stringify(data)).toBe(before);
  },
);

it("an actually changed receipt order resets the optional preview instead of retaining the previous order screen", () => {
  const first = live(orderA, 321.5),
    second = live(orderB, null);
  const view = render(
    <PassengerEmbed context={context as never} liveData={first as never} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "開啟外部付款模擬示意（SIM）" }),
  );
  expect(
    screen.getByRole("region", { name: "付款示意內容" }).textContent,
  ).toContain(orderA);
  view.rerender(
    <PassengerEmbed context={context as never} liveData={second as never} />,
  );
  expect(screen.queryByRole("region", { name: "付款示意內容" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "開啟外部付款模擬示意（SIM）" }),
  );
  const preview = screen.getByRole("region", { name: "付款示意內容" });
  expect(preview.textContent).toContain(orderB);
  expect(preview.textContent).not.toContain(orderA);
  expect(preview.textContent).toContain("實際車資待確認");
});
