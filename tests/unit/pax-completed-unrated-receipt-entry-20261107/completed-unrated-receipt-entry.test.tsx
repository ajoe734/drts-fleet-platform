/** @vitest-environment jsdom */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnedOrderRecord } from "@drts/contracts";
import type { PassengerRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";
import { authority } from "../pax-live-tracking-20261017/fixture";

const next = vi.hoisted(() => ({
  pathname: "/rides",
  navigations: [] as string[],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => next.pathname,
  useRouter: () => ({ push: (href: string) => next.navigations.push(href) }),
  notFound: () => {
    throw new Error("unexpected_missing_owned_ride");
  },
}));
vi.mock("../../../apps/passenger-app-web/node_modules/next/navigation", () => ({
  usePathname: () => next.pathname,
  useRouter: () => ({ push: (href: string) => next.navigations.push(href) }),
  notFound: () => {
    throw new Error("unexpected_missing_owned_ride");
  },
}));
// Only the Next browser boundary is controlled. The addressed Page and receipt
// route below are both actual existing product modules, not rewritten fixtures.
function createNextLinkBoundary() {
  return {
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <a
        {...rest}
        href={href}
        onClick={(event) => {
          event.preventDefault();
          next.navigations.push(href);
        }}
      >
        {children}
      </a>
    ),
  };
}
vi.mock("next/link", createNextLinkBoundary);
vi.mock(
  "../../../apps/passenger-app-web/node_modules/next/link",
  createNextLinkBoundary,
);

import RideDetailPage from "../../../apps/passenger-app-web/app/rides/[id]/page";
import RideReceiptPage from "../../../apps/passenger-app-web/app/rides/[id]/receipt/page";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";

const identity: PassengerRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "first_party_passenger",
  actorId: OWNER,
  realm: "passenger",
  tenantId: null,
  drtsPassengerId: OWNER,
  sessionId: "SIM-receipt-owner-session",
  roleFamilies: [],
  roles: [],
  scopes: [],
  requestId: null,
};

