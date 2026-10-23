// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";
import { ReferralComplaintPanel } from "../../../apps/referral-embed-web/components/referral-complaint-panel";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});

function baseContext(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    entry: {
      entrySlug: "demo-entry",
      displayName: "測試社區",
      entryHost: "partner.example.test",
      brandingMetadata: {},
    },
    session: {
      handoffId: "unit-handoff",
      recoveryScope: "unit-scope",
      identityActive: true,
      partnerEntrySlug: "demo-entry",
      entryHost: "partner.example.test",
    },
    state: "handoff",
    screen: "cancelled",
    requestedScreen: "cancelled",
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
    ...overrides,
  };
}

function historyItem(overrides: Partial<Record<string, unknown>>) {
  return {
    orderId: "ord_1",
    orderNo: "PT-1",
    pickupAddress: "起點",
    dropoffAddress: "終點",
    fareTotal: null,
    formattedFare: "實際車資待確認",
    cancelledAt: "2026-10-22T10:00:00Z",
    completedAt: null,
    createdAt: "2026-10-22T09:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("UI-01 terminal fare truthfulness", () => {
  it("never shows the fare-pending placeholder for a cancelled order with no recorded fare", () => {
    render(
      <PassengerEmbed
        context={baseContext({ screen: "cancelled" }) as never}
        liveData={
          {
            activeTrip: null,
            receipt: null,
            selectedOrderId: "ord_1",
            history: { items: [historyItem({ status: "cancelled" })] },
          } as never
        }
      />,
    );
    expect(screen.queryByText("實際車資待確認")).toBeNull();
    expect(screen.getByText("取消費")).toBeTruthy();
    expect(screen.getByText("不收")).toBeTruthy();
  });

  it("never shows the fare-pending placeholder for no_supply/dispatch_failed orders and states no fare was generated", () => {
    for (const status of ["no_supply", "dispatch_failed", "dispatch_timeout"]) {
      const { unmount } = render(
        <PassengerEmbed
          context={baseContext({ screen: "cancelled" }) as never}
          liveData={
            {
              activeTrip: null,
              receipt: null,
              selectedOrderId: "ord_1",
              history: { items: [historyItem({ status })] },
            } as never
          }
        />,
      );
      expect(screen.queryByText("實際車資待確認")).toBeNull();
      expect(screen.getByText(/未產生車資|本次派車失敗/)).toBeTruthy();
      unmount();
    }
  });

  it("preserves a finite recorded fare for a cancelled order while the dedicated cancellation-fee row stays unaffected", () => {
    render(
      <PassengerEmbed
        context={baseContext({ screen: "cancelled" }) as never}
        liveData={
          {
            activeTrip: null,
            receipt: null,
            selectedOrderId: "ord_1",
            history: {
              items: [
                historyItem({
                  status: "cancelled",
                  fareTotal: 999,
                  formattedFare: "NT$ 999",
                }),
              ],
            },
          } as never
        }
      />,
    );
    expect(screen.getByText("NT$ 999")).toBeTruthy();
    // The free-cancellation row always reads the fee-disclosure value, never the actual fare.
    expect(screen.getByText("不收")).toBeTruthy();
  });
});

describe("UI-02 localized outcome/negative state badges", () => {
  it("never leaks the raw no_supply/degraded/denied/ineligible protocol code in the negative-screen posture badge", () => {
    const cases: Array<[string, string, string]> = [
      ["denied", "未能受理", "denied"],
      ["ineligible", "資格未開通", "ineligible"],
      ["nosupply", "無可派車", "no_supply"],
      ["degraded", "服務不穩定", "degraded"],
    ];
    for (const [screenName, expected, rawCode] of cases) {
      const { unmount } = render(
        <PassengerEmbed
          context={baseContext({ screen: screenName }) as never}
        />,
      );
      expect(screen.getByText(expected)).toBeTruthy();
      expect(screen.queryByText(rawCode)).toBeNull();
      unmount();
    }
  });

  it("never leaks the literal completed/cancelled protocol word as the outcome posture badge", () => {
    render(
      <PassengerEmbed
        context={baseContext({ screen: "cancelled" }) as never}
        liveData={
          {
            activeTrip: null,
            receipt: null,
            selectedOrderId: "ord_1",
            history: { items: [historyItem({ status: "dispatch_failed" })] },
          } as never
        }
      />,
    );
    expect(screen.queryByText("cancelled")).toBeNull();
    expect(screen.getAllByText("派車失敗").length).toBeGreaterThan(0);
  });

  it("gives dispatch_failed/no_supply history rows a localized badge instead of the raw status code", () => {
    render(
      <PassengerEmbed
        context={baseContext({ screen: "trips" }) as never}
        liveData={
          {
            activeTrip: null,
            receipt: null,
            selectedOrderId: null,
            history: {
              items: [
                historyItem({ orderId: "a", status: "no_supply" }),
                historyItem({ orderId: "b", status: "dispatch_timeout" }),
              ],
            },
          } as never
        }
      />,
    );
    expect(screen.queryByText("no_supply")).toBeNull();
    expect(screen.queryByText("dispatch_timeout")).toBeNull();
    expect(screen.getAllByText("無可用車輛").length).toBeGreaterThan(0);
    expect(screen.getAllByText("派車失敗").length).toBeGreaterThan(0);
  });
});

