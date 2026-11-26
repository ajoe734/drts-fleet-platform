import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

const native = vi.hoisted(() => ({
  platform: { OS: "ios" },
  modules: {} as { DRTSDriverMapConfig?: { googleMapsConfigured: boolean } },
  managers: new Set<string>(),
  hasNativeModules: true,
  hasUIManager: true,
}));

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Linking: {
    canOpenURL: vi.fn(),
    openURL: vi.fn(),
  },
  Platform: native.platform,
  get NativeModules() {
    return native.hasNativeModules ? native.modules : undefined;
  },
  get UIManager() {
    return native.hasUIManager
      ? { hasViewManagerConfig: (name: string) => native.managers.has(name) }
      : undefined;
  },
  Pressable: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("Pressable", props, children),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("Text", props, children),
  View: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("View", props, children),
}));

vi.mock("react-native-maps", () => ({
  default: vi.fn(
    ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement("MapView", props, children),
  ),
  Marker: vi.fn((props: Record<string, unknown>) =>
    React.createElement("Marker", props),
  ),
  PROVIDER_GOOGLE: "google",
}));

vi.mock("@/components/canvas-primitives", () => ({
  driverCanvasTheme: {
    accent: "#7BC0FF",
    accentHi: "#A9D6FF",
    accentBg: "#0F2236",
    accentBorder: "#1B3A5A",
    bg: "#05070A",
    border: "#273244",
    borderStrong: "#3A4A63",
    danger: "#FF6B6B",
    dangerBg: "#351618",
    dangerBorder: "#7A2A2F",
    fontFamily: "System",
    info: "#7BC0FF",
    infoBg: "#0F2236",
    infoBorder: "#1B3A5A",
    monoFamily: "monospace",
    neutralBg: "#161B24",
    neutralBorder: "#273244",
    surface: "#111722",
    surfaceLo: "#0B111A",
    success: "#42D392",
    successBg: "#0C2A1D",
    successBorder: "#1D6B49",
    text: "#F7FAFC",
    textMuted: "#9AA8BA",
    warn: "#FFD166",
    warnBg: "#2F250C",
    warnBorder: "#7A5A11",
  },
}));

import { Linking } from "react-native";
import DriverTripMap from "../../components/driver-trip-map";
import DriverTripMapWeb from "../../components/driver-trip-map.web";
import MapView, { Marker } from "react-native-maps";

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
    },
    dropoff: {
      address: "松山機場",
      lat: 25.0697,
      lng: 121.5525,
      geocodeProvider: "drts_geocoder",
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

function collectText(node: unknown): string[] {
  if (node == null) {
    return [];
  }

  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) => collectText(child));
  }

  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: unknown }>;
    if (typeof element.type === "function") {
      const renderFunction = element.type as (
        props: typeof element.props,
      ) => React.ReactNode;
      return collectText(renderFunction(element.props));
    }

    return collectText(element.props.children);
  }

  if (typeof node === "object" && "children" in node) {
    return collectText((node as { children?: unknown }).children);
  }

  return [];
}

function collectPressables(
  node: unknown,
): { label: string; onPress: () => void }[] {
  if (Array.isArray(node)) return node.flatMap(collectPressables);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{
    children?: unknown;
    accessibilityLabel?: string;
    onPress?: () => void;
  }>;
  if (typeof element.type === "function") {
    const renderFunction = element.type as (
      props: typeof element.props,
    ) => React.ReactNode;
    return collectPressables(renderFunction(element.props));
  }
  const own =
    element.type === "Pressable" && element.props.onPress
      ? [
          {
            label: element.props.accessibilityLabel ?? "",
            onPress: element.props.onPress,
          },
        ]
      : [];
  return [...own, ...collectPressables(element.props.children)];
}

function renderDriverTripMapText(
  props: React.ComponentProps<typeof DriverTripMap>,
): string {
  return collectText(React.createElement(DriverTripMap, props)).join(" ");
}

// Drivers see map/app brand names and GPS; everything else is Chinese copy,
// stop addresses and the stop coordinates they can type into a map app.
function expectNoDeveloperCopy(text: string) {
  expect(
    text.replace(/Google|Apple|GPS/g, "").replace(/[\d.,\s-]/g, ""),
  ).not.toMatch(/[A-Za-z]/);
  for (const jargon of [
    "DRTS",
    "polyline",
    "provider",
    "heartbeat",
    "route lock",
    "fallback",
    "權責",
    "交接",
    "Driver coordinate",
  ])
    expect(text).not.toContain(jargon);
}

