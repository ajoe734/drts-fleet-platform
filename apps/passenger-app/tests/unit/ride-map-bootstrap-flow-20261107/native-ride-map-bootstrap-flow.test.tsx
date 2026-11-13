import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassengerRideAuthorityView } from "@drts/contracts";

// External SIM boundaries only. Bootstrap, Runtime, Application, booking screen,
// authenticated transport, ride readback, SSE decoder and P5 are actual modules.
const external = vi.hoisted(() => ({
  platform: "ios" as "ios" | "android" | "web",
  androidApiKeyConfigured: false,
  stored: "",
  sequence: 0,
  fits: [] as Array<Array<{ latitude: number; longitude: number }>>,
  streams: [] as SimStreamRequest[],
}));
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  Modal: "Modal",
  Switch: "Switch",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T,>(styles: T) => styles },
  Platform: {
    get OS() {
      return external.platform;
    },
  },
  Alert: { alert: vi.fn() },
  PermissionsAndroid: {
    PERMISSIONS: {
      POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS",
    },
    check: vi.fn(async () => false),
    request: vi.fn(async () => "denied"),
  },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return {
        extra: {
          passengerNativeMaps: {
            androidApiKeyConfigured: external.androidApiKeyConfigured,
          },
          passengerNativeNotifications: {
            iosConfigured: false,
            androidConfigured: false,
          },
        },
      };
    },
  },
}));
vi.mock("react-native-maps", async () => {
  const react = await import("react");
  return {
    default: react.forwardRef<unknown, Record<string, unknown>>(
      function SimNativeMapView(props, ref) {
        react.useImperativeHandle(ref, () => ({
          fitToCoordinates(
            points: Array<{ latitude: number; longitude: number }>,
          ) {
            external.fits.push(points);
          },
        }));
        return react.createElement(
          "SimNativeMapView",
          props,
          props.children as React.ReactNode,
        );
      },
    ),
    Marker: "SimNativeMapMarker",
    PROVIDER_GOOGLE: "google",
  };
});
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => external.stored || null,
  setItemAsync: async (_key: string, value: string) => {
    external.stored = value;
  },
  deleteItemAsync: async () => {
    external.stored = "";
  },
}));
vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: vi.fn(async () => ({ type: "cancel" })),
}));
vi.mock("expo-linking", () => ({ openURL: vi.fn(async () => {}) }));
vi.mock("expo-modules-core", () => ({
  uuid: { v4: () => `map-platform-${++external.sequence}` },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///map-bootstrap-cache" } },
  File: vi.fn(),
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(async () => {}),
}));
vi.mock("react-native-webview", () => ({ WebView: "WebView" }));

