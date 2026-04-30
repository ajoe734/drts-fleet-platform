import { describe, expect, it, vi } from "vitest";

import { ForwarderService } from "../../src/modules/forwarder/forwarder.service";
import { GRAB_TAIWAN_PLATFORM_CODE } from "../../src/modules/forwarder/grab-taiwan.adapter";
import type { ForwarderAdapterInterface } from "../../src/modules/forwarder/forwarder-adapter.interface";

function createAdapter(
  overrides: Partial<ForwarderAdapterInterface> = {},
): ForwarderAdapterInterface {
  return {
    platformCode: GRAB_TAIWAN_PLATFORM_CODE,
    accept: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId,
      detail: "accept_ok",
    })),
    reject: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId,
      detail: "reject_ok",
    })),
    complete: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId,
      detail: "complete_ok",
    })),
    heartbeat: vi.fn(async () => ({
      acknowledged: true,
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      checkedAt: new Date().toISOString(),
    })),
    fetchEarnings: vi.fn(async () => ({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      currency: "TWD",
      totalAmount: 0,
      asOf: new Date().toISOString(),
    })),
    ...overrides,
  };
}

function createOwnedMobilityServiceMock() {
  return {
    cancelForwarderTasks: vi.fn(() => []),
    registerForwarderSource: vi.fn(),
  };
}

function createService(options?: {
  adapter?: ForwarderAdapterInterface;
  eligibleDriverIds?: string[];
  ownedMobilityService?: ReturnType<typeof createOwnedMobilityServiceMock>;
}) {
  const eligibleDriverIds = options?.eligibleDriverIds ?? [];
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() =>
      eligibleDriverIds.map((driverId) => ({ driverId })),
    ),
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const adapter = options?.adapter ?? createAdapter();
  const ownedMobilityService = options?.ownedMobilityService;

  const service = new ForwarderService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    [adapter],
    undefined,
    ownedMobilityService as never,
  );

  return {
    service,
    adapter,
    auditNotificationService,
    ownedMobilityService,
  };
}