class BrowserEvents {
  static sources: BrowserEvents[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly listeners = new Map<string, (event: { data: string }) => void>();
  closed = false;
  constructor(readonly url: string) {
    BrowserEvents.sources.push(this);
  }
  addEventListener(name: string, callback: (event: { data: string }) => void) {
    this.listeners.set(name, callback);
  }
  close() {
    this.closed = true;
  }
}

async function backend(ageMs: number, rated = false, completed = true) {
  vi.setSystemTime(NOW);
  // Existing real booking transaction creates the legal order UUID and durable
  // owner mapping. No fake Page/client/canRate rule is used to make a RED.
  const booking = createProductionBookingFixture();
  const created = await booking.controller.createRide(
    identity,
    "SIM-owned-receipt-booking",
    booking.command,
  );
  const id = created.data.ride.order.orderId;
  expect(id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  const completedAtMs = NOW + 40 * 60_000;
  const completedAt = new Date(completedAtMs).toISOString();
  const observedNow = completedAtMs + ageMs;
  vi.setSystemTime(observedNow);
  const order: OwnedOrderRecord = {
    ...booking.state.order!,
    status: completed ? "completed" : "on_trip",
  };
  const disclosure = structuredClone(authority("completed").assignment!);
  disclosure.orderId = id;
  const htmlUrl = `/api/passenger-app/rides/${id}/receipt/artifacts/html`;
  const pdfUrl = `/api/passenger-app/rides/${id}/receipt/artifacts/pdf`;
  const receiptRecord = {
    tripId: id,
    plateNo: "SIM-CERT",
    pickupAt: new Date(Date.parse(completedAt) - 900_000).toISOString(),
    dropoffAt: completedAt,
    travelDurationSeconds: 900,
    routeSummary: "SIM pickup → SIM destination",
    distanceMeters: 4000,
    tollMinor: 0,
    consumerServicePhone: "02-2944-0985",
    authorityComplaintPhone: "1999",
    certificateState: "available",
    certificateVersion: "1",
    htmlUrl,
    pdfUrl,
    e04Snapshot: {
      fleetOperatorName: "SIM operator",
      driverSurname: "測",
      driverRegistrationMasked: "SIM***01",
      paymentMethodDisplay: "SIM credit card",
      fareBreakdown: {
        startMinor: 10000,
        distanceMinor: 20000,
        delayMinor: 0,
        nightMinor: 0,
      },
    },
  };
  const sqlCalls: string[] = [];
  // Only SQL responses are controlled, as in the original rating-window
  // regression. Actual Repository/Service calculate canRate from completion,
  // captured payment, existing rating and database clock; receipt is independent.
  const database = {
    isEnabled: () => true,
    query: async (sql: string, values: readonly unknown[] = []) => {
      sqlCalls.push(sql);
      expect(values[0]).toBe(id);
      if (sql.includes("FROM ops.phase1_owned_orders"))
        return { rows: [{ record: structuredClone(order) }] };
      if (sql.includes("FROM ops.passenger_dispatch_disclosure_snapshots"))
        return {
          rows: completed ? [{ record: structuredClone(disclosure) }] : [],
        };
      if (sql.includes("FROM ops.passenger_trip_ratings")) {
        expect(values[1]).toBe(OWNER);
        return {
          rows: rated
            ? [
                {
                  rating_id: "SIM-existing-rating",
                  order_id: id,
                  trip_id: id,
                  driver_id: disclosure.driver.driverId,
                  passenger_subject_ref: OWNER,
                  score: 5,
                  tags: [],
                  comment: null,
                  status: "valid",
                  submitted_at: completedAt,
                  updated_at: completedAt,
                },
              ]
            : [],
        };
      }
      if (sql.includes("FROM billing.multi_taxi_passenger_payments"))
        return {
          rows: [{ status: "captured", amount_minor: 30000, currency: "TWD" }],
        };
      if (sql.includes("FROM reporting.multi_taxi_electronic_receipts"))
        return {
          rows: completed
            ? [
                {
                  receipt_id: "SIM-issued-receipt",
                  order_id: id,
                  receipt_no: "SIM-E04-001",
                  amount_minor: 30000,
                  issued_at: completedAt,
                  record: structuredClone(receiptRecord),
                },
              ]
            : [],
        };
      if (sql.includes("FROM ops.phase1_driver_tasks")) {
        expect(values.slice(1)).toEqual([
          disclosure.assignmentId,
          disclosure.driver.driverId,
        ]);
        return {
          rows: [
            { completed_at: completedAt, database_now: new Date(observedNow) },
          ],
        };
      }
      if (sql.includes("FROM passenger.booking_histories")) return { rows: [] };
      throw new Error(`unexpected_authority_SQL:${sql}`);
    },
  };
  const repository = new MultiTaxiRepository(database as never);
  const owned = new OwnedMobilityService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    new OwnedMobilityRepository(database as never, repository),
  );
  const multi = new MultiTaxiService(owned, repository);
  const service = new PassengerBookingService(
    booking.bookingRepository,
    multi,
    booking.fareRepository,
    booking.accountRepository as never,
    undefined,
    { resolveActiveDevices: async () => [] } as never,
  );
  const controller = new PassengerBookingController(service, multi);
  const authoritative = (await controller.getRide(identity, id)).data.ride;
  expect(authoritative.order.orderId).toBe(id);
  expect(authoritative.order.status).toBe(completed ? "completed" : "on_trip");
  if (completed) {
    expect(authoritative.order.completedAt).toBe(completedAt);
    expect(authoritative.actions.canRate).toBe(!rated && ageMs <= 86_400_000);
    expect(authoritative.actions.canReadReceipt).toBe(true);
    expect(authoritative.receipt?.orderId).toBe(id);
    expect(sqlCalls.some((sql) => sql.includes("clock_timestamp()"))).toBe(
      true,
    );
  }
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (method !== "GET")
        throw new Error(`unexpected_UI_write:${method}:${url}`);
      if (url === "/api/passenger-app/review-demo/config")
        return Response.json({ data: { enabled: false } });
      if (url === `/api/passenger-app/rides/${id}`)
        return Response.json(
          deepToSnakeCase(await controller.getRide(identity, id)),
        );
      if (url === `/api/passenger-app/rides/${id}/receipt`)
        return Response.json(
          deepToSnakeCase(await controller.getReceipt(identity, id)),
        );
      throw new Error(`unexpected_UI_HTTP:${method}:${url}`);
    }),
  );
  return { id, htmlUrl, pdfUrl, calls, authoritative };
}

