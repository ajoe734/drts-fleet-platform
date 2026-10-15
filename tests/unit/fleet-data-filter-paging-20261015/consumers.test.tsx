// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { resolve } from "node:path";
import * as sdk from "../../../packages/api-client/src";
import * as contracts from "@drts/contracts";
import { ApiClient } from "../../../packages/api-client/src";
import type {
  FleetPartnerPortalDriverRecord,
  FleetPartnerPortalTripRecord,
} from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import type {
  DashboardView,
  DriversView,
  TripsView,
} from "../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server";

const period = "2026-09";
const money = { currency: "TWD", amountMinor: 10000 };
function trip(
  id: string,
  subtype: FleetPartnerPortalTripRecord["businessDispatchSubtype"],
): FleetPartnerPortalTripRecord {
  return {
    orderId: id,
    fleetPartnerId: "fleet-test",
    driverId: "driver-test",
    driverName: "Match Driver",
    vehicleId: null,
    vehiclePlateNo: null,
    status: "completed",
    completedAt: `${period}-15T10:00:00Z`,
    orderSource: "business_dispatch",
    businessDispatchSubtype: subtype,
    grossEarning: money,
    subsidy: money,
    serviceProduct: null,
    tenantServiceProgramId: null,
    sourcePlatform: null,
    fleetShareAmount: money,
    settlementChannelKey: "drts_direct",
    sponsorFunded: false,
    partnerId: null,
    partnerProgramId: null,
    benefitReference: null,
    issuerAuthorizationRef: null,
    reimbursementAmount: null,
    passengerName: null,
    pickupAddress: "Match Pickup",
    dropoffAddress: null,
    reservationWindowStart: null,
    reservationWindowEnd: null,
  };
}
function driver(
  id: string,
  workState: FleetPartnerPortalDriverRecord["workState"],
): FleetPartnerPortalDriverRecord {
  return {
    affiliationId: `aff-${id}`,
    driverId: id,
    fleetPartnerId: "fleet-test",
    driverGroupId: null,
    affiliationType: "managed_by",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    name: `Driver ${id}`,
    workState,
    licensesValid: true,
    lifecycleStatus: "active",
    dispatchEligible: workState === "available",
    supportedServiceBuckets: ["standard_taxi"],
    currentVehicleId: null,
    currentVehiclePlateNo: null,
  };
}
function aggregate(count = 6, online = 5) {
  return {
    fleetPartnerId: "fleet-test",
    periodMonth: period,
    activeDriverCount: count,
    onlineDriverCount: online,
    dispatchEligibleDriverCount: 1,
    totalVehicleCount: 0,
    dispatchableVehicleCount: 0,
    completedTripCount: 0,
    inFlightTripCount: 0,
    proofPendingTripCount: 0,
    pendingStatementCount: 0,
    latestStatementPeriodMonth: null,
    grossEarningAmount: money,
    shareAmount: money,
  };
}
// Simulate the API interceptor's wire casing only. The actual SDK normalizes it.
function snake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snake);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        snake(v),
      ]),
    );
  return value;
}
type Page = (props: {
  searchParams?: Promise<Record<string, string>>;
}) => Promise<React.ReactElement>;
function harness(
  trips: FleetPartnerPortalTripRecord[] = [],
  drivers: FleetPartnerPortalDriverRecord[] = [],
  wireSnake = false,
) {
  const appRoot = resolve("apps/fleet-partner-portal-web");
  const state = {
    trips,
    drivers,
    aggregate: aggregate(),
    tripsDown: false,
    driversDown: false,
    aggregateDown: false,
  };
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    let data: unknown;
    if (url.pathname.endsWith("/trips")) {
      if (state.tripsDown)
        return new Response("Trips unavailable", { status: 503 });
      data = {
        items: state.trips,
        pageInfo: { totalItems: state.trips.length },
      };
    } else if (url.pathname.endsWith("/drivers")) {
      if (state.driversDown)
        return new Response("Drivers unavailable", { status: 503 });
      data = {
        items: state.drivers,
        pageInfo: { totalItems: state.drivers.length },
      };
    } else if (url.pathname.endsWith("/dashboard")) {
      if (state.aggregateDown)
        return new Response("Aggregate unavailable", { status: 503 });
      data = state.aggregate;
    } else throw new Error(`Unexpected API path ${url.pathname}`);
    return new Response(
      JSON.stringify({ data: wireSnake ? snake(data) : data }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new ApiClient({ baseUrl: "https://api.test" });
  const getServerFleetPartnerClient = async () => ({
    client,
    fleetPartnerId: "fleet-test",
  });
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "@drts/api-client": sdk,
    "@drts/contracts": contracts,
    "server-only": {},
    "./api-client.server": { getServerFleetPartnerClient },
    "../../lib/api-client.server": { getServerFleetPartnerClient },
    "@/lib/api-client.server": { getServerFleetPartnerClient },
    "@/lib/server-locale": { getServerLocale: async () => "en" },
    "next/navigation": {
      useRouter: () => ({ refresh: vi.fn() }),
      useSearchParams: () => new URLSearchParams(),
    },
    "next/server": { NextRequest, NextResponse },
  });
  const data = load<{
    loadTrips: (p?: string) => Promise<TripsView>;
    loadDrivers: () => Promise<DriversView>;
    loadDashboard: (p?: string) => Promise<DashboardView>;
  }>(resolve(appRoot, "lib/fleet-portal-data.server.ts"));
  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      children: React.ReactNode;
      defaultLocale: "en";
    }>;
  }>(resolve(appRoot, "lib/i18n.tsx"));
  return {
    state,
    data,
    fetchMock,
    trips: load<{ default: Page }>(resolve(appRoot, "app/trips/page.tsx"))
      .default,
    drivers: load<{ default: Page }>(resolve(appRoot, "app/drivers/page.tsx"))
      .default,
    index: load<{ default: Page }>(resolve(appRoot, "app/page.tsx")).default,
    dashboard: load<{ default: Page }>(
      resolve(appRoot, "app/dashboard/page.tsx"),
    ).default,
    csv: load<{ GET: (r: NextRequest) => Promise<Response> }>(
      resolve(appRoot, "app/trips/export/route.ts"),
    ).GET,
    wrap: (el: React.ReactElement) =>
      render(<LanguageProvider defaultLocale="en">{el}</LanguageProvider>),
  };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pairs = [
  ["insurance_replacement_vehicle", "insurance", "Insurance replacement"],
  ["travel_agency_transfer", "travel", "Travel agency"],
  ["enterprise_dispatch", "business", "Business dispatch"],
  ["credit_card_airport_transfer", "airport", "Airport transfer"],
] as const;

