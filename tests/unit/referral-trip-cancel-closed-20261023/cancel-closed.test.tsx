// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
} from "../referral-cancellation-window-canonical-20261020/mounted-dom";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";
import { buildEmbedTheme } from "../../../apps/referral-embed-web/lib/embed-presentation";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const accent = "#0F766E";
const theme = buildEmbedTheme(accent);
const context = {
  entry: {
    entrySlug: "cancel-entry",
    displayName: "測試社區",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "unit-handoff",
    recoveryScope: "unit-scope",
    identityActive: true,
    partnerEntrySlug: "cancel-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "trip",
  requestedScreen: "trip",
  handoff: { apiKey: null, partnerUserRef: null },
  decision: { requestedEntryHost: "partner.example.test", block: false },
  accent,
  strings: {
    appName: "測試社區",
    displayName: "測試社區",
    supportPhone: "02-2944-0985",
  },
  issues: [],
  fallbackEntry: null,
};

function trip(canCancel: boolean) {
  return {
    orderId: "60ac512d-0000-4000-8000-000000000001",
    orderNo: "O-60ac512d-0000-4000-8000-000000000001",
    status: "on_trip",
    statusCode: "on_trip",
    etaMin: null,
    cancelWindowMin: 0,
    pickupAddress: "甲地",
    dropoffAddress: "乙地",
    driverName: "測試駕駛",
    driverPhoneMasked: null,
    plateNumber: "TEST-B001",
    vehicleType: "comfort",
    estimatedFare: 405,
    createdAt: "2026-10-23T02:28:00Z",
    updatedAt: "2026-10-23T02:29:00Z",
    rated: false,
    cancellationWindow: {
      canCancel,
      cancelableUntil: null,
      asOf: "2026-10-23T02:29:00Z",
    },
  };
}

function renderTrip(canCancel: boolean) {
  const active = trip(canCancel);
  render(
    <PassengerEmbed
      context={context as never}
      liveData={
        {
          activeTrip: { active: true, trip: active },
          selectedOrderId: active.orderId,
          history: null,
          receipt: null,
        } as never
      }
    />,
  );
  return document.querySelector(
    '[data-drt-operation="referral-cancel"]',
  ) as HTMLButtonElement;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** jsdom normalizes colors to rgb(); compare against the theme's hex. */
function rgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

it("shows a closed cancellation as a disabled grey button, not an active red one", () => {
  const button = renderTrip(false);
  expect(
    screen.getByText("目前已無法取消此行程，請以最新行程狀態為準。", {
      exact: false,
    }),
  ).toBeTruthy();
  expect(button.disabled).toBe(true);
  expect(button.style.background).toBe(rgb(theme.surfaceLo));
  expect(button.style.color).toBe(rgb(theme.faint));
  expect(button.style.cursor).toBe("not-allowed");
});

it("keeps an open cancellation red and tappable", () => {
  const button = renderTrip(true);
  expect(button.disabled).toBe(false);
  expect(button.style.background).toBe(rgb(theme.dangerFg));
  expect(button.style.cursor).toBe("pointer");
});
