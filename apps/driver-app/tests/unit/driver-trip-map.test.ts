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
  default: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("MapView", props, children),
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

describe("DriverTripMap", () => {
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

    expect(text).toContain("導航");
    expect(text).toContain("DRTS 自營路線");
    expect(text).toContain("地圖已載入");
    expect(text).toContain("台北車站");
    expect(text).toContain("25.047800, 121.517000");
    expect(text).toContain("松山機場");
    expect(text).toContain("25.069700, 121.552500");
    expect(text).toContain("GPS 即時回報");
  });

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

    expect(text).toContain("來源平台主導路線");
    expect(text).toContain("來源平台路線鎖定");
    expect(text).toContain("路線也由來源平台指定");
    expect(text).toContain("來源平台目前離線");
    expect(text).toContain("缺少座標");
    expect(text).toContain("無有效座標時不使用地址猜測導航");
    expect(text).toContain("離線備援");
  });
});