describe("C069 legitimate producer subtypes through SDK, mapper, badges and CSV", () => {
  it.each([false, true])(
    "preserves all subtype categories with snake wire=%s",
    async (wireSnake) => {
      const h = harness(
        pairs.map(([subtype], i) => trip(`order-${i}`, subtype)),
        [],
        wireSnake,
      );
      const view = await h.data.loadTrips(period);
      expect(view.error).toBeNull();
      expect(view.rows.map((r) => r.svc)).toEqual(pairs.map(([, svc]) => svc));
      for (const [i, [, svc]] of pairs.entries()) {
        const ui = h.wrap(
          await h.trips({
            searchParams: Promise.resolve({
              period,
              svc,
              q: "MATCH",
              status: "completed",
            }),
          }),
        );
        const rows = within(screen.getByRole("table")).getAllByRole("row");
        expect(rows).toHaveLength(2);
        expect(rows[1]?.textContent).toContain(`order-${i}`);
        const response = await h.csv(
          new NextRequest(
            `https://portal.test/trips/export?period=${period}&svc=${svc}&q=MATCH&status=completed&page=999`,
          ),
        );
        const csv = await response.text();
        expect(response.status).toBe(200);
        expect(csv.trim().split("\n")).toHaveLength(2);
        expect(csv).toContain(`order-${i},${svc},`);
        ui.unmount();
      }
      expect(
        h.fetchMock.mock.calls.every(
          ([input]) =>
            new URL(String(input)).searchParams.get("periodMonth") === period,
        ),
      ).toBe(true);
    },
  );
});