async function flush() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function mountRide(id: string) {
  next.pathname = `/rides/${id}`;
  const page = await RideDetailPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  });
  await act(async () => {
    render(<ReviewDemoProvider>{page}</ReviewDemoProvider>);
    await flush();
  });
}
async function followReceipt(f: Awaited<ReturnType<typeof backend>>) {
  const link = screen.getByRole("link", { name: "查看電子乘車證明" });
  expect(
    link.getAttribute("href"),
    "completed receipt entry must keep the original owned order UUID",
  ).toBe(`/rides/${f.id}/receipt`);
  fireEvent.click(link);
  expect(next.navigations).toEqual([`/rides/${f.id}/receipt`]);
  cleanup();
  next.pathname = next.navigations[0]!;
  const page = await RideReceiptPage({
    params: Promise.resolve({ id: f.id }),
    searchParams: Promise.resolve({}),
  });
  await act(async () => {
    render(<ReviewDemoProvider>{page}</ReviewDemoProvider>);
    await flush();
  });
  // Keep the accepted E-04 contract: PDF is preferred over its HTML fallback,
  // and the certificate number is masked on screen rather than exposed raw.
  expect(screen.queryByRole("link", { name: "下載 HTML" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "下載 PDF" }).getAttribute("href"),
  ).toBe(f.pdfUrl);
  expect(screen.getByRole("button", { name: "分享" })).toBeTruthy();
  expect(screen.getByText("證明編號 SIM-••-001 · 個資已遮碼")).toBeTruthy();
  expect(screen.queryByText("SIM-E04-001")).toBeNull();
  expect(
    screen.getByRole("link", { name: "返回行程" }).getAttribute("href"),
  ).toBe(`/rides/${f.id}`);
  expect(
    f.calls.filter((call) => call.url === `/api/passenger-app/rides/${f.id}`),
  ).toHaveLength(2);
  expect(f.calls.every((call) => call.method === "GET")).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
  vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
  vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
  vi.stubEnv("PASSENGER_RIDE_TOKEN_PEPPER", "");
  window.localStorage.clear();
  next.navigations = [];
  BrowserEvents.sources = [];
  vi.stubGlobal("EventSource", BrowserEvents);
});
afterEach(() => {
  cleanup();
  for (const source of BrowserEvents.sources) source.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("completed owned ride exposes its receipt independently of optional rating", () => {
  it("opens the same issued receipt after the backend rating window has expired without submitting a rating", async () => {
    const f = await backend(86_400_001);
    await mountRide(f.id);
    expect(
      (
        screen.getByRole("button", {
          name: "目前無法評分",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "4 星" }));
    expect(
      (
        screen.getByRole("button", {
          name: "目前無法評分",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("本次行程")).toBeTruthy();
    expect(screen.queryByText("付款狀態")).toBeNull();
    expect(screen.queryByText("SIM-E04-001")).toBeNull();
    await followReceipt(f);
  });
  it("keeps rating available within its real window while allowing receipt access without a rating POST", async () => {
    const f = await backend(3_600_000);
    await mountRide(f.id);
    expect(
      (screen.getByRole("button", { name: "送出評分" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // E-18 requires an explicit star before submission, but reading the
    // already-issued receipt never requires a rating write.
    fireEvent.click(screen.getByRole("button", { name: "4 星" }));
    expect(
      (screen.getByRole("button", { name: "送出評分" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(f.authoritative.rating).toBeNull();
    await followReceipt(f);
  });
  it("preserves the existing rated completion route and adds no completed actions to an unfinished ride", async () => {
    const rated = await backend(3_600_000, true);
    await mountRide(rated.id);
    expect(screen.getByText("感謝您的評價")).toBeTruthy();
    await followReceipt(rated);
    cleanup();
    next.navigations = [];
    const running = await backend(0, false, false);
    await mountRide(running.id);
    expect(screen.getByText("行程進行中")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "查看電子乘車證明" })).toBeNull();
    expect(screen.queryByRole("link", { name: "回到首頁" })).toBeNull();
    expect(running.calls.every((call) => call.method === "GET")).toBe(true);
  });
});
