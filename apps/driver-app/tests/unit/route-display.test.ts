import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  View: "View",
}));

vi.mock("@/components/platform-task-badge", () => ({
  default: ({ platformCode }: { platformCode: string | null }) =>
    React.createElement("PlatformTaskBadge", {
      platformCode: platformCode ?? "owned",
    }),
  PlatformAuthorityBanner: () => null,
}));

import RouteDisplay from "../../components/route-display";

function buildTask(
  overrides: Partial<DriverTaskRecord> = {},
): DriverTaskRecord {
  return {
    taskId: "task-001",
    orderId: "order-001",
    dispatchJobId: "job-001",
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

function buildOrder(): OwnedOrderRecord {
  return {
    orderId: "order-001",
    tenantId: "tenant-001",
    serviceBucket: "taxi",
    dispatchSemantics: "exclusive",
    lifecycleState: "active",
    bookingSource: "call_center",
    customerName: "乘客甲",
    customerPhone: "0900000000",
    passengerCount: 1,
    pickup: { address: "台北車站" },
    dropoff: { address: "松山機場" },
    createdAt: "2026-05-05T00:00:00Z",
    updatedAt: "2026-05-05T00:00:00Z",
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
    return collectText(
      (node as React.ReactElement<{ children?: unknown }>).props.children,
    );
  }

  return [];
}

function collectRenderedText(node: unknown): string {
  return collectText(node).join(" ");
}

describe("RouteDisplay", () => {
  it("renders localized forwarded-route copy", () => {
    const tree = RouteDisplay({
      task: buildTask({
        sourcePlatform: "uber",
        routeProvided: false,
      }),
      order: buildOrder(),
    });
    const text = collectRenderedText(tree);

    expect(text).toContain("路線資訊");
    expect(text).toContain("路線鎖定");
    expect(text).toContain("此任務路線由來源平台管理，請依平台同步資訊執行。");
    expect(text).toContain("來源平台未提供完整路線，先顯示上下車點供確認。");
    expect(text).toContain("上車點");
    expect(text).toContain("下車點");
  });

  it("shows localized edit copy for owned tasks", () => {
    const tree = RouteDisplay({
      task: buildTask(),
      order: buildOrder(),
    });
    const text = collectRenderedText(tree);

    expect(text).toContain("編輯路線");
    expect(text).not.toContain("Edit waypoints");
  });
});