function multiPageTrips() {
  // Larger than the established Host list page size (20), with excluded rows
  // both inside and outside that window. Filter first, then slice.
  return [
    ...Array.from({ length: 45 }, (_, i) =>
      trip(`matching-${String(i).padStart(2, "0")}`, "enterprise_dispatch"),
    ),
    {
      ...trip("cancelled", "enterprise_dispatch"),
      status: "cancelled" as const,
    },
    {
      ...trip("not-query", "enterprise_dispatch"),
      driverName: "Other",
      pickupAddress: "Elsewhere",
    },
    trip("other-service", "travel_agency_transfer"),
  ];
}
describe("C069 actual trips page pagination and whole matching export", () => {
  it("navigates all pages with the same scope, full badges and total; filter links and form reset page", async () => {
    const h = harness(multiPageTrips());
    let params: Record<string, string> = {
      period,
      svc: "business",
      status: "completed",
      q: "MATCH",
    };
    const seen: string[] = [];
    for (const pageSize of [20, 20, 5]) {
      const ui = h.wrap(
        await h.trips({ searchParams: Promise.resolve(params) }),
      );
      const table = screen.getByRole("table");
      const rows = within(table).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(pageSize);
      seen.push(...rows.map((r) => r.textContent!.match(/matching-\d+/)![0]));
      expect(screen.getByText(/45.*(?:page|Page)/)).toBeTruthy();
      const travelTab = screen.getByRole("link", { name: /Travel.*1/ });
      expect(
        new URL(
          travelTab.getAttribute("href")!,
          "https://portal.test",
        ).searchParams.has("page"),
      ).toBe(false);
      expect(ui.container.querySelector('form input[name="page"]')).toBeNull();
      const exportHref = screen
        .getByRole("link", { name: "Export" })
        .getAttribute("href")!;
      const csv = await h.csv(
        new NextRequest(new URL(exportHref, "https://portal.test")),
      );
      expect((await csv.text()).trim().split("\n")).toHaveLength(46);
      const next = screen.queryByRole("link", { name: "Next" });
      if (next) {
        const nextParams = new URL(
          next.getAttribute("href")!,
          "https://portal.test",
        ).searchParams;
        expect(
          Object.fromEntries([...nextParams].filter(([k]) => k !== "page")),
        ).toEqual({ period, svc: "business", status: "completed", q: "MATCH" });
        params = Object.fromEntries(nextParams);
        if (params.page === "3") {
          expect(
            screen.getByRole("link", { name: "Previous" }).getAttribute("href"),
          ).not.toContain("page=");
        }
      } else expect(rows).toHaveLength(5);
      ui.unmount();
    }
    expect(new Set(seen).size).toBe(45);
    expect(seen).toHaveLength(45);
  });
  it.each(["0", "-2", "abc", "1.5", "Infinity"])(
    "normalizes invalid page %s to first page",
    async (page) => {
      const h = harness(multiPageTrips());
      h.wrap(
        await h.trips({
          searchParams: Promise.resolve({
            period,
            svc: "business",
            status: "completed",
            q: "MATCH",
            page,
          }),
        }),
      );
      expect(
        within(screen.getByRole("table")).getAllByRole("row"),
      ).toHaveLength(21);
      expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
    },
  );
  it("clamps a stale page, preserves unknown-service empty and real error/zero behavior", async () => {
    const h = harness(multiPageTrips());
    let ui = h.wrap(
      await h.trips({
        searchParams: Promise.resolve({
          period,
          svc: "business",
          q: "MATCH",
          status: "completed",
          page: "999",
        }),
      }),
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      6,
    );
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    ui.unmount();
    ui = h.wrap(
      await h.trips({
        searchParams: Promise.resolve({ period, svc: "unknown", page: "999" }),
      }),
    );
    expect(screen.queryByRole("table")).toBeNull();
    const empty = await h.csv(
      new NextRequest(
        `https://portal.test/trips/export?period=${period}&svc=unknown`,
      ),
    );
    expect((await empty.text()).trim().split("\n")).toHaveLength(1);
    ui.unmount();
    h.state.trips = [];
    expect(await h.data.loadTrips(period)).toMatchObject({
      rows: [],
      source: "live",
      error: null,
    });
    h.state.tripsDown = true;
    expect((await h.data.loadTrips(period)).error).toBeTruthy();
    expect(
      (
        await h.csv(
          new NextRequest(`https://portal.test/trips/export?period=${period}`),
        )
      ).status,
    ).toBe(500);
  });
});

