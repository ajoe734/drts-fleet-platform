// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { getByText, queryByRole } from "@testing-library/dom";
import type { ReferralPassengerTripSnapshot } from "@drts/contracts";
import { ReferralLiveTrackingPanel } from "../../../apps/referral-embed-web/components/referral-live-tracking";
import { buildEmbedTheme } from "../../../apps/referral-embed-web/lib/embed-presentation";

type Point = { lat: number; lng: number };

/** Records what the panel asks of Google Maps; the loader resolves it once per page. */
const calls = {
  maps: 0,
  fitBounds: [] as Point[][],
  panTo: [] as Point[],
  markers: [] as FakeMarker[],
  dragstart: [] as Array<() => void>,
};

class FakeMarker {
  position: Point;
  visible: boolean;
  label: { text: string };
  moves: Point[] = [];
  constructor(options: {
    position: Point;
    visible: boolean;
    label: { text: string };
  }) {
    this.position = options.position;
    this.visible = options.visible;
    this.label = options.label;
    calls.markers.push(this);
  }
  setPosition(point: Point) {
    this.position = point;
    this.moves.push(point);
  }
  setVisible(visible: boolean) {
    this.visible = visible;
  }
  setLabel(label: { text: string }) {
    this.label = label;
  }
  addListener() {}
  getPosition() {
    return null;
  }
}

class FakeBounds {
  points: Point[] = [];
  extend(point: Point) {
    this.points.push(point);
  }
}

const fakeMaps = {
  Map: class {
    constructor() {
      calls.maps += 1;
    }
    setCenter() {}
    panTo(point: Point) {
      calls.panTo.push(point);
    }
    fitBounds(bounds: FakeBounds) {
      calls.fitBounds.push(bounds.points);
    }
    addListener(event: string, handler: () => void) {
      if (event === "dragstart") calls.dragstart.push(handler);
    }
  },
  Marker: FakeMarker,
  LatLngBounds: FakeBounds,
  SymbolPath: { CIRCLE: 0 },
};

const PICKUP = { lat: 25.06, lng: 121.52 };
const DROPOFF = { lat: 25.08, lng: 121.24 };
const MAP = { enabled: true, browserKey: "browser-key" };