describe("DriverTripMap", () => {
  const googleIos = ["AIRGoogleMap", "AIRGoogleMapMarker"];
  const defaultMap = ["AIRMap", "AIRMapMarker"];
  beforeEach(() => {
    vi.clearAllMocks();
    native.hasNativeModules = true;
    native.hasUIManager = true;
    native.platform.OS = "ios";
    native.modules.DRTSDriverMapConfig = { googleMapsConfigured: true };
    native.managers.clear();
    for (const name of [...googleIos, ...defaultMap]) native.managers.add(name);
  });

  it("shows the native Google map with real pickup/dropoff coordinates", () => {
    const text = renderDriverTripMapText({
      task: buildTask(),
      order: buildOrder(),
      driverLocation: {
        latitude: 25.05,
        longitude: 121.52,
        accuracyM: 8,
        recordedAt: "2026-07-01T00:00:00.000Z",
      },
      nativeMapAvailable: true,
      now: Date.parse("2026-07-01T00:00:30.000Z"),
    });

    // Card title, then the map panel; no route notice on an owned trip.
    expect(text).toMatch(/^導航 行程地圖 Google 地圖 /);
    expect(text).not.toContain("此單路線由平台決定");
    expect(text).toContain("台北車站");
    expect(text).toContain("25.047800, 121.517000");
    expect(text).toContain("松山機場");
    expect(text).toContain("25.069700, 121.552500");
    expect(text).toContain("GPS 即時回報");
    // The driver's own position is drawn by the map, not printed as numbers.
    expect(text).not.toContain("25.050000, 121.520000");
    expectNoDeveloperCopy(text);
    expect(vi.mocked(MapView).mock.calls.at(-1)?.[0]).toMatchObject({
      provider: "google",
      showsUserLocation: true,
      showsMyLocationButton: true,
    });
  });

  it.each([
    { os: "ios", configured: true, managers: defaultMap, label: "Apple 地圖" },
    {
      os: "ios",
      configured: true,
      managers: ["AIRGoogleMap", ...defaultMap],
      label: "Apple 地圖",
    },
    {
      os: "ios",
      configured: false,
      managers: [...googleIos, ...defaultMap],
      label: "Apple 地圖",
    },
    {
      os: "ios",
      configured: false,
      managers: ["AIRMap"],
      label: "請用下方按鈕開啟導航",
    },
    {
      os: "android",
      configured: true,
      managers: defaultMap,
      label: "Google 地圖",
    },
    {
      os: "android",
      configured: false,
      managers: defaultMap,
      label: "請用下方按鈕開啟導航",
    },
    {
      os: "android",
      configured: true,
      managers: ["AIRMap"],
      label: "請用下方按鈕開啟導航",
    },
  ])(
    "uses the packaged map and pins on $os ($configured, $managers)",
    ({ os, configured, managers, label }) => {
      native.platform.OS = os;
      native.modules.DRTSDriverMapConfig = { googleMapsConfigured: configured };
      native.managers.clear();
      for (const name of managers) native.managers.add(name);
      const text = renderDriverTripMapText({
        task: buildTask(),
        order: buildOrder(),
        driverLocation: null,
      });
      expect(text).toContain(label);
      expect(text).toContain("25.047800, 121.517000");
      if (label === "請用下方按鈕開啟導航") {
        expect(MapView).not.toHaveBeenCalled();
        expect(Marker).not.toHaveBeenCalled();
      } else {
        expect(vi.mocked(MapView).mock.calls[0][0].provider).toBe(
          label === "Google 地圖" ? "google" : undefined,
        );
        expect(
          vi.mocked(Marker).mock.calls.map(([props]) => props.coordinate),
        ).toEqual([
          { latitude: 25.0478, longitude: 121.517 },
          { latitude: 25.0697, longitude: 121.5525 },
        ]);
      }
    },
  );

  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "hands the stop coordinate to Google navigation from the %s card",
    async (_platform, Component) => {
      vi.mocked(Linking.canOpenURL).mockResolvedValue(true);
      vi.mocked(Linking.openURL).mockResolvedValue(undefined);
      const onNavigationResult = vi.fn();
      const pressables = collectPressables(
        React.createElement(Component, {
          task: buildTask(),
          order: buildOrder(),
          driverLocation: null,
          onNavigationResult,
        }),
      );
      expect(pressables.map((item) => item.label)).toEqual([
        "用 Google 導航到上車點",
        "用 Apple 導航到上車點",
        "用 Google 導航到下車點",
        "用 Apple 導航到下車點",
      ]);

      pressables[2]!.onPress();
      await vi.waitFor(() =>
        expect(onNavigationResult).toHaveBeenCalledWith({
          status: "opened",
          provider: "google",
          url: "comgooglemaps://?daddr=25.0697,121.5525&directionsmode=driving",
          fallback: false,
        }),
      );
      expect(Linking.openURL).toHaveBeenCalledWith(
        "comgooglemaps://?daddr=25.0697,121.5525&directionsmode=driving",
      );
    },
  );

  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "labels the second navigation button 系統導航 on Android in the %s card",
    (_platform, Component) => {
      native.platform.OS = "android";
      const texts = collectText(
        React.createElement(Component, {
          task: buildTask(),
          order: buildOrder(),
          driverLocation: null,
        }),
      );
      expect(texts.filter((value) => value === "系統導航")).toHaveLength(2);
      expect(texts.join(" ")).not.toContain("系統 導航");
      expect(
        collectPressables(
          React.createElement(Component, {
            task: buildTask(),
            order: buildOrder(),
            driverLocation: null,
          }),
        ).map((item) => item.label),
      ).toContain("用系統導航到上車點");
    },
  );

  it("keeps navigation available in earlier Android builds without packaged capability metadata", () => {
    native.platform.OS = "android";
    delete native.modules.DRTSDriverMapConfig;
    const text = renderDriverTripMapText({
      task: buildTask(),
      order: buildOrder(),
      driverLocation: null,
    });
    expect(text).toContain("請用下方按鈕開啟導航");
    expect(MapView).not.toHaveBeenCalled();
  });

  it.each([
    ["ios", false, true, "Apple 地圖"],
    ["ios", true, false, "請用下方按鈕開啟導航"],
    ["android", false, true, "請用下方按鈕開啟導航"],
  ] as const)(
    "selects a usable map on %s when NativeModules=%s and UIManager=%s",
    (os, modules, manager, label) => {
      native.platform.OS = os;
      native.hasNativeModules = modules;
      native.hasUIManager = manager;
      const text = renderDriverTripMapText({
        task: buildTask(),
        order: buildOrder(),
        driverLocation: null,
      });
      expect(text).toContain(label);
      expect(MapView).toHaveBeenCalledTimes(label === "Apple 地圖" ? 1 : 0);
    },
  );

  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "shows terminal location history in the actual %s component",
    (platform, Component) => {
      for (const status of ["completed", "cancelled", "rejected"] as const) {
        for (const driverLocation of [
          null,
          {
            latitude: 25.05,
            longitude: 121.52,
            recordedAt: "2026-07-01T00:00:00.000Z",
          },
        ]) {
          const text = collectText(
            React.createElement(Component, {
              task: buildTask({ status }),
              order: buildOrder(),
              driverLocation,
              nativeMapAvailable: true,
              now: Date.parse("2026-07-01T00:00:30.000Z"),
            }),
          ).join(" ");

          expect(text).toContain("本任務定位已停止");
          expect(text).toContain("任務已結束，不再回報你的位置。");
          expect(text).not.toContain("GPS 即時回報");
          expect(text).toContain("台北車站");
          expect(text).toContain("松山機場");
          expect(text).not.toContain("25.050000, 121.520000");
          expectNoDeveloperCopy(text);
          if (platform === "native") {
            expect(vi.mocked(MapView).mock.calls.at(-1)?.[0]).toMatchObject({
              showsUserLocation: false,
              showsMyLocationButton: false,
            });
          }
        }
      }
    },
  );

  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "shows the forwarded route rule, platform offline note and missing-coordinate copy in the %s component",
    (_platform, Component) => {
      const element = React.createElement(Component, {
        task: buildTask({
          sourcePlatform: "grab",
          routeProvided: false,
          routeIntent: "platform_polyline_locked",
        } as Partial<DriverTaskRecord>),
        order: buildOrder({
          dropoff: {
            address: "松山機場",
            lat: null,
            lng: null,
          },
        } as Partial<OwnedOrderRecord>),
        driverLocation: null,
        sourcePlatformOffline: true,
        nativeMapAvailable: false,
      });
      const texts = collectText(element);
      const text = texts.join(" ");

      // Card title, then the one-line forwarded route rule.
      expect(texts.slice(0, 2)).toEqual([
        "導航",
        "此單路線由平台決定，要改路線請先聯絡派車台。",
      ]);
      expect(text).toContain("平台目前離線");
      expect(text).toContain("缺少座標");
      expect(text).toContain("這個地點沒有座標，請聯絡派車台。");
      // The raw platform route-intent code is never shown.
      expect(text).not.toContain("platform_polyline_locked");
      expect(text).not.toContain("grab");
      expectNoDeveloperCopy(text);
      // The stop that has a coordinate still offers both navigation handoffs.
      expect(text).toContain("25.047800, 121.517000");
      expect(text.match(/Google 導航/g)).toHaveLength(1);
    },
  );
});
