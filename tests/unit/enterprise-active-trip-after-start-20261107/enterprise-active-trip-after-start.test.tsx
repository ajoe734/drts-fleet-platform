import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookingRecord,
  OwnedOrderStatus,
  TenantDashboardSummary,
} from "@drts/contracts";

// Next's request context and the app's existing presentational wrappers are
// boundaries. TripPage, session verification, tenant client, SDK pagination,
// status selection and contact-action component remain the actual modules.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "drts_tenant_session"
        ? { name, value: "sim-tenant-session" }
        : undefined,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href, ...rest }, children),
}));

// Root Vitest's @ alias belongs to another app. These three presentation
// boundaries follow the existing enterprise caller regression's convention.
vi.mock(
  "../../../apps/enterprise-dispatch-web/components/enterprise-shell",
  () => ({
    EntPageHead: ({ title }: { title: React.ReactNode }) =>
      React.createElement("header", null, title),
  }),
);

vi.mock(
  "../../../apps/enterprise-dispatch-web/components/ent-screen-bits",
  () => ({
    EntProgressRail: ({ active }: { active: number }) =>
      React.createElement("div", {
        "data-testid": "sim-progress-rail",
        "data-active-stage": active,
      }),
    EntRoute: ({ from, to, win }: { from: string; to: string; win: string }) =>
      React.createElement("div", null, from, " / ", to, " / ", win),
  }),
);

vi.mock(
  "../../../apps/enterprise-dispatch-web/components/enterprise-state-page",
  () => ({
    EnterpriseGatePage: ({ kind }: { kind: string }) =>
      React.createElement("div", {
        "data-testid": `enterprise-gate-${kind}`,
      }),
  }),
);

import TripPage from "../../../apps/enterprise-dispatch-web/app/trip/page";
import { t } from "../../../apps/enterprise-dispatch-web/lib/translations";

const NOW = new Date("2026-11-07T10:00:00.000Z");
const PAST_START = "2026-11-07T09:00:00.000Z";
const FUTURE_START = "2026-11-07T11:00:00.000Z";
const TENANT = "10000000-0000-0000-0000-000000000201";
const BOOKING = "20000000-0000-0000-0000-000000000301";
const ORDER = "30000000-0000-0000-0000-000000000401";

function booking(
  orderStatus: OwnedOrderStatus,
  reservationWindowStart = PAST_START,
  bookingId = BOOKING,
): BookingRecord {
  return {
    bookingId,
    orderId: bookingId === BOOKING ? ORDER : `order-${bookingId}`,
    tenantId: TENANT,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    status:
      orderStatus === "completed" || orderStatus === "cancelled"
        ? orderStatus
        : "active",
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    bookingType: "oneway",
    reservationWindowStart,
    reservationWindowEnd: new Date(
      Date.parse(reservationWindowStart) + 30 * 60 * 1000,
    ).toISOString(),
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    pickup: { address: "SIM canonical pickup", lat: 25.03, lng: 121.56 },
    dropoff: { address: "SIM canonical dropoff", lat: 25.08, lng: 121.23 },
    passenger: { name: "SIM passenger", phone: "0000000000" },
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes: null,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    approvalState: "not_required",
    approvalRequestIds: [],
    orderStatus,
    createdAt: "2026-11-06T09:00:00.000Z",
    updatedAt: NOW.toISOString(),
  };
}

function dashboard(rows: BookingRecord[]): TenantDashboardSummary {
  return {
    tenantId: TENANT,
    periodMonth: "2026-11",
    bookingCount: rows.length,
    completedTripCount: rows.filter((row) => row.orderStatus === "completed")
      .length,
    cancelledTripCount: rows.filter((row) => row.orderStatus === "cancelled")
      .length,
    noShowTripCount: 0,
    pendingApprovalCount: 0,
    pendingExceptionCount: 0,
    estimatedPayableAmountMinor: 0,
    issuedInvoiceAmountMinor: 0,
    unpaidInvoiceAmountMinor: 0,
    costCenterWarnings: [],
    // Actual backend dashboard contract: future reservation window only,
    // earliest first, at most five; this intentionally omits an ongoing ride.
    upcomingBookings: rows
      .filter((row) => Date.parse(row.reservationWindowStart) >= NOW.getTime())
      .sort(
        (left, right) =>
          Date.parse(left.reservationWindowStart) -
          Date.parse(right.reservationWindowStart),
      )
      .slice(0, 5)
      .map((row) => ({
        bookingId: row.bookingId,
        orderId: row.orderId,
        serviceProduct: row.businessDispatchSubtype,
        status: row.orderStatus,
        reservationWindowStart: row.reservationWindowStart,
        reservationWindowEnd: row.reservationWindowEnd,
        passengerName: row.passenger.name,
        pickupAddress: row.pickup.address,
        dropoffAddress: row.dropoff.address,
        costCenterCode: row.costCenter,
        tenantServiceProgramId: null,
      })),
  };
}

