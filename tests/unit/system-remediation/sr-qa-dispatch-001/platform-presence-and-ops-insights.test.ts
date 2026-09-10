import { describe, expect, it } from "vitest";

import type {
  DispatchJobRecord,
  DriverTaskRecord,
  MaintenanceRecord,
  OwnedOrderRecord,
} from "@drts/contracts";

import { PlatformPresenceService } from "../../../../apps/api/src/modules/platform-presence/platform-presence.service";
import {
  buildDispatchInsights,
  buildRevenueInsights,
  isMaintenanceOverdue,
} from "../../../../apps/ops-console-web/lib/ops-analytics";

describe("SR-QA-DISPATCH-001: C041 & C042 Platform Presence, Heartbeat & Ops Insights Verification", () => {
  describe("C041: Platform Presence & Heartbeat Governance", () => {
    it("transitions online/offline and calculates 72h reauth warning correctly", async () => {
      const presenceService = new PlatformPresenceService();
      const driverId = "drv-pres-001";
      const nowMs = Date.now();

      // Case A: token expires in 24 hours (within 72h window) -> reauthRequired = true
      const tokenExpiresSoon = new Date(
        nowMs + 24 * 60 * 60 * 1000,
      ).toISOString();
      const onlineSoon = await presenceService.setOnline(
        driverId,
        "uber",
        tokenExpiresSoon,
      );
      expect(onlineSoon.status).toBe("online");
      expect(onlineSoon.reauthRequired).toBe(true);
      expect(onlineSoon.lastOnlineAt).toBeDefined();

      // Case B: token expires in 120 hours (outside 72h window) -> reauthRequired = false
      const tokenExpiresLater = new Date(
        nowMs + 120 * 60 * 60 * 1000,
      ).toISOString();
      const onlineLater = await presenceService.setOnline(
        driverId,
        "line_taxi",
        tokenExpiresLater,
      );
      expect(onlineLater.status).toBe("online");
      expect(onlineLater.reauthRequired).toBe(false);

      // Case C: transition to offline
      const offlineRecord = await presenceService.setOffline(driverId, "uber");
      expect(offlineRecord.status).toBe("offline");
      expect(offlineRecord.lastOfflineAt).toBeDefined();

      // Case D: Driver presence summary includes all platforms
      const summary = await presenceService.summary(driverId);
      expect(summary.driverId).toBe(driverId);
      expect(summary.presences.length).toBe(2);
      expect(summary.adapterStatuses.length).toBe(2);
    });

    it("verifies multi-platform presence reporting maintains driver isolation", async () => {
      const presenceService = new PlatformPresenceService();
      await presenceService.setOnline("drv-alpha", "yoxi");
      await presenceService.setOnline("drv-beta", "uber");

      const alphaSummary = await presenceService.summary("drv-alpha");
      const betaSummary = await presenceService.summary("drv-beta");

      expect(alphaSummary.presences).toHaveLength(1);
      expect(alphaSummary.presences[0].platformCode).toBe("yoxi");

      expect(betaSummary.presences).toHaveLength(1);
      expect(betaSummary.presences[0].platformCode).toBe("uber");
    });
  });

  describe("C042: Operations Dispatch & Revenue Insights", () => {
    it("buildDispatchInsights aggregates active queue, redispatch and exception orders", () => {
      const orders: Partial<OwnedOrderRecord>[] = [
        {
          status: "ready_for_dispatch",
          quotedFare: { amountMinor: 25000, currency: "TWD" },
        },
        {
          status: "assigned",
          quotedFare: { amountMinor: 32000, currency: "TWD" },
        },
        { status: "redispatch_required", quotedFare: null },
        { status: "dispatch_timeout", quotedFare: null },
        { status: "exception_hold", quotedFare: null },
        { status: "no_supply", quotedFare: null },
        {
          status: "completed",
          quotedFare: { amountMinor: 50000, currency: "TWD" },
        },
      ];

      const dispatchJobs: Partial<DispatchJobRecord>[] = [
        { status: "matching", latestEtaMinutes: 5 },
        { status: "reserved", latestEtaMinutes: 7 },
        { status: "closed", latestEtaMinutes: null },
      ];

      const insights = buildDispatchInsights(
        orders as OwnedOrderRecord[],
        dispatchJobs as DispatchJobRecord[],
      );

      // 6 active orders (ready_for_dispatch, assigned, redispatch_required, dispatch_timeout, exception_hold, no_supply)
      expect(insights.activeOrders).toBe(4);
      expect(insights.queueDepth).toBe(2);
      expect(insights.redispatchOrders).toBe(2); // redispatch_required + dispatch_timeout
      expect(insights.exceptionOrders).toBe(2); // exception_hold + no_supply
      expect(insights.averageEtaMinutes).toBe(6); // (5 + 7) / 2 = 6
      expect(insights.queuedRevenueMinor).toBe(57000); // 25000 + 32000
    });

    it("buildRevenueInsights aggregates completed trips and distinguishes zero from positive revenue", () => {
      const now = new Date().toISOString();
      const orders: Partial<OwnedOrderRecord>[] = [
        {
          orderId: "ord-rev-001",
          serviceBucket: "standard_taxi",
          status: "completed",
          quotedFare: { amountMinor: 35000, currency: "TWD" },
          createdAt: now,
        },
        {
          orderId: "ord-rev-002",
          serviceBucket: "business_dispatch",
          status: "completed",
          quotedFare: { amountMinor: 0, currency: "TWD" }, // Zero fare promotional trip
          createdAt: now,
        },
      ];

      const tasks: Partial<DriverTaskRecord>[] = [
        {
          taskId: "task-rev-001",
          orderId: "ord-rev-001",
          vehicleId: "veh-001",
          driverId: "drv-001",
          status: "completed",
          completedAt: now,
          fare: { amountMinor: 35000, currency: "TWD" },
        },
        {
          taskId: "task-rev-002",
          orderId: "ord-rev-002",
          vehicleId: "veh-002",
          driverId: "drv-002",
          status: "completed",
          completedAt: now,
          fare: { amountMinor: 0, currency: "TWD" }, // Explicit zero fare
        },
      ];

      const insights = buildRevenueInsights(
        orders as OwnedOrderRecord[],
        tasks as DriverTaskRecord[],
        [],
        {
          period: "today",
          serviceBucket: "all",
          vehicleId: "all",
        },
      );

      expect(insights.completedTrips).toBe(2);
      expect(insights.totalRevenueMinor).toBe(35000);
      expect(insights.averageRevenueMinor).toBe(17500); // 35000 / 2

      // Breakdown by service bucket
      expect(insights.serviceBuckets).toHaveLength(2);
      const standardBucket = insights.serviceBuckets.find(
        (b) => b.key === "standard_taxi",
      );
      expect(standardBucket?.revenueMinor).toBe(35000);
      expect(standardBucket?.trips).toBe(1);

      const businessBucket = insights.serviceBuckets.find(
        (b) => b.key === "business_dispatch",
      );
      expect(businessBucket?.revenueMinor).toBe(0);
      expect(businessBucket?.trips).toBe(1);

      // Breakdown by vehicle
      expect(insights.vehicles).toHaveLength(2);
    });

    it("isMaintenanceOverdue accurately flags overdue maintenance records", () => {
      const now = Date.now();

      // 1. Explicit status "overdue"
      expect(
        isMaintenanceOverdue({
          status: "overdue",
        } as MaintenanceRecord),
      ).toBe(true);

      // 2. Scheduled in the past and pending
      expect(
        isMaintenanceOverdue({
          status: "scheduled",
          scheduledAt: new Date(now - 3600000).toISOString(), // 1h ago
        } as MaintenanceRecord),
      ).toBe(true);

      // 3. Scheduled in the future
      expect(
        isMaintenanceOverdue({
          status: "scheduled",
          scheduledAt: new Date(now + 3600000).toISOString(), // 1h from now
        } as MaintenanceRecord),
      ).toBe(false);

      // 4. Completed record scheduled in the past is NOT overdue
      expect(
        isMaintenanceOverdue({
          status: "completed",
          scheduledAt: new Date(now - 3600000).toISOString(),
        } as MaintenanceRecord),
      ).toBe(false);

      // 5. Cancelled record is NOT overdue
      expect(
        isMaintenanceOverdue({
          status: "cancelled",
          scheduledAt: new Date(now - 3600000).toISOString(),
        } as MaintenanceRecord),
      ).toBe(false);
    });
  });
});
