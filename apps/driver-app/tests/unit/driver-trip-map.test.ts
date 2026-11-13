import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Linking: {
    canOpenURL: vi.fn(),
    openURL: vi.fn(),
  },
  Platform: { OS: "ios" },
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
  Marker: (props: Record<string, unknown>) =>
    React.createElement("Marker", props),
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

import DriverTripMap from "../../components/driver-trip-map";
import DriverTripMapWeb from "../../components/driver-trip-map.web";
import MapView from "react-native-maps";
import { Linking } from "react-native";

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

function renderDriverTripMapText(
  props: React.ComponentProps<typeof DriverTripMap>,
): string {
  return collectText(React.createElement(DriverTripMap, props)).join(" ");
}

function collectHostElements(
  node: unknown,
): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    return node.flatMap(collectHostElements);
  }
  if (!React.isValidElement(node)) {
    return [];
  }
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (typeof element.type === "function") {
    const renderFunction = element.type as (
      props: typeof element.props,
    ) => React.ReactNode;
    return collectHostElements(renderFunction(element.props));
  }
  return [element, ...collectHostElements(element.props.children)];
}

describe("DriverTripMap", () => {
  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "retains pickup and dropoff navigation when canonical waypoints are empty in the %s component",
    (_platform, Component) => {
      const hosts = collectHostElements(
        React.createElement(Component, {
          task: buildTask({ waypoints: [] }),
          order: buildOrder(),
          driverLocation: null,
        }),
      );
      expect(
        hosts
          .filter(
            (host) =>
              typeof host.props.accessibilityLabel === "string" &&
              host.props.accessibilityLabel.startsWith("Google navigation to "),
          )
          .map((host) => host.props.accessibilityLabel),
      ).toEqual([
        "Google navigation to pickup",
        "Google navigation to dropoff",
      ]);
    },
  );

  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "renders every canonical stop and hands each actual coordinate to navigation in the %s component",
    async (platform, Component) => {
      const waypoints: DriverTaskRecord["waypoints"] = [
        {
          sequence: 0,
          label: "行程起點",
          address: "台北車站",
          lat: 25.0478,
          lng: 121.517,
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
          sequence: 3,
          label: "行程終點",
          address: "松山機場",
          lat: 25.0697,
          lng: 121.5525,
          arrivedAt: null,
          departedAt: null,
        },
      ];
      const element = React.createElement(Component, {
        task: buildTask({ waypoints }),
        order: buildOrder(),
        driverLocation: null,
        nativeMapAvailable: true,
      });
      const text = collectText(element).join(" ");
      expect(text.indexOf("行程起點")).toBeLessThan(text.indexOf("中途景點"));
      expect(text.indexOf("中途景點")).toBeLessThan(text.indexOf("再次停靠"));
      expect(text.indexOf("再次停靠")).toBeLessThan(text.indexOf("行程終點"));
      expect(text).toContain("不代表已計算路線、ETA 或行程進度");

      const hosts = collectHostElements(element);
      const buttons = hosts.filter(
        (host) =>
          typeof host.props.accessibilityLabel === "string" &&
          host.props.accessibilityLabel.startsWith("Google navigation to "),
      );
      expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
        "Google navigation to waypoint-0",
        "Google navigation to waypoint-1",
        "Google navigation to waypoint-2",
        "Google navigation to waypoint-3",
      ]);
      vi.mocked(Linking.canOpenURL).mockResolvedValue(false);
      vi.mocked(Linking.openURL).mockClear().mockResolvedValue(undefined);
      for (const button of buttons) {
        expect(typeof button.props.onPress).toBe("function");
        (button.props.onPress as () => void)();
      }
      await vi.waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(4));
      expect(vi.mocked(Linking.openURL).mock.calls.map(([url]) => url)).toEqual(
        [
          "https://www.google.com/maps/dir/?api=1&destination=25.0478%2C121.517&travelmode=driving",
          "https://www.google.com/maps/dir/?api=1&destination=25.8%2C121.8&travelmode=driving",
          "https://www.google.com/maps/dir/?api=1&destination=25.0478%2C121.517&travelmode=driving",
          "https://www.google.com/maps/dir/?api=1&destination=25.0697%2C121.5525&travelmode=driving",
        ],
      );

      if (platform === "native") {
        const markers = hosts.filter((host) => host.type === "Marker");
        expect(markers.map((marker) => marker.props.coordinate)).toEqual([
          { latitude: 25.0478, longitude: 121.517 },
          { latitude: 25.8, longitude: 121.8 },
          { latitude: 25.0478, longitude: 121.517 },
          { latitude: 25.0697, longitude: 121.5525 },
        ]);
        expect(vi.mocked(MapView).mock.calls.at(-1)?.[0]).toMatchObject({
          initialRegion: {
            latitude: (25.0478 + 25.8) / 2,
            longitude: (121.517 + 121.8) / 2,
            latitudeDelta: (25.8 - 25.0478) * 1.6,
            longitudeDelta: (121.8 - 121.517) * 1.6,
          },
        });
      } else {
        expect(hosts.some((host) => host.type === "MapView")).toBe(false);
      }
    },
  );

  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "keeps an invalid intermediate stop visible and disables its navigation in the %s component",
    async (_platform, Component) => {
      const element = React.createElement(Component, {
        task: buildTask({
          waypoints: [
            {
              sequence: 0,
              label: "行程起點",
              address: "起點地址",
              lat: 25,
              lng: 121,
              arrivedAt: null,
              departedAt: null,
            },
            {
              sequence: 1,
              label: "待確認中途站",
              address: "中途地址文字",
              lat: 91,
              lng: 121.8,
              arrivedAt: null,
              departedAt: null,
            },
            {
              sequence: 2,
              label: "行程終點",
              address: "終點地址",
              lat: 26,
              lng: 122,
              arrivedAt: null,
              departedAt: null,
            },
          ],
        }),
        order: buildOrder(),
        driverLocation: null,
        nativeMapAvailable: true,
      });
      const text = collectText(element).join(" ");
      expect(text).toContain("待確認中途站");
      expect(text).toContain("中途地址文字");
      expect(text).toContain("座標缺失");
      expect(text).toContain("無有效座標時不使用地址猜測導航");
      const hosts = collectHostElements(element);
      const labels = hosts.map((host) => host.props.accessibilityLabel);
      expect(labels).not.toContain("Google navigation to waypoint-1");
      expect(labels).not.toContain("System navigation to waypoint-1");
      const destinationButton = hosts.find(
        (host) =>
          host.props.accessibilityLabel === "Google navigation to waypoint-2",
      );
      expect(destinationButton).toBeDefined();
      vi.mocked(Linking.canOpenURL).mockResolvedValue(false);
      vi.mocked(Linking.openURL).mockClear().mockResolvedValue(undefined);
      (destinationButton?.props.onPress as () => void)();
      await vi.waitFor(() =>
        expect(Linking.openURL).toHaveBeenCalledWith(
          "https://www.google.com/maps/dir/?api=1&destination=26%2C122&travelmode=driving",
        ),
      );
    },
  );

  it.each([
    ["native", DriverTripMap],
    ["web", DriverTripMapWeb],
  ] as const)(
    "preserves the forwarded platform stop order and route lock in the actual %s component",
    (_platform, Component) => {
      const task = buildTask({
        sourcePlatform: "grab",
        routeProvided: false,
        waypoints: [
          {
            sequence: 9,
            label: "來源第一站",
            address: "來源地址甲",
            lat: 24,
            lng: 120,
            arrivedAt: null,
            departedAt: null,
          },
          {
            sequence: 2,
            label: "來源第二站",
            address: "來源地址乙",
            lat: 25,
            lng: 121,
            arrivedAt: null,
            departedAt: null,
          },
        ],
      });
      const before = JSON.stringify(task);
      const text = collectText(
        React.createElement(Component, {
          task,
          order: buildOrder(),
          driverLocation: null,
        }),
      ).join(" ");
      expect(text.indexOf("來源第一站")).toBeLessThan(
        text.indexOf("來源第二站"),
      );
      expect(text).toContain("Forwarded route - source platform authority");
      expect(text).toContain("來源平台路線鎖定");
      expect(text).toContain("改路線需聯絡派車台或來源平台");
      expect(text).not.toContain("台北車站");
      expect(JSON.stringify(task)).toBe(before);
    },
  );

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

    expect(text).toContain("Trip Map & Navigation Handoff");
    expect(text).toContain("DRTS-owned route");
    expect(text).toContain("Google native map active");
    expect(text).toContain("台北車站");
    expect(text).toContain("25.047800, 121.517000");
    expect(text).toContain("松山機場");
    expect(text).toContain("25.069700, 121.552500");
    expect(text).toContain("GPS 即時回報");
    expect(vi.mocked(MapView).mock.calls.at(-1)?.[0]).toMatchObject({
      showsUserLocation: true,
      showsMyLocationButton: true,
    });
  });

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
          expect(text).not.toContain("heartbeat");
          expect(text).not.toContain("GPS 即時回報");
          expect(text).toContain("台北車站");
          expect(text).toContain("松山機場");
          if (driverLocation) {
            expect(text).toContain("最後已知座標");
            expect(text).toMatch(
              /Last driver coordinate\s+25\.050000, 121\.520000/,
            );
          } else {
            expect(text).toContain("沒有可顯示的最後定位");
          }
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

  it("shows forwarded authority, source offline fallback, and missing-coordinate degraded copy", () => {
    const text = renderDriverTripMapText({
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

    expect(text).toContain("Forwarded route - source platform authority");
    expect(text).toContain("來源平台路線鎖定");
    expect(text).toContain("source platform route intent");
    expect(text).toContain("來源平台離線");
    expect(text).toContain("缺少座標");
    expect(text).toContain("無有效座標時不使用地址猜測導航");
    expect(text).toContain("Offline fallback");
  });
});