describe("UI-05 no unproven acceptance/redispatch promises", () => {
  it("drops the automatic-redispatch promise from the no-supply negative screen", () => {
    render(
      <PassengerEmbed context={baseContext({ screen: "nosupply" }) as never} />,
    );
    expect(screen.queryByText(/補派/)).toBeNull();
  });

  it("drops the accepted-and-resuming promise from the degraded negative screen", () => {
    render(
      <PassengerEmbed context={baseContext({ screen: "degraded" }) as never} />,
    );
    expect(screen.queryByText(/已安全受理/)).toBeNull();
    expect(screen.queryByText(/自動繼續/)).toBeNull();
  });
});

describe("UI-07 negative-screen action targets", () => {
  it("routes each button to its own truthful destination instead of a uniform book/tel pair", () => {
    const { unmount: unmount1 } = render(
      <PassengerEmbed
        context={baseContext({ screen: "ineligible" }) as never}
      />,
    );
    const contactLink = screen.getByRole("link", { name: "聯絡社區客服" });
    expect(contactLink.getAttribute("href")).toBe("tel:0229440985");
    const returnLink = screen.getByRole("link", { name: "返回" });
    expect(returnLink.getAttribute("href")).toContain("screen=book");
    unmount1();

    const { unmount: unmount2 } = render(
      <PassengerEmbed context={baseContext({ screen: "nosupply" }) as never} />,
    );
    const changeTimeLink = screen.getByRole("link", { name: "改約時間" });
    expect(changeTimeLink.getAttribute("href")).toContain("screen=book");
    unmount2();

    render(
      <PassengerEmbed context={baseContext({ screen: "degraded" }) as never} />,
    );
    const viewStatusLink = screen.getByRole("link", { name: "查看狀態" });
    expect(viewStatusLink.getAttribute("href")).toContain("screen=trip");
    expect(viewStatusLink.getAttribute("href")).not.toContain("tel:");
  });
});

describe("UI-06 fallback demo screens are labeled as scenario illustration", () => {
  it("shows a clear scenario-demo notice on every fallback selector", () => {
    for (const fallbackScreen of [
      "vehicle_change_in_progress",
      "human_fallback_assigned",
      "service_continuing",
      "eta_updated",
    ]) {
      const { unmount } = render(
        <PassengerEmbed
          context={
            baseContext({
              screen: fallbackScreen,
              requestedScreen: fallbackScreen,
            }) as never
          }
        />,
      );
      expect(screen.getByText(/情境示範/)).toBeTruthy();
      unmount();
    }
  });
});

describe("UI-03/UI-04 complaint panel presentation", () => {
  it("styles the toggle control with the theme border/background and a minimum touch target", () => {
    render(
      <ReferralComplaintPanel
        orderId="ord_1"
        recoveryScope="unit-scope"
        accent="#123456"
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "行程申訴與遺失物",
    }) as HTMLButtonElement;
    expect(toggle.style.minHeight).toBe("44px");
    expect(toggle.style.borderRadius).toBe("12px");
  });

  it("wraps long case identifiers and shows Taipei-local submitted/updated times with an honest fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/CASE-LONG-IDENTIFIER-0001")) {
          return Response.json({
            ok: true,
            data: {
              orderId: "ord_1",
              caseNo: "CASE-LONG-IDENTIFIER-0001",
              category: "service",
              status: "new",
              content: "內容",
              contactRequested: false,
              submittedAt: "2026-10-22T16:30:00Z",
              updatedAt: "not-a-real-timestamp",
            },
          });
        }
        return Response.json({
          ok: true,
          data: {
            orderId: "ord_1",
            items: [
              {
                orderId: "ord_1",
                caseNo: "CASE-LONG-IDENTIFIER-0001",
                category: "service",
                status: "new",
              },
            ],
          },
        });
      }),
    );
    render(
      <ReferralComplaintPanel
        orderId="ord_1"
        recoveryScope="unit-scope"
        accent="#123456"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "行程申訴與遺失物" }));
    const caseButton = await screen.findByRole("button", {
      name: /CASE-LONG-IDENTIFIER-0001/,
    });
    expect((caseButton as HTMLButtonElement).style.overflowWrap).toBe(
      "anywhere",
    );
    fireEvent.click(caseButton);
    const detail = await screen.findByLabelText("申訴案件詳情");
    expect(within(detail).getByText(/2026-10-23 00:30/)).toBeTruthy();
    expect(within(detail).getByText(/臺北時間/)).toBeTruthy();
    expect(within(detail).getByText(/時間未知/)).toBeTruthy();
  });
});