// Baseline imports already exist. A missing new product module cannot constitute RED.
import { createNativePassengerBootstrap } from "../../../lib/bootstrap";
import { NativePassengerApplication } from "../../../components/application/native-passenger-application";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const BASE = "https://native-ride-map.example.invalid";
const CALLBACK = "drtspassenger://auth/callback";
const NOW = Date.parse("2026-11-07T12:00:00Z");
let clock = NOW;
const PAIR = {
  accessToken: "sim-ride-map-access",
  refreshToken: "sim-ride-map-refresh",
};
const PICKUP = { lat: 25.031, lng: 121.531, address: "SIM 上車點" };
const DROPOFF = { lat: 25.041, lng: 121.541, address: "SIM 下車點" };
const DRIVER = {
  lat: 25.021,
  lng: 121.521,
  accuracyM: 8,
  recordedAt: new Date(NOW).toISOString(),
};
const ACCOUNT = {
  drtsPassengerId: "sim-ride-map-passenger",
  displayName: "SIM 乘客",
  status: "active",
  contactPhone: "+886900000000",
  contactPhoneVerified: true,
  feeAcknowledgementVersion: "SIM-v1",
  createdAt: new Date(NOW).toISOString(),
};
function ride(
  status: PassengerRideAuthorityView["order"]["status"] = "enroute_pickup",
): PassengerRideAuthorityView {
  const at = new Date(NOW).toISOString();
  return {
    order: {
      orderId: "sim-ride-map-order",
      orderNo: "SIM-RIDE-MAP",
      status,
      timingMode: "scheduled",
      requestedPickupAt: "2099-11-07T12:00:00Z",
      pickup: PICKUP,
      dropoff: DROPOFF,
      cancelableUntil: null,
      cancelledAt: status === "cancelled" ? at : null,
      completedAt: null,
    },
    assignment: {
      snapshotId: "SIM-snapshot",
      runtimeProfileCode: "multi_taxi_direct",
      orderId: "sim-ride-map-order",
      bookingId: null,
      dispatchJobId: "SIM-job",
      assignmentId: "SIM-assignment",
      assignmentVersion: 1,
      vehicle: {
        vehicleId: "SIM-vehicle",
        make: "SIM",
        model: "SIM車",
        plateNo: "SIM-001",
        modelYear: 2026,
        doorCount: 4,
        color: "示意白色",
        profileVersion: 1,
      },
      driver: {
        driverId: "SIM-driver",
        displayName: "SIM司機",
        registrationMaskedDisplay: "SIM***001",
        registrationStatus: "verified_active",
        registrationEffectiveUntil: "2099-11-07T00:00:00Z",
        credentialVersion: 1,
      },
      rating: {
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
        aggregateVersion: 1,
      },
      eta: { minutes: 5, calculatedAt: at, locationFreshness: "fresh" },
      routeFare: {
        routeSnapshotId: "SIM-route",
        quoteSnapshotId: "SIM-quote",
        orderId: "sim-ride-map-order",
        pickup: {
          ...PICKUP,
          coordinateSource: "provider_candidate",
          geocodeConfidence: "exact",
          resolvedAt: at,
        },
        dropoff: {
          ...DROPOFF,
          coordinateSource: "provider_candidate",
          geocodeConfidence: "exact",
          resolvedAt: at,
        },
        estimatedDistanceMeters: 5500,
        estimatedDurationSeconds: 900,
        encodedPolyline: null,
        chargingMode: "meter_estimate",
        estimatedFareMinor: 26000,
        payableFareMinor: null,
        currency: "TWD",
        farePolicyId: "SIM-policy",
        farePolicyVersion: "SIM-v1",
        fareChangeRuleId: "SIM-rule",
        fareChangeRuleVersion: "SIM-v1",
        fareChangeRuleDisplayText: "SIM非實際報價",
        passengerConfirmedAt: at,
        generatedAt: at,
      },
      createdAt: at,
      supersededAt: null,
    },
    tracking: {
      assignmentId: "SIM-assignment",
      driverId: "SIM-driver",
      vehicleId: "SIM-vehicle",
      locationFreshness: "fresh",
      location: { ...DRIVER },
      pickupEta: { minutes: 5, calculatedAt: at },
    },
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: true,
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}
class SimStreamRequest {
  readyState = 0;
  status = 0;
  responseText = "";
  response: unknown = null;
  responseType = "";
  method = "";
  url = "";
  headers: Record<string, string> = {};
  aborted = false;
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    external.streams.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    this.readyState = 1;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader() {
    return "text/event-stream";
  }
  send() {
    this.readyState = 3;
    this.status = 200;
    this.onreadystatechange?.();
  }
  abort() {
    this.aborted = true;
  }
  event(view: PassengerRideAuthorityView, version: number) {
    this.responseText += `data: ${JSON.stringify({ eventId: `SIM-event-${version}`, eventType: view.order.status === "cancelled" ? "trip_cancelled" : "driver_location_updated", eventVersion: version, assignmentVersion: 1, orderId: view.order.orderId, occurredAt: new Date(clock).toISOString(), data: view })}\n\n`;
    this.onprogress?.();
  }
}
function boundary() {
  const requests: Array<{
    path: string;
    method: string;
    authorization: string | null;
  }> = [];
  const unexpected: string[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    requests.push({
      path,
      method,
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    const response = (data: unknown) =>
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.origin === BASE && method === "GET") {
      if (path === "/api/passenger-app/me")
        return response({ account: ACCOUNT });
      if (path === "/api/passenger-app/settings")
        return response({
          minLeadTimeMinutes: 30,
          requireSmsVerification: false,
        });
      if (path === "/api/passenger-app/payment-methods")
        return response({ methods: [] });
      if (path === "/api/passenger-app/fares")
        return response({
          currentVersion: {
            version: "SIM-v1",
            effectiveAt: "2023-04-01T00:00:00Z",
            baseFare: 85,
            baseDistanceMeters: 1250,
            distanceRate: 5,
            distanceIncrementMeters: 200,
            delayRate: 5,
            delayIncrementSeconds: 60,
            nightSurcharge: 20,
            nightSurchargeWindowStart: "23:00",
            nightSurchargeWindowEnd: "06:00",
            additionalFees: {},
          },
        });
      if (path === "/api/passenger-app/rides/sim-ride-map-order")
        return response({ ride: ride() });
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected SIM HTTP ${method} ${url}`);
  });
  return { requests, unexpected, fetch };
}
interface TreeNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TreeNode) => boolean): TreeNode[];
  findAllByProps(props: Record<string, unknown>): TreeNode[];
}
interface Renderer {
  root: TreeNode;
  unmount(): void;
}
const mounted: Renderer[] = [];
async function flush() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
async function configured() {
  const http = boundary();
  vi.stubGlobal("fetch", http.fetch);
  vi.stubGlobal("XMLHttpRequest", SimStreamRequest);
  const { runtime } = createNativePassengerBootstrap({
    mode: "configured",
    baseUrl: BASE,
    callbackUri: CALLBACK,
  });
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <NativePassengerApplication runtime={runtime} />,
    ) as unknown as Renderer;
    await flush();
  });
  mounted.push(tree);
  expect(runtime.getSnapshot().phase).toBe("active");
  await act(async () => {
    await runtime.openRideId("sim-ride-map-order");
    await flush();
  });
  expect(runtime.getSnapshot().route).toEqual({
    kind: "ride",
    orderId: "sim-ride-map-order",
  });
  expect(http.unexpected).toEqual([]);
  expect(
    http.requests.filter((row) =>
      row.path.endsWith("/rides/sim-ride-map-order"),
    ).length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    http.requests.every(
      (row) =>
        row.method === "GET" &&
        row.authorization === `Bearer ${PAIR.accessToken}`,
    ),
  ).toBe(true);
  expect(external.streams).toHaveLength(1);
  expect(external.streams[0]?.headers.Authorization).toBe(
    `Bearer ${PAIR.accessToken}`,
  );
  return { tree, runtime, http, stream: external.streams[0]! };
}
function map(tree: Renderer) {
  const nodes = tree.root.findAll(
    (node) =>
      node.type === "SimNativeMapView" &&
      node.props.testID === "passenger-ride-map-view",
  );
  expect(
    nodes,
    "configured ride must mount the actual native map renderer",
  ).toHaveLength(1);
  return nodes[0]!;
}
function marker(tree: Renderer, kind: "driver" | "pickup" | "dropoff") {
  const nodes = tree.root.findAll(
    (node) =>
      node.type === "SimNativeMapMarker" &&
      node.props.testID === `passenger-ride-map-${kind}-pin`,
  );
  expect(nodes).toHaveLength(1);
  return nodes[0]!;
}
const point = (p: { lat: number; lng: number }) => ({
  latitude: p.lat,
  longitude: p.lng,
});
beforeEach(() => {
  external.platform = "ios";
  external.androidApiKeyConfigured = false;
  external.stored = JSON.stringify(PAIR);
  external.streams.splice(0);
  external.fits.splice(0);
  clock = NOW;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});
afterEach(async () => {
  await act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("configured bootstrap native ride map with actual authority and SSE", () => {
  it("renders actual iOS GPS and endpoints, follows SSE coordinates, and preserves stale/missing/cancelled views", async () => {
    const { tree, runtime, stream, http } = await configured();
    expect(map(tree).props.provider).toBeUndefined();
    expect(marker(tree, "driver").props.coordinate).toEqual(point(DRIVER));
    expect(marker(tree, "pickup").props.coordinate).toEqual(point(PICKUP));
    expect(marker(tree, "dropoff").props.coordinate).toEqual(point(DROPOFF));
    expect(marker(tree, "driver").props.title).toBe("司機目前位置");
    await act(async () => {
      (map(tree).props as { onMapReady(): void }).onMapReady();
      await flush();
    });
    expect(external.fits.at(-1)).toEqual([
      point(DRIVER),
      point(PICKUP),
      point(DROPOFF),
    ]);
    const next = ride("on_trip");
    next.tracking!.location = { ...DRIVER, lat: 25.035, lng: 121.536 };
    await act(async () => {
      stream.event(next, 1);
      await flush();
    });
    expect(marker(tree, "driver").props.coordinate).toEqual({
      latitude: 25.035,
      longitude: 121.536,
    });
    expect(external.fits.at(-1)?.[0]).toEqual({
      latitude: 25.035,
      longitude: 121.536,
    });
    await act(async () => {
      clock = NOW + 61_000;
      runtime.updateClock();
      await flush();
    });
    expect(marker(tree, "driver").props.title).toBe("司機最後回報位置");
    expect(marker(tree, "driver").props.coordinate).toEqual({
      latitude: 25.035,
      longitude: 121.536,
    });
    const missing = ride("on_trip");
    missing.tracking!.location = null;
    missing.tracking!.locationFreshness = "missing";
    await act(async () => {
      stream.event(missing, 2);
      await flush();
    });
    expect(
      tree.root.findAllByProps({ testID: "passenger-ride-map-driver-pin" }),
    ).toHaveLength(0);
    expect(marker(tree, "pickup").props.coordinate).toEqual(point(PICKUP));
    expect(
      tree.root.findAllByProps({ testID: "ride-map-driver-unavailable" })
        .length,
    ).toBeGreaterThan(0);
    await act(async () => {
      stream.event(ride("cancelled"), 3);
      await flush();
    });
    expect(
      tree.root.findAllByProps({ testID: "native-cancelled-card" }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: "passenger-ride-map-view" }),
    ).toHaveLength(0);
    expect(http.unexpected).toEqual([]);
  });
  it("uses the actual Android Google renderer when existing native key metadata is present", async () => {
    external.platform = "android";
    external.androidApiKeyConfigured = true;
    const { tree } = await configured();
    expect(map(tree).props.provider).toBe("google");
    expect(marker(tree, "driver").props.coordinate).toEqual(point(DRIVER));
  });
  it("retains the existing GPS position diagram when Android map configuration is missing", async () => {
    external.platform = "android";
    const { tree } = await configured();
    expect(
      tree.root.findAllByProps({ testID: "passenger-ride-map-view" }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: "native-live-position-diagram" })
        .length,
    ).toBeGreaterThan(0);
  });
});
