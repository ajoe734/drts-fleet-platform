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

function buildCanonicalMetadataFixture() {
  const routeStops = [
    {
      address: "重複停靠景點",
      lat: 25.04,
      lng: 121.51,
      geocodeProvider: "first-stop-provider",
      coordinateSource: "provider_candidate" as const,
      coordinateAccuracyM: 5,
    },
    {
      address: "重複停靠景點",
      lat: 25.04,
      lng: 121.51,
      geocodeProvider: "second-stop-provider",
      coordinateSource: "manual_pin" as const,
      coordinateAccuracyM: 7,
    },
  ];
  const order = buildOrder({
    businessDispatchSubtype: "travel_agency_transfer",
    partnerBookingDetails: {
      subtype: "travel_agency_transfer",
      groupCode: "SIM-METADATA",
      groupSize: 1,
      itineraryLink: "https://travel.example.test/metadata",
      rosterPassengers: ["SIM Rider"],
      meetingPoint: "SIM meeting point",
      routeStops,
    },
  });
  const places = [order.pickup, ...routeStops, order.dropoff];
  const task = buildTask({
    waypoints: places
      .map((place, sequence) => ({
        sequence,
        label: `停靠點 ${sequence}`,
        address: place.address,
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        arrivedAt: null,
        departedAt: null,
      }))
      .reverse(),
  });
  return { order, task };
}