describe("C063 shared display projection with complete affiliation roster and fallback", () => {
  it.each([false, true])(
    "overview/list agree for held drivers, aggregate unavailable=%s",
    async (aggregateDown) => {
      const records = [
        driver("available", "available"),
        driver("paused", "paused"),
        driver("trip", "on_trip"),
        driver("offline", "offline"),
        driver("suspended", "suspended"),
        driver("hold", "incident_hold"),
      ];
      const h = harness([], records);
      h.state.aggregateDown = aggregateDown;
      const view = await h.data.loadDrivers();
      expect(view.rows.map((r) => r.status)).toEqual([
        "available",
        "break",
        "on_trip",
        "offline",
        "offline",
        "offline",
      ]);
      expect(view.rows.map((r) => r.dispatchEligible)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
      const dashboard = await h.data.loadDashboard(period);
      expect(dashboard.driverStatusSummary).toEqual({
        online: "3",
        offline: "3",
      });
      expect(dashboard.driverCount).toBe("6");
      for (const page of [h.index, h.dashboard]) {
        const ui = h.wrap(
          await page({ searchParams: Promise.resolve({ period }) }),
        );
        expect(ui.container.textContent).toContain("online 3 · offline 3");
        ui.unmount();
      }
      const ui = h.wrap(
        await h.drivers({
          searchParams: Promise.resolve({ q: "suspended", tab: "all" }),
        }),
      );
      expect(
        within(screen.getByRole("table")).getAllByRole("row"),
      ).toHaveLength(2);
      expect(
        within(screen.getByRole("table")).getByText("Offline"),
      ).toBeTruthy();
      ui.unmount();
      // Two affiliations for one driver remain two roster entries (no dedup).
      h.state.drivers.push({
        ...records[0]!,
        affiliationId: "second-affiliation",
      });
      const full = await h.data.loadDashboard(period);
      expect(full.driverCount).toBe("7");
      expect(full.driverStatusSummary).toEqual({ online: "4", offline: "3" });
    },
  );
  it("keeps aggregate fallback for unavailable list, then unavailable marker when both fail; live empty stays zero", async () => {
    const h = harness();
    h.state.driversDown = true;
    expect(await h.data.loadDashboard(period)).toMatchObject({
      driverCount: "6",
      driverStatusSummary: { online: "5", offline: "1" },
      driversError: expect.any(String),
    });
    h.state.aggregateDown = true;
    expect(await h.data.loadDashboard(period)).toMatchObject({
      driverCount: "—",
      driverStatusSummary: { online: "—", offline: "—" },
    });
    h.state.driversDown = false;
    h.state.aggregateDown = false;
    expect(await h.data.loadDashboard(period)).toMatchObject({
      driverCount: "0",
      driverStatusSummary: { online: "0", offline: "0" },
    });
  });
});