describe("ForwarderService", () => {
  it("seeds registered adapter health on module init", async () => {
    const { service } = createService();

    await service.onModuleInit();

    expect(service.listAdapterHealth()).toEqual([
      expect.objectContaining({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        status: "healthy",
        lastError: null,
      }),
    ]);
  });

  it("ingests Grab Taiwan webhooks through the generic forwarder flow", () => {
    const { service, auditNotificationService } = createService();

    const record = service.ingestGrabTaiwanWebhook(
      {
        orderId: "grab-order-001",
        passengerName: "Rider One",
      },
      "req-grab-001",
    );

    expect(record).toMatchObject({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-001",
      status: "received",
    });
    expect(service.hasAdapter(GRAB_TAIWAN_PLATFORM_CODE)).toBe(true);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "forwarder",
        actionName: "ingest_external_order",
      }),
    );
  });

  it("relays driver accept through the platform adapter and keeps the order pending confirmation", async () => {
    const adapter = createAdapter();
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-001"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-accept-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-001"],
    });

    const relay = await service.relayDriverAccept(order.mirrorOrderId, {
      driverId: "driver-001",
    });

    expect(relay).toEqual({
      status: "accept_pending",
      acceptedDriverId: "driver-001",
    });
    expect(adapter.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        externalOrderId: "grab-order-accept-001",
        driverId: "driver-001",
        payload: expect.objectContaining({
          mirrorOrderId: order.mirrorOrderId,
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        }),
      }),
    );
    expect(service.listOrders()).toEqual([
      expect.objectContaining({
        mirrorOrderId: order.mirrorOrderId,
        orderDomain: "forwarded",
        dispatchSemantics: "forwarder_broadcast",
        status: "accept_pending",
        acceptedDriverId: "driver-001",
        financeContext: expect.objectContaining({
          fareAuthority: "external_platform",
          settlementAuthority: "external_platform",
          driverPayoutAuthority: "external_platform",
        }),
        lastSyncError: null,
        manualFallback: expect.objectContaining({
          required: false,
        }),
      }),
    ]);
  });

  it("marks sync_failed and queues reconciliation when adapter accept relay fails", async () => {
    const adapter = createAdapter({
      accept: vi.fn(async () => {
        throw new Error("platform timeout");
      }),
    });
    const { service, auditNotificationService } = createService({
      adapter,
      eligibleDriverIds: ["driver-002"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-fail-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-002"],
    });

    await expect(
      service.relayDriverAccept(order.mirrorOrderId, {
        driverId: "driver-002",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "FORWARDER_ACCEPT_RELAY_FAILED",
        },
      },
    });

    const failedOrder = service.listOrders()[0];
    expect(failedOrder).toMatchObject({
      mirrorOrderId: order.mirrorOrderId,
      status: "sync_failed",
      acceptedDriverId: "driver-002",
      lastSyncError: {
        code: "FORWARDER_ACCEPT_RELAY_FAILED",
        message: "platform timeout",
        retryable: true,
      },
      manualFallback: {
        required: true,
        reason:
          "Dispatch must confirm platform acceptance manually before continuing.",
      },
      reconciliationJob: {
        mirrorOrderId: order.mirrorOrderId,
        reason: "sync_failed",
        status: "queued",
      },
    });
    expect(service.listSyncErrors()).toEqual([
      expect.objectContaining({
        mirrorOrderId: order.mirrorOrderId,
      }),
    ]);
    expect(service.listReconciliationJobs()).toEqual([
      expect.objectContaining({
        mirrorOrderId: order.mirrorOrderId,
        status: "queued",
      }),
    ]);
    expect(service.listAdapterHealth()).toEqual([
      expect.objectContaining({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        status: "degraded",
        lastError: expect.stringContaining("FORWARDER_ACCEPT_RELAY_FAILED"),
      }),
    ]);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "forwarder",
        actionName: "mark_forwarder_sync_failed",
      }),
    );
  });

  it("auto-completes queued reconciliation once a native status sync arrives", async () => {
    const adapter = createAdapter({
      accept: vi.fn(async () => {
        throw new Error("transient upstream outage");
      }),
    });
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-003"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-sync-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-003"],
    });
    await expect(
      service.relayDriverAccept(order.mirrorOrderId, {
        driverId: "driver-003",
      }),
    ).rejects.toBeTruthy();

    const resolved = service.syncNativeStatus(order.mirrorOrderId, {
      nativeStatus: "confirmed_by_platform",
      payload: { driverEtaMinutes: 8 },
    });

    expect(resolved).toMatchObject({
      status: "confirmed_by_platform",
      authoritativeSnapshot: expect.objectContaining({
        nativeStatus: "confirmed_by_platform",
        driverEtaMinutes: 8,
      }),
    });
    expect(service.listOrders()).toEqual([
      expect.objectContaining({
        mirrorOrderId: order.mirrorOrderId,
        status: "confirmed_by_platform",
        lastSyncError: null,
        manualFallback: expect.objectContaining({
          required: false,
        }),
        reconciliationJob: expect.objectContaining({
          status: "completed",
          mismatchCount: 0,
          notes: "Resolved by native status sync.",
        }),
      }),
    ]);
  });

  it("lets dispatch engage manual fallback explicitly before a native status resolves", () => {
    const { service } = createService();

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-manual-001",
      payload: { serviceBucket: "standard_taxi" },
    });

    const updated = service.engageManualFallback(order.mirrorOrderId, {
      reason: "partner hotline confirmation required",
      requestedBy: "ops-001",
      notes: "Awaiting dispatcher callback from platform team.",
    });

    expect(updated).toMatchObject({
      mirrorOrderId: order.mirrorOrderId,
      manualFallback: {
        required: true,
        reason: "partner hotline confirmation required",
        requestedBy: "ops-001",
        notes: "Awaiting dispatcher callback from platform team.",
      },
      reconciliationJob: {
        mirrorOrderId: order.mirrorOrderId,
        reason: "manual_fallback",
        status: "queued",
      },
    });
  });

  it("registers forwarder source on owned-mobility when ingesting an external order", () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    const { service } = createService({ ownedMobilityService });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-register-001",
      payload: { serviceBucket: "standard_taxi" },
    });

    expect(ownedMobilityService.registerForwarderSource).toHaveBeenCalledWith(
      order.mirrorOrderId,
      GRAB_TAIWAN_PLATFORM_CODE,
    );
  });

  it("closes mirrored driver tasks when native status sync resolves to lost_race", () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    const { service } = createService({
      eligibleDriverIds: ["driver-terminal-001"],
      ownedMobilityService,
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-lost-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-terminal-001"],
    });

    service.syncNativeStatus(order.mirrorOrderId, {
      nativeStatus: "lost_race",
    });

    expect(ownedMobilityService.cancelForwarderTasks).toHaveBeenCalledWith(
      order.mirrorOrderId,
      "lost_race",
      undefined,
    );
    expect(service.listOrders()[0]).toMatchObject({
      status: "lost_race",
    });
  });

  it("closes mirrored driver tasks when native status sync resolves to cancelled_by_platform", () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    const { service } = createService({
      eligibleDriverIds: ["driver-terminal-002"],
      ownedMobilityService,
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-cancelled-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-terminal-002"],
    });

    service.syncNativeStatus(order.mirrorOrderId, {
      nativeStatus: "cancelled_by_platform",
    });

    expect(ownedMobilityService.cancelForwarderTasks).toHaveBeenCalledWith(
      order.mirrorOrderId,
      "cancelled_by_platform",
      undefined,
    );
  });

  it("does not close driver tasks when native status sync resolves to confirmed_by_platform", () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    const { service } = createService({
      eligibleDriverIds: ["driver-terminal-003"],
      ownedMobilityService,
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-confirmed-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-terminal-003"],
    });

    service.syncNativeStatus(order.mirrorOrderId, {
      nativeStatus: "confirmed_by_platform",
    });

    expect(ownedMobilityService.cancelForwarderTasks).not.toHaveBeenCalled();
  });

  it("closes mirrored driver tasks when reconciliation completes with a terminal status", async () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    const adapter = createAdapter({
      accept: vi.fn(async () => {
        throw new Error("sync timeout");
      }),
    });
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-recon-001"],
      ownedMobilityService,
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-recon-terminal-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-recon-001"],
    });
    // Accept fails → sync_failed with reconciliation queued
    await expect(
      service.relayDriverAccept(order.mirrorOrderId, {
        driverId: "driver-recon-001",
      }),
    ).rejects.toBeTruthy();

    service.completeReconciliation(order.mirrorOrderId, {
      nativeStatus: "lost_race",
      mismatchCount: 1,
      notes: "Platform awarded to another driver.",
    });

    expect(ownedMobilityService.cancelForwarderTasks).toHaveBeenCalledWith(
      order.mirrorOrderId,
      "lost_race",
      undefined,
    );
  });

  it("returns queued reconciliation issues with full order and finance context", async () => {
    const adapter = createAdapter({
      accept: vi.fn(async () => {
        throw new Error("upstream failure");
      }),
    });
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-issue-001"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-issue-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-issue-001"],
    });
    await expect(
      service.relayDriverAccept(order.mirrorOrderId, {
        driverId: "driver-issue-001",
      }),
    ).rejects.toBeTruthy();

    const issues = service.listReconciliationIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      mirrorOrderId: order.mirrorOrderId,
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-issue-001",
      status: "sync_failed",
      acceptedDriverId: "driver-issue-001",
      reconciliationJob: expect.objectContaining({
        mirrorOrderId: order.mirrorOrderId,
        status: "queued",
        reason: "sync_failed",
      }),
      lastSyncError: expect.objectContaining({
        code: "FORWARDER_ACCEPT_RELAY_FAILED",
      }),
      financeContext: expect.objectContaining({
        fareAuthority: "external_platform",
        settlementAuthority: "external_platform",
      }),
      manualFallback: expect.objectContaining({
        required: true,
      }),
    });
  });

  it("excludes completed reconciliation jobs from listReconciliationIssues", async () => {
    const adapter = createAdapter({
      accept: vi.fn(async () => {
        throw new Error("transient error");
      }),
    });
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-issue-002"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-issue-002",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-issue-002"],
    });
    await expect(
      service.relayDriverAccept(order.mirrorOrderId, {
        driverId: "driver-issue-002",
      }),
    ).rejects.toBeTruthy();

    // Resolve via native status sync — reconciliation auto-completes
    service.syncNativeStatus(order.mirrorOrderId, {
      nativeStatus: "confirmed_by_platform",
    });

    expect(service.listReconciliationIssues()).toHaveLength(0);
  });
});
