// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

const base = {
  entry: {
    entrySlug: "support-entry",
    displayName: "測試社區",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "unit-handoff",
    recoveryScope: "unit-scope",
    identityActive: true,
    partnerEntrySlug: "support-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
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

const trip = {
  orderId: "60ac512d-0000-4000-8000-000000000001",
  orderNo: "O-60ac512d-0000-4000-8000-000000000001",
  status: "driver_accepted",
  statusCode: "driver_accepted",
  etaMin: 3,
  cancelWindowMin: 0,
  pickupAddress: "甲地",
  dropoffAddress: "乙地",
  driverName: "測試駕駛",
  driverPhoneMasked: "0912-***-000",
  plateNumber: "TEST-B001",
  vehicleType: "comfort",
  estimatedFare: 405,
  createdAt: "2026-10-23T02:28:00Z",
  updatedAt: "2026-10-23T02:29:00Z",
  rated: false,
  cancellationWindow: {
    canCancel: false,
    cancelableUntil: null,
    asOf: "2026-10-23T02:29:00Z",
  },
};

function renderTrip() {
  return render(
    <PassengerEmbed
      context={{ ...base, screen: "trip", requestedScreen: "trip" } as never}
      liveData={
        {
          activeTrip: { active: true, trip },
          selectedOrderId: trip.orderId,
          history: null,
          receipt: null,
        } as never
      }
    />,
  );
}

beforeEach(() => {
  // The trip screen polls the active trip; keep that read pending.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("客服協助聯絡司機 opens the support panel instead of launching the dialer", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  renderTrip();
  const trigger = screen.getByRole("button", { name: "客服協助聯絡司機" });
  expect(trigger.closest("a")).toBeNull();
  expect(screen.queryByRole("region", { name: "透過客服聯絡司機" })).toBeNull();

  fireEvent.click(trigger);
  const panel = screen.getByRole("region", { name: "透過客服聯絡司機" });
  expect(panel.textContent).toContain("為保護雙方隱私，不提供司機電話");
  expect(panel.textContent).toContain("O-60AC512D");
  expect(panel.textContent).toContain("02-2944-0985");
  expect(
    within(panel).getByRole("link", { name: "撥打客服" }).getAttribute("href"),
  ).toBe("tel:0229440985");

  fireEvent.click(within(panel).getByRole("button", { name: "複製號碼" }));
  expect(writeText).toHaveBeenCalledWith("02-2944-0985");
  await waitFor(() =>
    expect(within(panel).getByRole("button", { name: "已複製" })).toBeTruthy(),
  );

  fireEvent.click(within(panel).getByRole("button", { name: "關閉" }));
  expect(screen.queryByRole("region", { name: "透過客服聯絡司機" })).toBeNull();
});

it("asks the rider to note the number when the clipboard is unavailable", () => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
  renderTrip();
  fireEvent.click(screen.getByRole("button", { name: "客服協助聯絡司機" }));
  const panel = screen.getByRole("region", { name: "透過客服聯絡司機" });
  fireEvent.click(within(panel).getByRole("button", { name: "複製號碼" }));
  expect(within(panel).getByRole("status").textContent).toBe(
    "無法自動複製，請手動記下號碼。",
  );
});

it("the reassigned-vehicle screen uses the same support panel", () => {
  render(
    <PassengerEmbed
      context={
        {
          ...base,
          screen: "human_fallback_assigned",
          requestedScreen: "human_fallback_assigned",
        } as never
      }
      liveData={null as never}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "客服協助聯絡司機" }));
  const panel = screen.getByRole("region", { name: "透過客服聯絡司機" });
  expect(panel.textContent).toContain("PT-9F20K7");
  expect(
    within(panel).getByRole("link", { name: "撥打客服" }).getAttribute("href"),
  ).toBe("tel:0229440985");
});
