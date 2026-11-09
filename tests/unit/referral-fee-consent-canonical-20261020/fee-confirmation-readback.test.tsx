// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, getByText } from "@testing-library/dom";
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
  PASSENGER_FEE_DISCLOSURE_VERSION as version,
  PASSENGER_FEE_CONTENT_HASH as contentHash,
} from "@drts/contracts";
afterEach(() => {
  document.body.innerHTML = "";
});
const context = {
  entry: {
    entrySlug: "fee-entry",
    displayName: "測試合作入口",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "fee-handoff",
    recoveryScope: "fee-scope",
    identityActive: true,
    partnerEntrySlug: "fee-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "book",
  requestedScreen: "book",
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
const savedConfirmation = {
  tenantId: "own-tenant",
  partnerId: "own-partner",
  partnerProgramId: "own-program",
  entrySlug: "fee-entry",
  drtsPassengerId: "own-passenger",
  orderId: "same-fee-order",
  quoteId: "same-fee-quote",
  disclosureVersion: version,
  contentHash,
  quotedFareRuleVersion: "tariff-original",
  acknowledgedAt: "2026-10-20T01:00:00Z",
  feeConfirmedAt: "2026-10-20T04:05:00Z",
  summary: {
    pickupAddress: "本單原上車點",
    dropoffAddress: "本單原下車點",
    requestedScheduledAt: "2026-10-21T17:45:00Z",
    vehicleType: "standard",
    estimatedMin: 321,
    estimatedMax: 456,
  },
};
const historyItem = {
  orderId: "same-fee-order",
  orderNo: "OWN-1",
  status: "completed",
  pickupAddress: "本單原上車點",
  dropoffAddress: "本單原下車點",
  fareTotal: 888,
  formattedFare: "NT$ 888",
  completedAt: "2026-10-22T01:00:00Z",
  createdAt: "2026-10-20T04:04:00Z",
  feeConfirmation: savedConfirmation,
};
const receiptItem = {
  ...historyItem,
  passengerNameMasked: "測○○",
  passengerPhoneMasked: "0912***678",
  driverName: null,
  plateNumber: null,
  vehicleType: "standard",
  fareBase: 85,
  fareDistance: 703,
  fareTime: 100,
  fareNight: 0,
  totalFare: 888,
  formattedTotal: "NT$ 888",
  paymentChannel: "付款及結算狀態未提供",
};
function renderSurface(
  screen: "trip" | "trips" | "receipt",
  confirmation: typeof savedConfirmation | null = savedConfirmation,
) {
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <PassengerEmbed
      context={{ ...context, screen } as never}
      liveData={
        {
          activeTrip: {
            state: "active",
            trip: {
              ...historyItem,
              status: "driver_accepted",
              vehicleType: "standard",
              feeConfirmation: confirmation,
            },
          },
          history: {
            items: [{ ...historyItem, feeConfirmation: confirmation }],
          },
          receipt: { ...receiptItem, feeConfirmation: confirmation },
          selectedOrderId: "same-fee-order",
        } as never
      }
    />,
  );
  return host;
}
it.each(["trip", "trips", "receipt"] as const)(
  "reads the original same-order confirmed estimate on %s without replacing actual fare",
  (screen) => {
    const host = renderSurface(screen);
    expect(host.textContent).toContain("費用確認時間");
    expect(host.textContent).toContain("10-20 12:05");
    expect(host.textContent).toContain("321–456");
    expect(host.textContent).toContain("10-22 01:45");
    expect(host.textContent).toContain("標準車");
    expect(host.textContent).toContain("非保證價");
    expect(host.textContent).not.toContain("tariff-original");
    expect(host.textContent).not.toContain(contentHash);
    if (screen === "receipt") expect(host.textContent).toContain("NT$ 888");
  },
);

it.each(["trip", "trips", "receipt"] as const)(
  "keeps missing old-order confirmation explicit on %s",
  (screen) => {
    const host = renderSurface(screen, null);
    expect(host.textContent).toContain("未提供確認紀錄");
    expect(host.textContent).not.toContain("下單前確認內容");
    expect(host.textContent).not.toContain("321–456");
    expect(host.textContent).not.toContain("10-20 12:05");
  },
);
it.each(["trip", "trips", "receipt"] as const)(
  "preserves an older timestamp-only response without inventing a summary on %s",
  (screen) => {
    const host = renderSurface(screen, {
      feeConfirmedAt: savedConfirmation.feeConfirmedAt,
    } as typeof savedConfirmation);
    expect(host.textContent).toContain("10-20 12:05");
    expect(host.textContent).not.toContain("下單前確認內容");
    expect(host.textContent).not.toContain("321–456");
  },
);
it("keeps two historical orders' original confirmations separate", () => {
  const second = {
    ...historyItem,
    orderId: "second-order",
    orderNo: "OWN-2",
    feeConfirmation: {
      ...savedConfirmation,
      orderId: "second-order",
      feeConfirmedAt: "2026-10-21T04:06:00Z",
      summary: {
        ...savedConfirmation.summary,
        pickupAddress: "第二單原上車點",
        dropoffAddress: "第二單原下車點",
        estimatedMin: 901,
        estimatedMax: 999,
      },
    },
  };
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <PassengerEmbed
      context={{ ...context, screen: "trips" } as never}
      liveData={
        {
          activeTrip: null,
          history: { items: [historyItem, second] },
          receipt: null,
          selectedOrderId: null,
        } as never
      }
    />,
  );
  const rows = [...host.querySelectorAll("details")];
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row.closest("a")).toBeNull();
  const links = [...host.querySelectorAll("a")].filter((link) =>
    link.href.includes("orderId="),
  );
  expect(
    links.some((link) => link.href.includes("orderId=same-fee-order")),
  ).toBe(true);
  expect(links.some((link) => link.href.includes("orderId=second-order"))).toBe(
    true,
  );
  expect(rows[0]!.textContent).toContain("本單原上車點");
  expect(rows[0]!.textContent).toContain("321–456");
  expect(rows[0]!.textContent).not.toContain("901–999");
  expect(rows[1]!.textContent).toContain("第二單原上車點");
  expect(rows[1]!.textContent).toContain("901–999");
  expect(rows[1]!.textContent).not.toContain("321–456");
  expect(host.textContent).toContain("10-20 12:05");
  expect(host.textContent).toContain("10-21 12:06");
});
it("allows the passenger to reopen the saved confirmation without requesting any new quote or agreement", () => {
  const fetch = vi.fn(() => {
    throw new Error("Readback must not create external IO");
  });
  vi.stubGlobal("fetch", fetch);
  try {
    const host = renderSurface("receipt"),
      details = host.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(getByText(host, "下單前確認內容"));
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("321–456");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
