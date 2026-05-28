import { PLATFORM_CODES } from "@drts/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DriverAppSummaryService } from "../../src/modules/driver-app/driver-app-summary.service";

describe("DriverAppSummaryService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T12:00:00Z"));
  });

  it("builds a fresh workspace summary with task counts and active trip", async () => {
    const service = new DriverAppSummaryService(
      {
        listDriverTaskViews: vi.fn(() => [
          {
            taskId: "task-001",
            orderId: "order-001",
            orderDomain: "owned",
            sourcePlatform: "drts",
            platformDisplayName: "DRTS",
            externalOrderId: null,
            nativeStatus: null,
            localStatus: "on_trip",
            driverActionState: "in_progress",
            allowedActions: ["complete"],
            routeLocked: false,
            fareAuthority: "drts",
            settlementAuthority: "drts",
            driverPayoutAuthority: "drts",
            requiresManualFallback: false,
            requiresReauth: false,
            syncIssueSummary: null,
            blockingReason: null,
            pickupSummary: "A",
            dropoffSummary: "B",
            deadlineAt: null,
            updatedAt: "2026-05-26T11:59:58Z",
          },
          {
            taskId: "task-002",
            orderId: "order-002",
            orderDomain: "forwarded",
            sourcePlatform: "grab_taiwan",
            platformDisplayName: "Grab Taiwan",
            externalOrderId: "ext-002",
            nativeStatus: "accept_pending",
            localStatus: "pending_acceptance",
            driverActionState: "action_required",
            allowedActions: ["accept", "reject"],
            routeLocked: true,
            fareAuthority: "external_platform",
            settlementAuthority: "external_platform",
            driverPayoutAuthority: "external_platform",
            requiresManualFallback: false,
            requiresReauth: false,
            syncIssueSummary: null,
            blockingReason: null,
            pickupSummary: "C",
            dropoffSummary: "D",
            deadlineAt: null,
            updatedAt: "2026-05-26T11:59:57Z",
          },
        ]),
      } as never,
      {
        listForDriver: vi.fn(async () => [
          {
            driverId: "driver-001",
            platformCode: "grab_taiwan",
            accountId: "acct-001",
            status: "online",
            eligibility: "eligible",
            tokenExpiresAt: null,
            reauthRequired: false,
            lastOnlineAt: "2026-05-26T11:58:00Z",
            lastOfflineAt: null,
            updatedAt: "2026-05-26T11:59:56Z",
          },
        ]),
        listAdapterStatuses: vi.fn(() => [
          {
            platformCode: "grab_taiwan",
            status: "healthy",
            blockingReason: null,
            lastSyncAt: "2026-05-26T11:59:59Z",
          },
        ]),
      } as never,
    );

    const summary = await service.getWorkspaceSummary("driver-001");

    expect(summary.taskCounts).toEqual({
      total: 2,
      actionRequired: 1,
      awaitingPlatform: 0,
      inProgress: 1,
      blocked: 0,
      completed: 0,
      readOnly: 0,
    });
    expect(summary.activeTrip).toEqual({
      taskId: "task-001",
      orderId: "order-001",
      sourcePlatform: "drts",
      platformDisplayName: "DRTS",
    });
    expect(summary.outstandingInstructionCount).toBe(0);
    expect(summary.refresh).toEqual(
      expect.objectContaining({
        staleAfterMs: 15000,
        dataFreshness: "fresh",
        source: "sandbox",
      }),
    );
  });

  it("marks workspace summary stale when the newest snapshot is older than the refresh threshold", async () => {
    const service = new DriverAppSummaryService(
      {
        listDriverTaskViews: vi.fn(() => [
          {
            taskId: "task-stale-001",
            orderId: "order-stale-001",
            orderDomain: "owned",
            sourcePlatform: "drts",
            platformDisplayName: "DRTS",
            externalOrderId: null,
            nativeStatus: null,
            localStatus: "accepted",
            driverActionState: "in_progress",
            allowedActions: ["depart"],
            routeLocked: false,
            fareAuthority: "drts",
            settlementAuthority: "drts",
            driverPayoutAuthority: "drts",
            requiresManualFallback: false,
            requiresReauth: false,
            syncIssueSummary: null,
            blockingReason: null,
            pickupSummary: null,
            dropoffSummary: null,
            deadlineAt: null,
            updatedAt: "2026-05-26T11:59:00Z",
          },
        ]),
      } as never,
      {
        listForDriver: vi.fn(async () => []),
        listAdapterStatuses: vi.fn(() => []),
      } as never,
    );

    const summary = await service.getWorkspaceSummary("driver-002");

    expect(summary.refresh.dataFreshness).toBe("stale");
  });

  it("builds a degraded platform presence summary with instructions and suppressions", async () => {
    const service = new DriverAppSummaryService(
      {
        listDriverTaskViews: vi.fn(() => []),
      } as never,
      {
        listForDriver: vi.fn(async () => [
          {
            driverId: "driver-003",
            platformCode: "grab_taiwan",
            accountId: "acct-003",
            status: "online",
            eligibility: "ineligible",
            tokenExpiresAt: "2026-05-27T10:00:00Z",
            reauthRequired: true,
            lastOnlineAt: "2026-05-26T11:40:00Z",
            lastOfflineAt: null,
            updatedAt: "2026-05-26T11:59:58Z",
          },
        ]),
        listAdapterStatuses: vi.fn(() => [
          {
            platformCode: "uber",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "grab",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "line-taxi",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "grab_taiwan",
            status: "down",
            blockingReason: "平台轉接服務中斷，暫時無法接單",
            lastSyncAt: "2026-05-26T11:59:55Z",
          },
          {
            platformCode: "indriver",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "forwarder_sandbox",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
        ]),
        buildUiHealth: vi.fn((adapterStatuses) => ({
          status: "down",
          degradedServices: adapterStatuses
            .filter((status: { status: string }) => status.status === "down")
            .map(
              (status: { platformCode: string; blockingReason: string }) => ({
                service: status.platformCode,
                impact: status.blockingReason,
                severity: "critical",
              }),
            ),
          lastCheckedAt: "2026-05-26T11:59:55Z",
        })),
      } as never,
    );

    const summary = await service.getPlatformPresenceSummary("driver-003");

    expect(summary.health.status).toBe("down");
    expect(summary.refresh.dataFreshness).toBe("degraded");
    expect(summary.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "presence:grab_taiwan",
          issuedBy: "system:platform-presence",
        }),
      ]),
    );
    expect(summary.suppressions).toEqual([
      expect.objectContaining({
        active: true,
        reasonCode: "compliance_hold",
      }),
    ]);
    expect(summary.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformCode: "grab_taiwan",
          bindingState: "suspended",
          outstandingInstructionCount: 3,
        }),
      ]),
    );
    expect(summary.bindings).toHaveLength(PLATFORM_CODES.length);
  });

  it("emits unique instruction ids when one task or platform has multiple issues", async () => {
    const service = new DriverAppSummaryService(
      {
        listDriverTaskViews: vi.fn(() => [
          {
            taskId: "task-dup-001",
            orderId: "order-dup-001",
            orderDomain: "forwarded",
            sourcePlatform: "grab_taiwan",
            platformDisplayName: "Grab Taiwan",
            externalOrderId: "ext-dup-001",
            nativeStatus: "on_trip",
            localStatus: "proof_pending",
            driverActionState: "blocked",
            allowedActions: ["complete"],
            routeLocked: true,
            fareAuthority: "external_platform",
            settlementAuthority: "external_platform",
            driverPayoutAuthority: "external_platform",
            requiresManualFallback: true,
            requiresReauth: true,
            syncIssueSummary: "同步需要人工處理",
            blockingReason: "blocked",
            pickupSummary: null,
            dropoffSummary: null,
            deadlineAt: null,
            updatedAt: "2026-05-26T11:59:40Z",
          },
        ]),
      } as never,
      {
        listForDriver: vi.fn(async () => [
          {
            driverId: "driver-dup-001",
            platformCode: "grab_taiwan",
            accountId: "acct-dup-001",
            status: "online",
            eligibility: "ineligible",
            tokenExpiresAt: null,
            reauthRequired: true,
            lastOnlineAt: "2026-05-26T11:30:00Z",
            lastOfflineAt: null,
            updatedAt: "2026-05-26T11:59:50Z",
          },
        ]),
        listAdapterStatuses: vi.fn(() => [
          {
            platformCode: "grab_taiwan",
            status: "down",
            blockingReason: "平台轉接服務中斷",
            lastSyncAt: "2026-05-26T11:59:55Z",
          },
        ]),
        buildUiHealth: vi.fn(() => ({
          status: "down",
          degradedServices: [
            {
              service: "grab_taiwan",
              impact: "平台轉接服務中斷",
              severity: "critical",
            },
          ],
          lastCheckedAt: "2026-05-26T11:59:55Z",
        })),
      } as never,
    );

    const workspaceSummary =
      await service.getWorkspaceSummary("driver-dup-001");
    const platformSummary =
      await service.getPlatformPresenceSummary("driver-dup-001");

    expect(
      new Set(workspaceSummary.instructions.map((item) => item.instructionId))
        .size,
    ).toBe(workspaceSummary.instructions.length);
    expect(
      new Set(platformSummary.instructions.map((item) => item.instructionId))
        .size,
    ).toBe(platformSummary.instructions.length);
  });

  it("builds a fresh platform presence summary when bindings and adapter status are current", async () => {
    const service = new DriverAppSummaryService(
      {
        listDriverTaskViews: vi.fn(() => []),
      } as never,
      {
        listForDriver: vi.fn(async () => [
          {
            driverId: "driver-004",
            platformCode: "grab_taiwan",
            accountId: "acct-004",
            status: "online",
            eligibility: "eligible",
            tokenExpiresAt: null,
            reauthRequired: false,
            lastOnlineAt: "2026-05-26T11:58:00Z",
            lastOfflineAt: null,
            updatedAt: "2026-05-26T11:59:58Z",
          },
        ]),
        listAdapterStatuses: vi.fn(() => [
          {
            platformCode: "uber",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "grab",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "line-taxi",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "grab_taiwan",
            status: "healthy",
            blockingReason: null,
            lastSyncAt: "2026-05-26T11:59:59Z",
          },
          {
            platformCode: "indriver",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "forwarder_sandbox",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
        ]),
        buildUiHealth: vi.fn(() => ({
          status: "healthy",
          degradedServices: [],
          lastCheckedAt: "2026-05-26T11:59:59Z",
        })),
      } as never,
    );

    const summary = await service.getPlatformPresenceSummary("driver-004");

    expect(summary.refresh).toEqual(
      expect.objectContaining({
        staleAfterMs: 15000,
        dataFreshness: "fresh",
        source: "sandbox",
      }),
    );
    expect(summary.instructions).toEqual([]);
    expect(summary.suppressions).toEqual([]);
  });

  it("marks platform presence summary stale when the latest binding snapshot exceeds the refresh threshold", async () => {
    const service = new DriverAppSummaryService(
      {
        listDriverTaskViews: vi.fn(() => []),
      } as never,
      {
        listForDriver: vi.fn(async () => [
          {
            driverId: "driver-005",
            platformCode: "grab_taiwan",
            accountId: "acct-005",
            status: "offline",
            eligibility: "eligible",
            tokenExpiresAt: null,
            reauthRequired: false,
            lastOnlineAt: "2026-05-26T11:20:00Z",
            lastOfflineAt: "2026-05-26T11:30:00Z",
            updatedAt: "2026-05-26T11:59:00Z",
          },
        ]),
        listAdapterStatuses: vi.fn(() => [
          {
            platformCode: "uber",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "grab",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "line-taxi",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "grab_taiwan",
            status: "healthy",
            blockingReason: null,
            lastSyncAt: "2026-05-26T11:59:01Z",
          },
          {
            platformCode: "indriver",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
          {
            platformCode: "forwarder_sandbox",
            status: "unknown",
            blockingReason: null,
            lastSyncAt: null,
          },
        ]),
        buildUiHealth: vi.fn(() => ({
          status: "healthy",
          degradedServices: [],
          lastCheckedAt: "2026-05-26T11:59:01Z",
        })),
      } as never,
    );

    const summary = await service.getPlatformPresenceSummary("driver-005");

    expect(summary.refresh.dataFreshness).toBe("stale");
  });
});