function installHttpSim(rows: BookingRecord[], readStatus = 200) {
  const calls: string[] = [];
  const bookingPages: number[] = [];
  const response = (data: unknown) =>
    new Response(JSON.stringify({ data, meta: {} }), { status: 200 });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = new URL(
        input instanceof Request ? input.url : String(input),
      );
      expect(target.origin).toBe("https://enterprise-trip-sim.invalid");
      expect(init?.method ?? "GET").toBe("GET");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer sim-tenant-session");
      calls.push(target.pathname);
      if (target.pathname === "/api/auth/session") {
        return response({
          active: true,
          identity: {
            realm: "tenant",
            tenant_id: TENANT,
            actor_id: "sim-tenant-user",
            scopes: ["tenant:read"],
          },
        });
      }

      expect(headers.get("x-tenant-id")).toBe(TENANT);
      if (
        target.pathname !== "/api/tenant/dashboard" &&
        target.pathname !== "/api/tenant/bookings"
      ) {
        throw new Error(`Unexpected SIM request ${target.pathname}`);
      }
      if (readStatus !== 200) {
        return new Response(
          JSON.stringify({
            error: { code: "SIM_READ_FAILED", message: "SIM read failed" },
          }),
          { status: readStatus },
        );
      }
      if (target.pathname === "/api/tenant/dashboard") {
        return response(dashboard(rows));
      }

      const page = Number(target.searchParams.get("page"));
      const pageSize = Number(target.searchParams.get("pageSize"));
      expect(pageSize).toBe(100);
      expect(page).toBeGreaterThanOrEqual(1);
      bookingPages.push(page);
      // Actual tenant list default is descending reservation start, whereas
      // dashboard upcoming is ascending. Preserve that difference in the SIM.
      const ordered = [...rows].sort(
        (left, right) =>
          Date.parse(right.reservationWindowStart) -
            Date.parse(left.reservationWindowStart) ||
          left.bookingId.localeCompare(right.bookingId),
      );
      return response({
        items: ordered.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
          page,
          pageSize,
          totalItems: rows.length,
          totalPages: Math.ceil(rows.length / pageSize),
        },
      });
    }),
  );
  return { calls, bookingPages };
}

async function html() {
  return renderToStaticMarkup(await TripPage());
}

function expectActiveTrip(markup: string, row: BookingRecord, stage: number) {
  expect(markup).toContain(`href="/bookings/${row.bookingId}"`);
  expect(markup).toContain('data-testid="enterprise-trip-detail-link"');
  expect(markup).toContain('data-testid="enterprise-trip-contact-driver"');
  expect(markup).toContain(`data-active-stage="${stage}"`);
  expect(markup).toContain(
    t(`status.order.${row.orderStatus}`, undefined, "zh"),
  );
  expect(markup).toContain(row.pickup.address);
  expect(markup).toContain(row.dropoff.address);
  expect(markup).not.toContain('data-testid="enterprise-trip-empty"');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("DRTS_API_URL", "https://enterprise-trip-sim.invalid");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  vi.stubGlobal("window", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Enterprise current trip uses the canonical tenant booking lifecycle", () => {
  it("keeps the same booking visible through driver execution after reservation start", async () => {
    const lifecycle: Array<[OwnedOrderStatus, number]> = [
      ["assigned", 0],
      ["driver_accepted", 0],
      ["enroute_pickup", 1],
      ["arrived_pickup", 2],
      ["on_trip", 3],
      ["proof_pending", 3],
    ];
    for (const [status, stage] of lifecycle) {
      const row = booking(status);
      expect(dashboard([row]).upcomingBookings).toEqual([]);
      const sim = installHttpSim([row]);
      expectActiveTrip(await html(), row, stage);
      expect(sim.calls[0]).toBe("/api/auth/session");
      expect(sim.bookingPages).toEqual([1]);
    }
  });

  it("reads later pages and preserves the earlier active ride ahead of future assignments", async () => {
    const future = Array.from({ length: 100 }, (_, index) =>
      booking(
        index === 0 ? "assigned" : "ready_for_dispatch",
        FUTURE_START,
        `future-booking-${String(index).padStart(3, "0")}`,
      ),
    );
    const current = booking("on_trip");
    const sim = installHttpSim([...future, current]);
    const markup = await html();
    expectActiveTrip(markup, current, 3);
    expect(markup).not.toContain('href="/bookings/future-booking-000"');
    expect(sim.bookingPages).toEqual([1, 2]);
  });

  it("preserves future assignment, unassigned and terminal states and existing error UI", async () => {
    const futureAssigned = booking("assigned", FUTURE_START);
    installHttpSim([futureAssigned]);
    expectActiveTrip(await html(), futureAssigned, 0);

    for (const status of [
      "created",
      "ready_for_dispatch",
      "completed",
      "cancelled",
    ] as const) {
      // Even a future terminal row must never appear as an executing trip.
      installHttpSim([booking(status, FUTURE_START)]);
      const markup = await html();
      expect(markup).toContain('data-testid="enterprise-trip-empty"');
      expect(markup).not.toContain('data-testid="enterprise-trip-detail-link"');
      expect(markup).not.toContain(
        'data-testid="enterprise-trip-contact-driver"',
      );
    }

    for (const [status, gate] of [
      [401, "auth-required"],
      [403, "auth-required"],
      [503, "degraded"],
    ] as const) {
      installHttpSim([booking("on_trip")], status);
      expect(await html()).toContain(`data-testid="enterprise-gate-${gate}"`);
    }
  });
});
