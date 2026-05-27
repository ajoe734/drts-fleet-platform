import { afterEach, describe, expect, it, vi } from "vitest";

import { PlatformPresenceService } from "../../src/modules/platform-presence/platform-presence.service";
import { DriverAppSummaryService } from "../../src/modules/driver-app/driver-app-summary.service";
import {
  driverPlatformPresenceSummaryFixture,
  driverWorkspaceSummaryFixture,
} from "../../../driver-app/tests/fixtures/driver-summary.fixtures";

describe("DriverAppSummaryService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a fresh workspace summary contract for cockpit consumers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));

    const platformPresenceService = new PlatformPresenceService(
      undefined,
      {
        listAdapterHealth: vi.fn(() => [
          {
            platformCode: "grab_taiwan",
            status: "healthy",
            reason: null,
            credentialStatus: "authenticated",
            authStatus: "authenticated",
            webhookStatus: "healthy",
            rateLimitStatus: "ok",
            lastError: null,
            lastCheckedAt: "2026-05-27T11:59:58.000Z",
            capabilitySummary: {
              mode: "hybrid",
              productionStatus: "production_ready",
              supportsInboundWebhook: true,
              supportsOutboundActions: true,
              supportedWebhookEvents: ["forwarder.order.received"],
              notes: [],
            },
          },
        ]),
      } as never,
    );
    await platformPresenceService.setOnline(
      "driver-fixture-001",
      "grab_taiwan",
      "2026-06-01T00:00:00.000Z",
    );

    const service = new DriverAppSummaryService(platformPresenceService, {
      listDriverTaskViews: vi.fn(() => [
        {
          taskId: "task-active-001",
          orderId: "order-active-001",
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
          pickupSummary: "台北車站",
          dropoffSummary: "松山機場",
          deadlineAt: null,
          updatedAt: "2026-05-27T11:59:55.000Z",
        },
        {
          taskId: "task-pending-001",
          orderId: "order-pending-001",
          orderDomain: "owned",
          sourcePlatform: "drts",
          platformDisplayName: "DRTS",
          externalOrderId: null,
          nativeStatus: null,
          localStatus: "pending_acceptance",
          driverActionState: "action_required",
          allowedActions: ["accept"],
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
          updatedAt: "2026-05-27T11:59:54.000Z",
        },
      ]),
    } as never);

    await expect(
      service.getWorkspaceSummary("driver-fixture-001"),
    ).resolves.toEqual(driverWorkspaceSummaryFixture);
  });

  it("marks platform presence summary stale when the latest platform sync is old", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));

    const platformPresenceService = {
      listForDriver: vi.fn(async () => [
        {
          driverId: "driver-fixture-001",
          platformCode: "grab_taiwan",
          accountId: null,
          status: "online",
          eligibility: "eligible",
          tokenExpiresAt: "2026-06-01T00:00:00.000Z",
          reauthRequired: false,
          lastOnlineAt: "2026-05-27T11:58:00.000Z",
          lastOfflineAt: null,
          updatedAt: "2026-05-27T11:58:00.000Z",
        },
      ]),
      listAdapterStatuses: vi.fn(() => [
        {
          platformCode: "grab_taiwan",
          status: "healthy",
          blockingReason: null,
          lastSyncAt: "2026-05-27T11:58:00.000Z",
        },
      ]),
      getSummaryNotes: vi.fn(() => [
        "平台狀態會優先使用資料庫同步；若目前環境未啟用資料庫，會改用目前執行個體的暫存資料。",
        "可使用 POST /api/platform-presence/online 或 /api/platform-presence/offline 更新單一平台的綁定、上下線與重新驗證狀態。",
      ]),
    } as unknown as PlatformPresenceService;

    const service = new DriverAppSummaryService(platformPresenceService);
    const summary =
      await service.getPlatformPresenceSummary("driver-fixture-001");

    expect(summary.driverId).toBe(driverPlatformPresenceSummaryFixture.driverId);
    expect(summary.notes).toEqual(driverPlatformPresenceSummaryFixture.notes);
    expect(summary.health).toEqual(driverPlatformPresenceSummaryFixture.health);
    expect(summary.refresh).toEqual(
      driverPlatformPresenceSummaryFixture.refresh,
    );
    expect(summary.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining(
          driverPlatformPresenceSummaryFixture.bindings[0],
        ),
      ]),
    );
  });
});
