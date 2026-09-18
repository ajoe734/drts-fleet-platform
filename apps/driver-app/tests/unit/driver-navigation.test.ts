import { describe, expect, it, vi } from "vitest";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

import {
  buildDriverTripNavigationModel,
  buildGoogleMapsWebNavigationUrl,
  formatDriverCoordinate,
  getDriverLocationFixState,
  getDriverRouteAuthorityCopy,
  openDriverNavigation,
} from "../../lib/driver-navigation";

function buildTask(
  overrides: Partial<DriverTaskRecord> = {},
): DriverTaskRecord {
  return {
    taskId: "task-001",
    orderId: "order-001",
    dispatchJobId: "dispatch-001",
    assignmentId: "assignment-001",
    driverId: "driver-001",
    vehicleId: "vehicle-001",
    sourcePlatform: null,
    routeProvided: true,
    waypoints: [],
    status: "accepted",
    acceptedAt: null,
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: null,
    completedAt: null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
    ...overrides,
  };
}

function buildOrder(
  overrides: Partial<OwnedOrderRecord> = {},
): OwnedOrderRecord {
  return {
    orderId: "order-001",
    orderNo: "ORD-001",
    orderSource: "call_center",
    orderDomain: "owned",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    serviceBucket: "taxi",
    dispatchSemantics: "exclusive",
    businessDispatchSubtype: null,
    status: "assigned",
    pickup: {
      address: "台北車站",
      lat: 25.0478,
      lng: 121.517,
      geocodeProvider: "drts_geocoder",
      coordinateSource: "operator_selected",
      coordinateAccuracyM: 9,
    },
    dropoff: {
      address: "松山機場",
      lat: 25.0697,
      lng: 121.5525,
      geocodeProvider: "drts_geocoder",
      coordinateSource: "operator_selected",
      coordinateAccuracyM: 11,
    },
    passenger: {
      name: "乘客甲",
      phone: "0900000000",
      count: 1,
    },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    recordingId: null,
    reservationWindowStart: null,
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    notes: null,
    quotedFare: null,
    fixedPrice: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as unknown as OwnedOrderRecord;
}

describe("driver navigation model", () => {
  it("renders backend pickup/dropoff coordinates with stable precision", () => {
    const model = buildDriverTripNavigationModel({
      task: buildTask(),
      order: buildOrder(),
    });

    expect(model.hasNavigableRoute).toBe(true);
    expect(model.stops.pickup.coordinate).toEqual({
      latitude: 25.0478,
      longitude: 121.517,
    });
    expect(model.stops.dropoff.coordinateLabel).toBe("25.069700, 121.552500");
    expect(formatDriverCoordinate(model.stops.pickup.coordinate)).toBe(
      "25.047800, 121.517000",
    );
  });

  it("uses coordinates, not address text, when building external navigation URLs", async () => {
    const model = buildDriverTripNavigationModel({
      task: buildTask(),
      order: buildOrder(),
    });
    const openURL = vi.fn().mockResolvedValue(undefined);

    const result = await openDriverNavigation({
      stop: model.stops.pickup,
      provider: "google",
      platform: "ios",
      linking: {
        canOpenURL: vi.fn().mockResolvedValue(false),
        openURL,
      },
    });

    expect(result).toMatchObject({
      status: "opened",
      provider: "google",
      fallback: true,
    });
    expect(openURL).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=25.0478%2C121.517&travelmode=driving",
    );
    expect(openURL.mock.calls[0][0]).not.toContain(
      encodeURIComponent("台北車站"),
    );
  });

  it("opens Android system navigation with the requested dropoff coordinates", async () => {
    const model = buildDriverTripNavigationModel({
      task: buildTask(),
      order: buildOrder(),
    });
    const openURL = vi.fn().mockResolvedValue(undefined);

    const result = await openDriverNavigation({
      stop: model.stops.dropoff,
      provider: "system",
      platform: "android",
      linking: {
        canOpenURL: vi.fn().mockResolvedValue(true),
        openURL,
      },
    });

    expect(result).toMatchObject({
      status: "opened",
      provider: "system",
      fallback: false,
    });
    expect(openURL).toHaveBeenCalledWith(
      "google.navigation:q=25.0697,121.5525&mode=d",
    );
  });

  it("rejects navigation handoff when coordinates are missing", async () => {
    const model = buildDriverTripNavigationModel({
      task: buildTask(),
      order: buildOrder({
        pickup: {
          address: "台北車站",
          lat: null,
          lng: null,
        },
      } as Partial<OwnedOrderRecord>),
    });
    const openURL = vi.fn().mockResolvedValue(undefined);

    const result = await openDriverNavigation({
      stop: model.stops.pickup,
      provider: "google",
      platform: "ios",
      linking: { openURL },
    });

    expect(result.status).toBe("missing_coordinates");
    expect(openURL).not.toHaveBeenCalled();
  });

  it("falls back when no external navigation app can open", async () => {
    const model = buildDriverTripNavigationModel({
      task: buildTask(),
      order: buildOrder(),
    });
    const result = await openDriverNavigation({
      stop: model.stops.dropoff,
      provider: "system",
      platform: "android",
      linking: {
        canOpenURL: vi.fn().mockResolvedValue(false),
        openURL: vi.fn().mockRejectedValue(new Error("not installed")),
      },
    });

    expect(result).toMatchObject({
      status: "unavailable",
      provider: "system",
    });
    expect(result.status === "unavailable" ? result.attemptedUrls : []).toEqual(
      [
        "google.navigation:q=25.0697,121.5525&mode=d",
        buildGoogleMapsWebNavigationUrl({
          latitude: 25.0697,
          longitude: 121.5525,
        }),
      ],
    );
  });
});