describe("driver navigation model", () => {
  it("advances each canonical repeated-place visit only from persisted arrival/departure timestamps", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    task.status = "on_trip";
    task.waypoints.sort((left, right) => left.sequence - right.sequence);
    task.waypoints[0]!.arrivedAt = "2026-11-13T00:00:00.000Z";
    task.waypoints[0]!.departedAt = "2026-11-13T00:01:00.000Z";
    for (const [sequence, action] of [
      [1, "arrived"],
      [1, "depart"],
      [2, "arrived"],
      [2, "depart"],
      [3, "arrived"],
    ] as const) {
      const before = JSON.stringify({ task, order });
      const progress = buildDriverTripNavigationModel({
        task,
        order,
      }).waypointProgress;
      expect(progress).toMatchObject({
        required: true,
        complete: false,
        unavailable: false,
        next: { sequence, action },
      });
      expect(progress.next?.stop.address).toBe(
        task.waypoints[sequence]!.address,
      );
      expect(JSON.stringify({ task, order })).toBe(before);
      task.waypoints[sequence]![
        action === "arrived" ? "arrivedAt" : "departedAt"
      ] = "2026-11-13T00:02:00.000Z";
    }
    expect(
      buildDriverTripNavigationModel({ task, order }).waypointProgress,
    ).toEqual({
      required: true,
      complete: true,
      unavailable: false,
      next: null,
    });
    expect(task.waypoints[1]!.lat).toBe(task.waypoints[2]!.lat);
    expect(task.waypoints[1]!.lng).toBe(task.waypoints[2]!.lng);
    expect(task.waypoints[3]!.departedAt).toBeNull();
  });

  it("does not issue local waypoint actions for forwarded, unrelated, nontravel or stopless orders", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    task.status = "on_trip";
    for (const [candidateTask, candidateOrder] of [
      [{ ...task, sourcePlatform: "SIM-platform" }, order],
      [{ ...task, sourcePlatform: "" }, order],
      [task, { ...order, orderId: "different-order" }],
      [
        task,
        { ...order, businessDispatchSubtype: "insurance_replacement_vehicle" },
      ],
      [
        task,
        {
          ...order,
          partnerBookingDetails: {
            ...order.partnerBookingDetails!,
            subtype: "insurance_replacement_vehicle",
          },
        },
      ],
      [
        task,
        {
          ...order,
          partnerBookingDetails: {
            ...order.partnerBookingDetails!,
            routeStops: [],
          },
        },
      ],
    ] as Array<[DriverTaskRecord, OwnedOrderRecord]>) {
      expect(
        buildDriverTripNavigationModel({
          task: candidateTask,
          order: candidateOrder,
        }).waypointProgress,
      ).toEqual({
        required: false,
        complete: true,
        unavailable: false,
        next: null,
      });
    }
  });

  it("blocks guessed completion and future-stop actions when canonical waypoint readback is incomplete or inconsistent", () => {
    for (const issue of [
      "missing",
      "duplicate-sequence",
      "pickup-not-started",
      "future-arrival",
    ] as const) {
      const { task, order } = buildCanonicalMetadataFixture();
      task.status = "on_trip";
      task.waypoints.sort((left, right) => left.sequence - right.sequence);
      task.waypoints[0]!.arrivedAt = "2026-11-13T00:00:00.000Z";
      task.waypoints[0]!.departedAt = "2026-11-13T00:01:00.000Z";
      if (issue === "missing") task.waypoints.splice(1, 1);
      if (issue === "duplicate-sequence") task.waypoints[2]!.sequence = 1;
      if (issue === "pickup-not-started") task.waypoints[0]!.departedAt = null;
      if (issue === "future-arrival")
        task.waypoints[2]!.arrivedAt = "2026-11-13T00:02:00.000Z";
      expect(
        buildDriverTripNavigationModel({ task, order }).waypointProgress,
      ).toEqual({
        required: true,
        complete: false,
        unavailable: true,
        next: null,
      });
    }
  });

  it("keeps pickup lifecycle distinct from on-trip waypoint controls", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    for (const status of [
      "accepted",
      "enroute_pickup",
      "arrived_pickup",
    ] as const) {
      task.status = status;
      expect(
        buildDriverTripNavigationModel({ task, order }).waypointProgress,
      ).toEqual({
        required: true,
        complete: false,
        unavailable: false,
        next: null,
      });
    }
  });

  it("preserves matching owned order coordinate metadata at each canonical position, including repeated visits", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    const before = JSON.stringify({ task, order });
    const model = buildDriverTripNavigationModel({ task, order });
    expect(
      model.orderedStops.map(
        ({ geocodeProvider, coordinateSource, coordinateAccuracyM }) => ({
          geocodeProvider,
          coordinateSource,
          coordinateAccuracyM,
        }),
      ),
    ).toEqual([
      {
        geocodeProvider: "drts_geocoder",
        coordinateSource: "operator_selected",
        coordinateAccuracyM: 9,
      },
      {
        geocodeProvider: "first-stop-provider",
        coordinateSource: "provider_candidate",
        coordinateAccuracyM: 5,
      },
      {
        geocodeProvider: "second-stop-provider",
        coordinateSource: "manual_pin",
        coordinateAccuracyM: 7,
      },
      {
        geocodeProvider: "drts_geocoder",
        coordinateSource: "operator_selected",
        coordinateAccuracyM: 11,
      },
    ]);
    expect(model.orderedStops.map((stop) => stop.coordinate)).toEqual([
      { latitude: 25.0478, longitude: 121.517 },
      { latitude: 25.04, longitude: 121.51 },
      { latitude: 25.04, longitude: 121.51 },
      { latitude: 25.0697, longitude: 121.5525 },
    ]);
    expect(JSON.stringify({ task, order })).toBe(before);
  });

  it.each(["address", "lat", "lng"] as const)(
    "does not borrow coordinate metadata when the canonical stop %s differs from the corresponding order place",
    (field) => {
      const { task, order } = buildCanonicalMetadataFixture();
      const waypoint = task.waypoints.find((stop) => stop.sequence === 1);
      if (!waypoint) throw new Error("Expected the first intermediate stop");
      if (field === "address") waypoint.address += " changed";
      else waypoint[field] = (waypoint[field] ?? 0) + 0.001;
      const model = buildDriverTripNavigationModel({ task, order });
      expect(model.orderedStops[1]).toMatchObject({
        address: waypoint.address,
        coordinate: { latitude: waypoint.lat, longitude: waypoint.lng },
        geocodeProvider: null,
        coordinateSource: null,
        coordinateAccuracyM: null,
      });
    },
  );

  it("does not borrow matching owned order coordinate metadata for a forwarded task", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    task.sourcePlatform = "grab";
    const before = JSON.stringify(task);
    const model = buildDriverTripNavigationModel({ task, order });
    expect(
      model.orderedStops.every(
        (stop) =>
          stop.geocodeProvider === null &&
          stop.coordinateSource === null &&
          stop.coordinateAccuracyM === null,
      ),
    ).toBe(true);
    expect(model.orderedStops.map((stop) => stop.sequence)).toEqual([
      3, 2, 1, 0,
    ]);
    expect(model.authority).toMatchObject({
      kind: "forwarded_platform",
      locked: true,
    });
    expect(JSON.stringify(task)).toBe(before);
  });

  it("does not reuse endpoint metadata after canonical pickup or dropoff changes", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    const pickup = task.waypoints.find((stop) => stop.sequence === 0);
    const dropoff = task.waypoints.find((stop) => stop.sequence === 3);
    if (!pickup || !dropoff)
      throw new Error("Expected both canonical endpoints");
    pickup.address += " changed";
    dropoff.lng = (dropoff.lng ?? 0) + 0.001;
    const model = buildDriverTripNavigationModel({ task, order });
    for (const stop of [model.stops.pickup, model.stops.dropoff]) {
      expect(stop).toMatchObject({
        geocodeProvider: null,
        coordinateSource: null,
        coordinateAccuracyM: null,
      });
    }
    expect(model.orderedStops[1]?.geocodeProvider).toBe("first-stop-provider");
    expect(model.orderedStops[2]?.geocodeProvider).toBe("second-stop-provider");
  });

  it("does not borrow metadata from a different order or a non-travel intermediate stop list", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    const unrelated = buildDriverTripNavigationModel({
      task,
      order: { ...order, orderId: "another-order" },
    });
    expect(
      unrelated.orderedStops.every(
        (stop) =>
          stop.geocodeProvider === null &&
          stop.coordinateSource === null &&
          stop.coordinateAccuracyM === null,
      ),
    ).toBe(true);
    const nonTravel = buildDriverTripNavigationModel({
      task,
      order: {
        ...order,
        businessDispatchSubtype: "insurance_replacement_vehicle",
      },
    });
    expect(nonTravel.orderedStops[1]).toMatchObject({
      geocodeProvider: null,
      coordinateSource: null,
      coordinateAccuracyM: null,
    });
    expect(nonTravel.orderedStops[2]).toMatchObject({
      geocodeProvider: null,
      coordinateSource: null,
      coordinateAccuracyM: null,
    });
  });

  it("does not assign metadata from a repeated place at a different canonical index", () => {
    const { task, order } = buildCanonicalMetadataFixture();
    task.waypoints = task.waypoints.filter((stop) => stop.sequence !== 1);
    const model = buildDriverTripNavigationModel({ task, order });
    expect(model.orderedStops[1]).toMatchObject({
      sequence: 2,
      geocodeProvider: null,
      coordinateSource: null,
      coordinateAccuracyM: null,
    });
  });

  it("keeps the complete canonical stop sequence, including repeated visits, without appending endpoints", async () => {
    const waypoints: DriverTaskRecord["waypoints"] = [
      {
        sequence: 2,
        label: "再次停靠",
        address: "台北車站",
        lat: 25.0478,
        lng: 121.517,
        arrivedAt: null,
        departedAt: null,
      },
      {
        sequence: 0,
        label: "出發",
        address: "台北車站",
        lat: 25.0478,
        lng: 121.517,
        arrivedAt: null,
        departedAt: null,
      },
      {
        sequence: 3,
        label: "終點",
        address: "松山機場",
        lat: 25.0697,
        lng: 121.5525,
        arrivedAt: null,
        departedAt: null,
      },
      {
        sequence: 1,
        label: "中途景點",
        address: "實際選定景點",
        lat: 25.8,
        lng: 121.8,
        arrivedAt: null,
        departedAt: null,
      },
    ];
    const before = JSON.stringify(waypoints);
    const model = buildDriverTripNavigationModel({
      task: buildTask({ waypoints }),
      order: buildOrder(),
    });

    expect(model.orderedStops.map((stop) => stop.label)).toEqual([
      "出發",
      "中途景點",
      "再次停靠",
      "終點",
    ]);
    expect(model.orderedStops.map((stop) => stop.sequence)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(new Set(model.orderedStops.map((stop) => stop.target)).size).toBe(4);
    expect(model.stops.pickup).toBe(model.orderedStops[0]);
    expect(model.stops.dropoff).toBe(model.orderedStops[3]);
    expect(model.hasNavigableRoute).toBe(true);
    expect(JSON.stringify(waypoints)).toBe(before);

    const openURL = vi.fn().mockResolvedValue(undefined);
    for (const stop of model.orderedStops) {
      const result = await openDriverNavigation({
        stop,
        provider: "google",
        platform: "web",
        linking: { canOpenURL: vi.fn().mockResolvedValue(false), openURL },
      });
      expect(result.status).toBe("opened");
    }
    expect(openURL.mock.calls.map(([url]) => url)).toEqual([
      "https://www.google.com/maps/dir/?api=1&destination=25.0478%2C121.517&travelmode=driving",
      "https://www.google.com/maps/dir/?api=1&destination=25.8%2C121.8&travelmode=driving",
      "https://www.google.com/maps/dir/?api=1&destination=25.0478%2C121.517&travelmode=driving",
      "https://www.google.com/maps/dir/?api=1&destination=25.0697%2C121.5525&travelmode=driving",
    ]);
  });

  it("retains an invalid intermediate stop without guessing coordinates or hiding it", async () => {
    const model = buildDriverTripNavigationModel({
      task: buildTask({
        waypoints: [
          {
            sequence: 0,
            label: "出發",
            address: "台北車站",
            lat: 25.0478,
            lng: 121.517,
            arrivedAt: null,
            departedAt: null,
          },
          {
            sequence: 1,
            label: "待確認景點",
            address: "25.8, 121.8",
            lat: 91,
            lng: 121.8,
            arrivedAt: null,
            departedAt: null,
          },
          {
            sequence: 2,
            label: "終點",
            address: "松山機場",
            lat: 25.0697,
            lng: 121.5525,
            arrivedAt: null,
            departedAt: null,
          },
        ],
      }),
      order: buildOrder(),
    });
    expect(model.orderedStops).toHaveLength(3);
    expect(model.orderedStops[1]).toMatchObject({
      address: "25.8, 121.8",
      coordinate: null,
      coordinateLabel: "座標缺失",
    });
    expect(model.hasPickupCoordinate).toBe(true);
    expect(model.hasDropoffCoordinate).toBe(true);
    expect(model.hasNavigableRoute).toBe(false);
    const openURL = vi.fn();
    const stop = model.orderedStops[1];
    if (!stop) throw new Error("Expected the retained intermediate stop");
    expect(
      (
        await openDriverNavigation({
          stop,
          provider: "google",
          platform: "web",
          linking: { openURL },
        })
      ).status,
    ).toBe("missing_coordinates");
    expect(openURL).not.toHaveBeenCalled();
  });

  it("uses the original pickup/dropoff fallback when there are no canonical task waypoints", () => {
    for (const task of [null, buildTask({ waypoints: [] })]) {
      const model = buildDriverTripNavigationModel({
        task,
        order: buildOrder(),
      });
      expect(model.orderedStops).toEqual([
        model.stops.pickup,
        model.stops.dropoff,
      ]);
      expect(model.orderedStops.map((stop) => stop.target)).toEqual([
        "pickup",
        "dropoff",
      ]);
      expect(model.orderedStops.map((stop) => stop.address)).toEqual([
        "台北車站",
        "松山機場",
      ]);
    }
  });

  it("keeps forwarded waypoints in source order and preserves source route authority", () => {
    const task = buildTask({
      sourcePlatform: "grab",
      routeProvided: false,
      waypoints: [
        {
          sequence: 9,
          label: "來源第一站",
          address: "來源地點甲",
          lat: 24,
          lng: 120,
          arrivedAt: null,
          departedAt: null,
        },
        {
          sequence: 2,
          label: "來源第二站",
          address: "來源地點乙",
          lat: 25,
          lng: 121,
          arrivedAt: null,
          departedAt: null,
        },
      ],
    });
    const before = JSON.stringify(task);
    const model = buildDriverTripNavigationModel({ task, order: buildOrder() });
    expect(model.orderedStops.map((stop) => stop.label)).toEqual([
      "來源第一站",
      "來源第二站",
    ]);
    expect(model.orderedStops.map((stop) => stop.sequence)).toEqual([9, 2]);
    expect(model.authority).toMatchObject({
      kind: "forwarded_platform",
      locked: true,
    });
    expect(model.authority.degradedHint).toContain("未提供完整路線 polyline");
    expect(JSON.stringify(task)).toBe(before);
  });

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
    expect(
      getDriverLocationFixState({ task: buildTask(), location: null }).state,
    ).toBe("missing");

    expect(
      getDriverLocationFixState({
        task: buildTask(),
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
        task: buildTask(),
        location: {
          latitude: 25.0478,
          longitude: 121.517,
          recordedAt: "2026-07-01T00:00:00.000Z",
        },
        now: Date.parse("2026-07-01T00:02:30.000Z"),
      }).state,
    ).toBe("stale");
  });

  it.each(["completed", "cancelled", "rejected"] as const)(
    "shows stopped location for a %s task regardless of fix age",
    (status) => {
      const task = buildTask({ status });
      const location = {
        latitude: 25.0478,
        longitude: 121.517,
        recordedAt: "2026-07-01T00:00:00.000Z",
      };

      for (const now of [
        Date.parse("2026-07-01T00:00:30.000Z"),
        Date.parse("2026-07-01T00:02:30.000Z"),
      ]) {
        expect(
          getDriverLocationFixState({ task, location, now }),
        ).toMatchObject({
          state: "stopped",
          label: "本任務定位已停止",
          detail: expect.stringContaining("最後已知座標"),
          coordinateLabel: "25.047800, 121.517000",
        });
      }

      for (const missingLocation of [null, { ...location, latitude: 91 }]) {
        expect(
          getDriverLocationFixState({ task, location: missingLocation }),
        ).toMatchObject({
          state: "stopped",
          label: "本任務定位已停止",
          detail: "任務已結束，沒有可顯示的最後定位。",
          coordinateLabel: null,
        });
      }
    },
  );
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
    const { DRIVER_ROUTE_TAB_MAP, resolveActiveDriverTab } =
      await import("../../lib/driver-navigation");

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
    const { resolveActiveDriverTab } =
      await import("../../lib/driver-navigation");

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
