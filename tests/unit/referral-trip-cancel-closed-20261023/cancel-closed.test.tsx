// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "../referral-cancellation-window-canonical-20261020/mounted-dom";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";
import { buildEmbedTheme } from "../../../apps/referral-embed-web/lib/embed-presentation";
import { LanguageProvider } from "../../../apps/referral-embed-web/lib/i18n";
import { PASSENGER_LOCALE_COOKIE } from "../../../apps/referral-embed-web/lib/locale-config";
import type { Locale } from "../../../apps/referral-embed-web/lib/translations";
import type { ReferralPassengerTripSnapshot } from "@drts/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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

function trip(
  canCancel: boolean,
  status = canCancel ? "assigned" : "on_trip",
): ReferralPassengerTripSnapshot {
  return {
    orderId: "60ac512d-0000-4000-8000-000000000001",
    orderNo: "O-60ac512d-0000-4000-8000-000000000001",
    status,
    statusCode: status,
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

function renderTrip(
  canCancel: boolean,
  locale: Locale = "zh",
  active = trip(canCancel),
) {
  localStorage.setItem(PASSENGER_LOCALE_COOKIE, locale);
  render(
    <LanguageProvider defaultLocale={locale}>
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
      />
    </LanguageProvider>,
  );
  return document.querySelector(
    '[data-drt-operation="referral-cancel"]',
  ) as HTMLButtonElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T02:29:00Z"));
  localStorage.removeItem(PASSENGER_LOCALE_COOKIE);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined)),
  );
});

afterEach(() => {
  cleanup();
  expect(vi.getTimerCount()).toBe(0);
  localStorage.removeItem(PASSENGER_LOCALE_COOKIE);
  vi.useRealTimers();
  vi.restoreAllMocks();
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

const localeCases = [
  { status: "assigned", window: "deadline", canCancel: true },
  { status: "arrived_pickup", window: "deadline", canCancel: true },
  { status: "arrived_pickup", window: "closed", canCancel: false },
  { status: "on_trip", window: "closed", canCancel: false },
  { status: "assigned", window: "no-deadline", canCancel: true },
  { status: "assigned", window: "unknown", canCancel: true },
] as const;

it.each(
  (["zh", "en"] as const).flatMap((locale) =>
    localeCases.map((scenario) => ({ ...scenario, locale })),
  ),
)("renders $locale $status with $window server window", (scenario) => {
  const active = trip(scenario.canCancel, scenario.status);
  if (scenario.window === "deadline") {
    active.cancellationWindow!.cancelableUntil = "2026-10-23T02:31:00Z";
  } else if (scenario.window === "unknown") {
    delete active.cancellationWindow;
  }
  const button = renderTrip(scenario.canCancel, scenario.locale, active);
  const en = scenario.locale === "en";
  const statusLabels = {
    assigned: en ? "Vehicle assigned" : "已派車",
    arrived_pickup: en ? "Driver has arrived" : "司機已抵達",
    on_trip: en ? "Trip in progress" : "行程中",
  };
  expect(screen.getByText(statusLabels[scenario.status])).toBeTruthy();
  expect(button.textContent).toBe(en ? "Cancel trip" : "取消行程");
  expect(button.disabled).toBe(!scenario.canCancel);
  expect(button.style.background).toBe(
    rgb(scenario.canCancel ? theme.dangerFg : theme.surfaceLo),
  );
  expect(
    screen.getByRole("button", {
      name: en ? "Ask support to contact the driver" : "客服協助聯絡司機",
    }),
  ).toBeTruthy();
  expect(screen.getByText(en ? "Trip tracking" : "行程追蹤")).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: en ? "Update trip status" : "更新行程狀態",
    }),
  ).toBeTruthy();
  const window = document.querySelector(
    '[data-drt-operation="referral-cancellation-window"]',
  )!;
  const messages = {
    deadline: en
      ? "You can cancel until 10/23/2026, 10:31:00 (Taiwan time; 120 seconds remaining). The system will confirm the trip status when you submit."
      : "可取消至 2026/10/23 10:31:00（台灣時間；剩餘 120 秒）。送出時仍由系統確認行程狀態。",
    closed: en
      ? "This trip can no longer be cancelled. Refer to the latest trip status."
      : "目前已無法取消此行程，請以最新行程狀態為準。",
    "no-deadline": en
      ? "You can request cancellation now. No fixed deadline was provided; the system will confirm the trip status when you submit."
      : "目前可提出取消，系統未提供固定截止時間；送出時仍由系統確認行程狀態。",
    unknown: en
      ? "Cancellation window information is unavailable. The system will check when you submit."
      : "目前未提供取消時段資訊，送出後由系統確認。",
  };
  const windowText = window.textContent!.replace(/\s/g, " ");
  expect(windowText).toContain(messages[scenario.window]);
  const asOf = window.querySelector("time");
  if (scenario.window === "unknown") {
    expect(asOf).toBeNull();
  } else {
    expect(asOf!.dateTime).toBe("2026-10-23T02:29:00Z");
    expect(windowText).toContain(
      en
        ? "Checked at: 10/23/2026, 10:29:00 (Taiwan time)"
        : "查詢時間：2026/10/23 10:29:00（台灣時間）",
    );
  }
});

it.each([503, 409])(
  "keeps English cancellation pending and handles HTTP %s without changing the command",
  async (status) => {
    let respond!: (value: Response) => void;
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => (respond = resolve)),
    );
    vi.stubGlobal("fetch", fetch);
    const button = renderTrip(true, "en");
    fireEvent.click(button);
    expect(button.textContent).toBe("Cancelling…");
    expect(button.disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`/api/referral/cancel/${trip(true).orderId}`);
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toEqual({
      idempotencyKey: expect.any(String),
    });
    await act(async () => {
      respond(
        Response.json(
          {
            ok: false,
            error: {
              code:
                status === 409
                  ? "ORDER_NOT_CANCELABLE"
                  : "UPSTREAM_UNAVAILABLE",
            },
          },
          { status },
        ),
      );
    });
    expect(screen.getByText("Unable to cancel this trip")).toBeTruthy();
    expect(button.textContent).toBe("Cancel trip");
    expect(button.disabled).toBe(status === 409);
    if (status === 409) {
      expect(
        screen.getByText(
          "This trip can no longer be cancelled. Refer to the latest trip status.",
        ),
      ).toBeTruthy();
      expect(button.style.background).toBe(rgb(theme.surfaceLo));
    }
  },
);

it("uses refreshed server cancellation authority while retaining the English locale", async () => {
  const active = trip(false, "on_trip");
  const fetch = vi.fn(async () =>
    Response.json({ ok: true, data: { active: true, trip: active } }),
  );
  vi.stubGlobal("fetch", fetch);
  const button = renderTrip(true, "en");
  expect(button.disabled).toBe(false);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Update trip status" }));
  });
  expect(screen.getByText("Trip in progress")).toBeTruthy();
  expect(button.disabled).toBe(true);
  expect(button.style.background).toBe(rgb(theme.surfaceLo));
  fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]).toEqual([
    "/api/referral/active",
    expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
  ]);
});