describe("driver route authority and degraded states", () => {
  it("separates DRTS-owned route authority from forwarded route authority", () => {
    const owned = getDriverRouteAuthorityCopy(buildTask());
    const forwarded = getDriverRouteAuthorityCopy(
      buildTask({
        sourcePlatform: "grab",
        routeProvided: false,
        routeIntent: "platform_polyline_locked",
      } as Partial<DriverTaskRecord>),
    );

    expect(owned.kind).toBe("drts_owned");
    expect(owned.description).toContain("DRTS owns this route");
    expect(owned.locked).toBe(false);
    expect(forwarded.kind).toBe("forwarded_platform");
    expect(forwarded.description).toContain("source platform route intent");
    expect(forwarded.locked).toBe(true);
    expect(forwarded.degradedHint).toContain("未提供完整路線 polyline");
  });

  it("documents missing and stale driver GPS fixes", () => {
    expect(getDriverLocationFixState({ location: null }).state).toBe("missing");

    expect(
      getDriverLocationFixState({
        location: {
          latitude: 25.0478,
          longitude: 121.517,
          recordedAt: "2026-07-01T00:00:00.000Z",
          accuracyM: 8,
        },
        now: Date.parse("2026-07-01T00:00:30.000Z"),
      }),
    ).toMatchObject({
      state: "fresh",
      coordinateLabel: "25.047800, 121.517000",
    });

    expect(
      getDriverLocationFixState({
        location: {
          latitude: 25.0478,
          longitude: 121.517,
          recordedAt: "2026-07-01T00:00:00.000Z",
        },
        now: Date.parse("2026-07-01T00:02:30.000Z"),
      }).state,
    ).toBe("stale");
  });
});

describe("driver root tab bar navigation", () => {
  it("declares the exact five tabs in correct order", async () => {
    const { DRIVER_TABS } = await import("../../lib/driver-navigation");

    expect(DRIVER_TABS.map((t) => t.title)).toEqual([
      "工作台",
      "任務",
      "行程",
      "平台",
      "設定",
    ]);

    expect(DRIVER_TABS.map((t) => t.key)).toEqual([
      "workbench",
      "jobs",
      "trip",
      "platform",
      "settings",
    ]);

    expect(DRIVER_TABS.map((t) => t.routeName)).toEqual([
      "index",
      "jobs",
      "trip",
      "platform-presence",
      "settings",
    ]);
  });

  it("maps all existing screens to their designated parent tab", async () => {
    const { DRIVER_ROUTE_TAB_MAP, resolveActiveDriverTab } = await import(
      "../../lib/driver-navigation"
    );

    expect(DRIVER_ROUTE_TAB_MAP.index).toBe("workbench");
    expect(DRIVER_ROUTE_TAB_MAP.jobs).toBe("jobs");
    expect(DRIVER_ROUTE_TAB_MAP.trip).toBe("trip");
    expect(DRIVER_ROUTE_TAB_MAP["platform-presence"]).toBe("platform");
    expect(DRIVER_ROUTE_TAB_MAP.settings).toBe("settings");

    expect(resolveActiveDriverTab("index")).toBe("workbench");
    expect(resolveActiveDriverTab("/index")).toBe("workbench");
    expect(resolveActiveDriverTab("jobs")).toBe("jobs");
    expect(resolveActiveDriverTab("/jobs")).toBe("jobs");
    expect(resolveActiveDriverTab("trip")).toBe("trip");
    expect(resolveActiveDriverTab("/trip")).toBe("trip");
    expect(resolveActiveDriverTab("platform-presence")).toBe("platform");
    expect(resolveActiveDriverTab("/platform-presence")).toBe("platform");
    expect(resolveActiveDriverTab("settings")).toBe("settings");
    expect(resolveActiveDriverTab("/settings")).toBe("settings");

    // Sub-screens
    expect(resolveActiveDriverTab("incident")).toBe("trip");
    expect(resolveActiveDriverTab("/incident")).toBe("trip");
    expect(resolveActiveDriverTab("sos")).toBe("trip");
    expect(resolveActiveDriverTab("/sos")).toBe("trip");
    expect(resolveActiveDriverTab("earnings")).toBe("settings");
    expect(resolveActiveDriverTab("/earnings")).toBe("settings");
    expect(resolveActiveDriverTab("shift")).toBe("workbench");
    expect(resolveActiveDriverTab("/shift")).toBe("workbench");
    expect(resolveActiveDriverTab("safety-operator")).toBe("settings");
    expect(resolveActiveDriverTab("/safety-operator")).toBe("settings");
    expect(resolveActiveDriverTab("onboarding")).toBe("workbench");
    expect(resolveActiveDriverTab("/onboarding")).toBe("workbench");
  });

  it("respects tab overrides passed through navigation state/params", async () => {
    const { resolveActiveDriverTab } = await import(
      "../../lib/driver-navigation"
    );

    expect(resolveActiveDriverTab("earnings", "workbench")).toBe("workbench");
    expect(resolveActiveDriverTab("incident", "workbench")).toBe("workbench");
  });

  it("identifies whether a route is a top-level tab route", async () => {
    const { isDriverTabRoute } = await import("../../lib/driver-navigation");

    expect(isDriverTabRoute("index")).toBe(true);
    expect(isDriverTabRoute("jobs")).toBe(true);
    expect(isDriverTabRoute("trip")).toBe(true);
    expect(isDriverTabRoute("platform-presence")).toBe(true);
    expect(isDriverTabRoute("settings")).toBe(true);

    expect(isDriverTabRoute("earnings")).toBe(false);
    expect(isDriverTabRoute("incident")).toBe(false);
    expect(isDriverTabRoute("sos")).toBe(false);
    expect(isDriverTabRoute("safety-operator")).toBe(false);
  });
});