function trip(
  status: string,
  location: Point,
  extra: Partial<
    NonNullable<ReferralPassengerTripSnapshot["liveTracking"]>
  > = {},
): ReferralPassengerTripSnapshot {
  return {
    orderId: "order-1",
    orderNo: "DRTS-1",
    status,
    statusCode: status,
    etaMin: 3,
    cancelWindowMin: 0,
    pickupAddress: "上車",
    dropoffAddress: "下車",
    driverName: "司機",
    driverPhoneMasked: null,
    plateNumber: "TEST-B001",
    vehicleType: "comfort",
    estimatedFare: null,
    createdAt: "2026-10-20T07:59:00.000Z",
    updatedAt: "2026-10-20T08:00:00.000Z",
    rated: false,
    liveTracking: {
      assignmentId: "a-1",
      driverId: "d-1",
      vehicleId: "v-1",
      observedAt: "2026-10-20T08:00:05.000Z",
      locationFreshness: "fresh",
      location: {
        ...location,
        accuracyM: 8,
        recordedAt: "2026-10-20T08:00:00.000Z",
      },
      pickupEta:
        status === "on_trip"
          ? null
          : {
              minutes: 3,
              calculatedAt: "2026-10-20T08:00:00.000Z",
              estimatedArrivalAt: "2026-10-20T08:03:00.000Z",
            },
      dropoffRoute:
        status === "on_trip"
          ? {
              remainingDistanceMeters: 4200,
              remainingDurationSeconds: 720,
              generatedAt: "2026-10-20T08:00:00.000Z",
              estimatedArrivalAt: "2026-10-20T08:12:00.000Z",
              provider: "google",
            }
          : null,
      pickupPoint: { ...PICKUP },
      dropoffPoint: { ...DROPOFF },
      ...extra,
    },
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function render(snapshot: ReferralPassengerTripSnapshot, map = MAP) {
  host ??= document.body.appendChild(document.createElement("div"));
  root ??= createRoot(host);
  await act(async () =>
    root!.render(
      <ReferralLiveTrackingPanel
        trip={snapshot}
        error={false}
        refresh={() => undefined}
        theme={buildEmbedTheme("#1A45AD")}
        mapConfig={map}
      />,
    ),
  );
}

/** The loader injects the real script tag; here the test fires its callback. */
async function mapsReady() {
  await act(async () => {
    const target = window as unknown as {
      google?: unknown;
      __drtsReferralMapsReady?: () => void;
    };
    target.google = { maps: fakeMaps };
    target.__drtsReferralMapsReady?.();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  calls.maps = 0;
  calls.fitBounds = [];
  calls.panTo = [];
  calls.markers = [];
  calls.dragstart = [];
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

it("shows the pickup ETA as text without a map when the map is not offered", async () => {
  await render(trip("enroute_pickup", { lat: 25.07, lng: 121.53 }), {
    enabled: false,
    browserKey: null,
  } as never);
  expect(getByText(host!, "約 3 分鐘抵達上車地點")).toBeTruthy();
  expect(getByText(host!, "預計 16:03 抵達")).toBeTruthy();
  expect(getByText(host!, "司機位置更新於 16:00:00（5 秒前）")).toBeTruthy();
  expect(
    queryByRole(host!, "region", { name: "車輛與上車地點地圖" }),
  ).toBeNull();
});

it("draws the vehicle and the pickup, then only moves the vehicle on each poll", async () => {
  await render(trip("enroute_pickup", { lat: 25.07, lng: 121.53 }));
  await mapsReady();
  expect(calls.maps).toBe(1);
  const [vehicle, pickup] = calls.markers;
  expect(vehicle!.position).toEqual({ lat: 25.07, lng: 121.53 });
  expect(vehicle!.label.text).toBe("車");
  expect(pickup!.position).toEqual(PICKUP);
  expect(pickup!.label.text).toBe("上");
  expect(calls.fitBounds.at(-1)).toEqual([{ lat: 25.07, lng: 121.53 }, PICKUP]);

  // A later poll: same order, the vehicle is closer.
  await render(trip("enroute_pickup", { lat: 25.065, lng: 121.525 }));
  expect(calls.maps).toBe(1);
  expect(vehicle!.moves.at(-1)).toEqual({ lat: 25.065, lng: 121.525 });

  // A re-render with the same coordinates (new objects) does not move it again.
  const moves = vehicle!.moves.length;
  await render(trip("enroute_pickup", { lat: 25.065, lng: 121.525 }));
  expect(vehicle!.moves.length).toBe(moves);
});

it("heads to the destination once on board and stops re-framing after the rider pans", async () => {
  await render(trip("on_trip", { lat: 25.07, lng: 121.4 }));
  await mapsReady();
  const [, destination] = calls.markers;
  expect(destination!.position).toEqual(DROPOFF);
  expect(destination!.label.text).toBe("下");
  expect(getByText(host!, "約 12 分鐘抵達目的地")).toBeTruthy();
  expect(getByText(host!, "目的地剩餘距離：4.2 公里")).toBeTruthy();

  calls.dragstart.forEach((handler) => handler());
  const framed = calls.fitBounds.length;
  await render(trip("on_trip", { lat: 25.072, lng: 121.35 }));
  expect(calls.fitBounds.length).toBe(framed);
});

// Last: an authorization failure is remembered for the rest of the page.
it("falls back to text when Google rejects the browser key", async () => {
  await render(trip("enroute_pickup", { lat: 25.07, lng: 121.53 }));
  await mapsReady();
  expect(
    queryByRole(host!, "region", { name: "車輛與上車地點地圖" }),
  ).not.toBeNull();
  await act(async () => {
    (window as unknown as { gm_authFailure: () => void }).gm_authFailure();
  });
  expect(
    queryByRole(host!, "region", { name: "車輛與上車地點地圖" }),
  ).toBeNull();
  expect(getByText(host!, "約 3 分鐘抵達上車地點")).toBeTruthy();
});
