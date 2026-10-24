import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const orderId = "60ac512d-0000-4000-8000-000000000001";

const tripsContext = {
  entry: {
    entrySlug: "layout-entry",
    displayName: "測試社區",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "unit-handoff",
    recoveryScope: "unit-scope",
    identityActive: true,
    partnerEntrySlug: "layout-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "trips",
  requestedScreen: "trips",
  handoff: { apiKey: null, partnerUserRef: null },
  decision: { requestedEntryHost: "partner.example.test", block: false },
  accent: "#0F766E",
  strings: {
    appName: "測試社區",
    displayName: "測試社區",
    supportPhone: "02-2944-0985",
  },
  issues: [],
  fallbackEntry: null,
};

const tripsLiveData = {
  activeTrip: null,
  selectedOrderId: null,
  history: {
    items: [
      {
        orderId,
        orderNo: `O-${orderId}`,
        status: "completed",
        // As long as the bureau demo's real trip, which overflowed the phone.
        pickupAddress: "新北市板橋區縣民大道二段7號",
        dropoffAddress: "臺北市信義區市府路1號",
        createdAt: "2026-10-22T15:24:00Z",
        completedAt: "2026-10-22T15:25:00Z",
        fareTotal: 425,
        formattedFare: "NT$ 425",
        feeConfirmation: { feeConfirmedAt: "2026-10-22T15:24:00Z" },
      },
    ],
  },
  receipt: null,
};

it("lays out 我的行程 in one shrinkable column so a long trip line cannot widen the phone page", () => {
  const html = renderToStaticMarkup(
    <PassengerEmbed
      context={tripsContext as never}
      liveData={tripsLiveData as never}
    />,
  );
  expect(html).toContain("我的行程");
  expect(html).toContain("O-60AC512D");
  // The shell's content area and every card use a minmax(0, 1fr) column.
  expect(html).toMatch(
    /grid-template-columns:minmax\(0, 1fr\);align-content:start/,
  );
  const sections = html.match(/<section style="[^"]*"/g) ?? [];
  expect(sections.length).toBeGreaterThan(0);
  for (const section of sections)
    expect(section).toContain("grid-template-columns:minmax(0, 1fr)");
});
