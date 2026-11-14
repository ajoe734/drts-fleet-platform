import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassengerRideAuthorityView } from "@drts/contracts";

// External SIM boundaries only. Bootstrap, Runtime, Application, booking screen,
// authenticated transport and booking/geo SDK methods are the actual modules.
const external = vi.hoisted(() => ({
  platform: "ios" as "ios" | "android" | "web",
  androidApiKeyConfigured: false,
  stored: "",
  sequence: 0,
  fits: [] as Array<Array<{ latitude: number; longitude: number }>>,
  streams: [] as Array<{
    method: string;
    url: string;
    headers: Record<string, string>;
    sent: boolean;
    aborted: boolean;
  }>,
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
const BASE = "https://native-map-bootstrap.example.invalid";
const CALLBACK = "drtspassenger://auth/callback";
const PAIR = {
  accessToken: "sim-map-passenger-access",
  refreshToken: "sim-map-passenger-refresh",
};
const LOCAL_TIME = "2099-10-11T12:00";
const SCHEDULED_AT = new Date(2099, 9, 11, 12, 0).toISOString();
const ACCOUNT = {
  drtsPassengerId: "sim-map-passenger",
  displayName: "地圖測試乘客",
  contactPhone: "+886900000000",
  contactPhoneVerified: true,
  feeAcknowledgementVersion: "sim-map-fare-v1",
  status: "active",
  createdAt: "2026-11-07T00:00:00Z",
};
const PICK = { lat: 25.031, lng: 121.531 };
const DROP = { lat: 25.042, lng: 121.542 };
const DRAG_PICK = { lat: 25.053, lng: 121.553 };
const DRAG_DROP = { lat: 25.064, lng: 121.564 };
type Point = { lat: number; lng: number };
// The provider's authoritative address may use a nearby resolved coordinate.
// Existing native semantics must use that returned coordinate for quote/create.
function resolved(point: Point) {
  return {
    lat: point.lat + 0.0001,
    lng: point.lng - 0.0001,
    address: `SIM 反查地址 ${point.lat},${point.lng}`,
  };
}
function response(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
interface HttpCall {
  path: string;
  method: string;
  authorization: string | null;
  requestId: string | null;
  body?: string;
}
function httpBoundary() {
  const calls: HttpCall[] = [];
  const unexpected: string[] = [];
  let quoteSequence = 0;
  let created: PassengerRideAuthorityView | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const headers = new Headers(init?.headers);
    const call: HttpCall = {
      path,
      method: init?.method ?? "GET",
      authorization: headers.get("Authorization"),
      requestId: headers.get("x-request-id"),
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    };
    calls.push(call);
    if (parsed.origin === BASE && call.method === "GET") {
      if (path === "/api/passenger-app/me")
        return response({ account: ACCOUNT });
      if (path === "/api/passenger-app/fares")
        return response({
          currentVersion: {
            version: "sim-map-fare-v1",
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
      if (path === "/api/passenger-app/settings")
        return response({
          minLeadTimeMinutes: 30,
          requireSmsVerification: false,
        });
      if (path === "/api/passenger-app/payment-methods")
        return response({
          methods: [
            {
              paymentMethodId: "sim-map-card",
              last4: "4242",
              cardType: "VISA",
              expiryMonth: "12",
              expiryYear: "2099",
              isDefault: true,
            },
          ],
        });
      if (parsed.pathname === "/api/geo/search") {
        const pickup = parsed.searchParams.get("q") === "Pickup";
        return response({
          candidates: [
            {
              candidateId: pickup ? "PICK" : "DROP",
              provider: "sim-geo",
              displayName: pickup ? "SIM 搜尋上車" : "SIM 搜尋下車",
              address: pickup ? "SIM 搜尋上車" : "SIM 搜尋下車",
              confidence: "exact",
              location: pickup ? PICK : DROP,
            },
          ],
          provider: "sim-geo",
          generatedAt: "2026-11-07T00:00:00Z",
        });
      }
      if (path === "/api/passenger-app/rides/sim-map-created" && created)
        return response({ ride: created });
    }
    if (parsed.origin === BASE && call.method === "POST") {
      const body = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
      if (path === "/api/geo/reverse")
        return response({
          address: {
            ...resolved(body.location as Point),
            coordinateSource: "reverse_geocode",
            geocodeConfidence: "exact",
            resolvedAt: "2026-11-07T00:00:00Z",
          },
          provider: "sim-geo",
          resolvedAt: "2026-11-07T00:00:00Z",
        });
      if (path === "/api/geo/resolve")
        return response({
          address: {
            ...(body.selectedPoint as Point),
            address: body.addressText,
            coordinateSource: "provider_candidate",
            geocodeConfidence: "exact",
            resolvedAt: "2026-11-07T00:00:00Z",
          },
          provider: "sim-geo",
          resolvedAt: "2026-11-07T00:00:00Z",
        });
      if (path === "/api/passenger-app/quotes")
        return response({
          serviceAreaResult: "serviceable",
          estimatedMin: 200,
          estimatedMax: 300,
          fareVersion: "sim-map-fare-v1",
          fareSnapshotId: `sim-map-quote-${++quoteSequence}`,
          expiresAt: "2099-10-11T13:00:00Z",
        });
      if (path === "/api/passenger-app/rides") {
        created = {
          order: {
            orderId: "sim-map-created",
            orderNo: "SIM-MAP",
            status: "created",
            timingMode: "scheduled",
            requestedPickupAt: body.scheduledAt as string,
            pickup:
              body.origin as PassengerRideAuthorityView["order"]["pickup"],
            dropoff:
              body.destination as PassengerRideAuthorityView["order"]["dropoff"],
            cancelableUntil: null,
            cancelledAt: null,
            completedAt: null,
          },
          assignment: null,
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
        return response({ ride: created });
      }
    }
    unexpected.push(`${call.method} ${url}`);
    throw new Error(`Unexpected SIM HTTP: ${call.method} ${url}`);
  });
  return {
    calls,
    unexpected,
    fetch,
    matching: (path: string, method = "POST") =>
      calls.filter((call) => call.path === path && call.method === method),
  };
}
interface TreeNode {
  type: unknown;
  props: Record<string, unknown>;
  findByProps(props: Record<string, unknown>): TreeNode;
  findAllByProps(props: Record<string, unknown>): TreeNode[];
  findAll(predicate: (node: TreeNode) => boolean): TreeNode[];
}
interface Renderer {
  root: TreeNode;
  unmount(): void;
}
const mounted: Renderer[] = [];
async function flush() {
  for (let i = 0; i < 100; ++i) await Promise.resolve();
}
class SimStreamRequest {
  readyState = 0;
  status = 0;
  responseText = "";
  response: unknown = null;
  responseType = "";
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  readonly record = {
    method: "",
    url: "",
    headers: {} as Record<string, string>,
    sent: false,
    aborted: false,
  };
  constructor() {
    external.streams.push(this.record);
  }
  open(method: string, url: string) {
    this.record.method = method;
    this.record.url = url;
    this.readyState = 1;
  }
  setRequestHeader(name: string, value: string) {
    this.record.headers[name] = value;
  }
  getResponseHeader() {
    return "text/event-stream";
  }
  send() {
    this.record.sent = true;
  }
  abort() {
    this.record.aborted = true;
  }
}
async function configured(f: ReturnType<typeof httpBoundary>) {
  vi.stubGlobal("fetch", f.fetch);
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
  expect(runtime.options.mode).toBe("configured");
  expect(runtime.getSnapshot().phase).toBe("active");
  expect(
    f.calls.some(
      (call) =>
        call.path === "/api/passenger-app/me" &&
        call.authorization === `Bearer ${PAIR.accessToken}`,
    ),
  ).toBe(true);
  return { tree, runtime };
}
async function press(tree: Renderer, id: string) {
  await act(async () => {
    await (
      tree.root.findByProps({ testID: id }).props as {
        onPress(): void | Promise<void>;
      }
    ).onPress();
    await flush();
  });
}
async function enter(tree: Renderer, id: string, value: string) {
  await act(async () => {
    (
      tree.root.findByProps({ testID: id }).props as {
        onChangeText(value: string): void;
      }
    ).onChangeText(value);
    await flush();
  });
}
function maps(tree: Renderer) {
  return tree.root.findAll((node) => node.type === "SimNativeMapView");
}
function nativeMap(tree: Renderer) {
  const nodes = maps(tree);
  expect(
    nodes,
    "configured bootstrap must mount one actual native map renderer",
  ).toHaveLength(1);
  return nodes[0]!;
}
function marker(tree: Renderer, field: "origin" | "destination") {
  const nodes = tree.root.findAll(
    (node) =>
      node.type === "SimNativeMapMarker" &&
      node.props.testID === `passenger-booking-map-${field}-pin`,
  );
  expect(nodes).toHaveLength(1);
  return nodes[0]!;
}
async function ready(tree: Renderer) {
  await act(async () => {
    (nativeMap(tree).props as { onMapReady(): void }).onMapReady();
    await flush();
  });
}
async function pick(tree: Renderer, point: Point) {
  await act(async () => {
    (
      nativeMap(tree).props as {
        onPress(event: {
          nativeEvent: { coordinate: { latitude: number; longitude: number } };
        }): void;
      }
    ).onPress({
      nativeEvent: {
        coordinate: { latitude: point.lat, longitude: point.lng },
      },
    });
    await flush();
  });
}
async function drag(
  tree: Renderer,
  field: "origin" | "destination",
  point: Point,
) {
  await act(async () => {
    (
      marker(tree, field).props as {
        onDragEnd(event: {
          nativeEvent: { coordinate: { latitude: number; longitude: number } };
        }): void;
      }
    ).onDragEnd({
      nativeEvent: {
        coordinate: { latitude: point.lat, longitude: point.lng },
      },
    });
    await flush();
  });
}
function body(call: HttpCall | undefined) {
  expect(call).toBeDefined();
  return JSON.parse(call!.body ?? "{}") as Record<string, unknown>;
}
function expectReverse(f: ReturnType<typeof httpBoundary>, points: Point[]) {
  expect(f.matching("/api/geo/reverse").map((call) => body(call))).toEqual(
    points.map((location) => ({ location, surface: "passenger_entry" })),
  );
  expect(
    f
      .matching("/api/geo/reverse")
      .every((call) => call.authorization === `Bearer ${PAIR.accessToken}`),
  ).toBe(true);
}
function expectQuote(
  f: ReturnType<typeof httpBoundary>,
  origin: Point,
  destination: Point,
) {
  const calls = f.matching("/api/passenger-app/quotes");
  expect(body(calls[calls.length - 1])).toEqual({
    originLat: origin.lat,
    originLng: origin.lng,
    destinationLat: destination.lat,
    destinationLng: destination.lng,
    scheduledAt: SCHEDULED_AT,
  });
  expect(
    calls.every((call) => call.authorization === `Bearer ${PAIR.accessToken}`),
  ).toBe(true);
}
beforeEach(() => {
  external.platform = "ios";
  external.androidApiKeyConfigured = false;
  external.stored = JSON.stringify(PAIR);
  external.sequence = 0;
  external.fits.length = 0;
  external.streams.length = 0;
});
afterEach(async () => {
  await act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
    await flush();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Configured native passenger map through the actual booking application", () => {
  it("uses the default iOS Apple map caller to reverse selected points and create the quoted ride", async () => {
    const f = httpBoundary();
    const { tree, runtime } = await configured(f);
    const map = nativeMap(tree);
    expect(map.props.provider).toBeUndefined();
    expect(map.props.showsUserLocation).toBe(false);
    expect(
      tree.root.findAll((node) => node.type === "SimNativeMapMarker"),
    ).toHaveLength(0);
    expect(f.matching("/api/geo/reverse")).toHaveLength(0);
    await ready(tree);
    expect(f.matching("/api/geo/reverse")).toHaveLength(0);
    await pick(tree, PICK);
    await press(tree, "booking-map-select-destination");
    await pick(tree, DROP);
    expectReverse(f, [PICK, DROP]);
    const origin = resolved(PICK);
    const destination = resolved(DROP);
    expect(marker(tree, "origin").props.coordinate).toEqual({
      latitude: origin.lat,
      longitude: origin.lng,
    });
    expect(marker(tree, "destination").props.coordinate).toEqual({
      latitude: destination.lat,
      longitude: destination.lng,
    });
    expect(external.fits.at(-1)).toEqual([
      { latitude: origin.lat, longitude: origin.lng },
      { latitude: destination.lat, longitude: destination.lng },
    ]);
    await enter(tree, "booking-time", LOCAL_TIME);
    await press(tree, "booking-quote");
    expectQuote(f, origin, destination);
    await press(tree, "booking-confirm-checkbox");
    await press(tree, "booking-submit");
    const creates = f.matching("/api/passenger-app/rides");
    expect(creates).toHaveLength(1);
    expect(creates[0]!.authorization).toBe(`Bearer ${PAIR.accessToken}`);
    expect(creates[0]!.requestId).toMatch(/^map-platform-\d+$/);
    const command = body(creates[0]);
    expect(command).toEqual({
      scheduledAt: SCHEDULED_AT,
      origin,
      destination,
      paymentMethodId: "sim-map-card",
      fareSnapshotId: "sim-map-quote-1",
      passengerConfirmedAt: expect.any(String),
    });
    expect(
      Number.isFinite(Date.parse(command.passengerConfirmedAt as string)),
    ).toBe(true);
    expect(runtime.getSnapshot().route).toEqual({
      kind: "ride",
      orderId: "sim-map-created",
    });
    expect(
      f.matching("/api/passenger-app/rides/sim-map-created", "GET"),
    ).toHaveLength(1);
    expect(external.streams).toHaveLength(1);
    expect(external.streams[0]).toMatchObject({
      method: "GET",
      url: `${BASE}/api/passenger-app/rides/sim-map-created/events`,
      sent: true,
      headers: {
        Authorization: `Bearer ${PAIR.accessToken}`,
        Accept: "text/event-stream",
      },
    });
    expect(f.unexpected).toEqual([]);
  });

  it("uses configured Android Google maps and reverse-resolves both marker drags before a replacement quote", async () => {
    external.platform = "android";
    external.androidApiKeyConfigured = true;
    const f = httpBoundary();
    const { tree } = await configured(f);
    expect(nativeMap(tree).props.provider).toBe("google");
    await ready(tree);
    await pick(tree, PICK);
    await press(tree, "booking-map-select-destination");
    await pick(tree, DROP);
    await enter(tree, "booking-time", LOCAL_TIME);
    await press(tree, "booking-quote");
    expectQuote(f, resolved(PICK), resolved(DROP));
    await press(tree, "booking-modify");
    expect(marker(tree, "origin").props.draggable).toBe(true);
    expect(marker(tree, "destination").props.draggable).toBe(true);
    await drag(tree, "origin", DRAG_PICK);
    await drag(tree, "destination", DRAG_DROP);
    expectReverse(f, [PICK, DROP, DRAG_PICK, DRAG_DROP]);
    const origin = resolved(DRAG_PICK);
    const destination = resolved(DRAG_DROP);
    expect(marker(tree, "origin").props.coordinate).toEqual({
      latitude: origin.lat,
      longitude: origin.lng,
    });
    expect(marker(tree, "destination").props.coordinate).toEqual({
      latitude: destination.lat,
      longitude: destination.lng,
    });
    expect(tree.root.findAllByProps({ testID: "booking-e19b" })).toHaveLength(
      0,
    );
    await press(tree, "booking-quote");
    expect(f.matching("/api/passenger-app/quotes")).toHaveLength(2);
    expectQuote(f, origin, destination);
    expect(
      tree.root.findByProps({ testID: "booking-confirm-checkbox" }).props
        .accessibilityState,
    ).toMatchObject({ checked: false });
    expect(f.matching("/api/passenger-app/rides")).toHaveLength(0);
    expect(f.unexpected).toEqual([]);
  });

  it("keeps Android without a key and web unavailable while real address search and resolve still permit quoting", async () => {
    for (const platform of ["android", "web"] as const) {
      external.platform = platform;
      external.androidApiKeyConfigured = platform === "web";
      const f = httpBoundary();
      const { tree, runtime } = await configured(f);
      expect(runtime.options.bookingMap).toEqual({ status: "unavailable" });
      expect(maps(tree)).toHaveLength(0);
      expect(
        tree.root.findAll((node) => node.type === "SimNativeMapMarker"),
      ).toHaveLength(0);
      expect(
        tree.root.findAllByProps({ testID: "booking-map-unavailable" }).length,
      ).toBeGreaterThan(0);
      expect(f.matching("/api/geo/reverse")).toHaveLength(0);
      expect(f.matching("/api/geo/resolve")).toHaveLength(0);
      await enter(tree, "booking-time", LOCAL_TIME);
      expect(
        tree.root.findByProps({ testID: "booking-quote" }).props.disabled,
      ).toBe(true);
      await enter(tree, "booking-origin-query", "Pickup");
      await press(tree, "booking-origin-search");
      await press(tree, "booking-origin-candidate-PICK");
      await enter(tree, "booking-destination-query", "Dropoff");
      await press(tree, "booking-destination-search");
      await press(tree, "booking-destination-candidate-DROP");
      const searches = f.calls.filter(
        (call) =>
          call.method === "GET" && call.path.startsWith("/api/geo/search?"),
      );
      expect(searches).toHaveLength(2);
      expect(
        searches.map((call) =>
          new URL(`${BASE}${call.path}`).searchParams.get("surface"),
        ),
      ).toEqual(["passenger_entry", "passenger_entry"]);
      expect(
        searches.every(
          (call) => call.authorization === `Bearer ${PAIR.accessToken}`,
        ),
      ).toBe(true);
      expect(f.matching("/api/geo/resolve").map((call) => body(call))).toEqual([
        {
          candidateId: "PICK",
          addressText: "SIM 搜尋上車",
          selectedPoint: PICK,
          surface: "passenger_entry",
        },
        {
          candidateId: "DROP",
          addressText: "SIM 搜尋下車",
          selectedPoint: DROP,
          surface: "passenger_entry",
        },
      ]);
      expect(
        f
          .matching("/api/geo/resolve")
          .every((call) => call.authorization === `Bearer ${PAIR.accessToken}`),
      ).toBe(true);
      expect(f.matching("/api/geo/reverse")).toHaveLength(0);
      expect(
        tree.root.findByProps({ testID: "booking-quote" }).props.disabled,
      ).toBe(false);
      await press(tree, "booking-quote");
      expectQuote(f, PICK, DROP);
      expect(f.matching("/api/passenger-app/rides")).toHaveLength(0);
      expect(f.unexpected).toEqual([]);
      await act(async () => {
        tree.unmount();
        await flush();
      });
      mounted.splice(mounted.indexOf(tree), 1);
    }
  });
});
