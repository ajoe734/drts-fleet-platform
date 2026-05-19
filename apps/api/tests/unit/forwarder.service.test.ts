import { describe, expect, it, vi } from "vitest";

import { ForwarderService } from "../../src/modules/forwarder/forwarder.service";
import {
  GRAB_TAIWAN_PLATFORM_CODE,
  GrabTaiwanAdapter,
} from "../../src/modules/forwarder/grab-taiwan.adapter";
import type { ForwarderAdapterInterface } from "../../src/modules/forwarder/forwarder-adapter.interface";
import {
  FORWARDER_SANDBOX_FIXTURES,
  FORWARDER_SANDBOX_PLATFORM_CODE,
} from "../../src/modules/forwarder/sandbox.fixtures";
import { SandboxAdapter } from "../../src/modules/forwarder/sandbox.adapter";

function createAdapter(
  overrides: Partial<ForwarderAdapterInterface> = {},
): ForwarderAdapterInterface {
  return {
    platformCode: GRAB_TAIWAN_PLATFORM_CODE,
    capabilitySummary: {
      mode: "hybrid",
      productionStatus: "production_ready",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: ["forwarder.order.received"],
      notes: [],
    },
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
    verifyWebhook: vi.fn(async () => ({
      accepted: true,
      credentialStatus: "valid",
      authStatus: "authenticated",
      webhookStatus: "healthy",
    })),
    getHealthSnapshot: vi.fn(async () => ({
      status: "healthy",
      reason: "none",
      credentialStatus: "valid",
      authStatus: "authenticated",
      webhookStatus: "healthy",
      rateLimitStatus: "ok",
      checkedAt: new Date().toISOString(),
    })),
    ...overrides,
  };
}

function createOwnedMobilityServiceMock() {
  return {
    cancelForwarderTasks: vi.fn(() => []),
    registerForwarderSource: vi.fn(),
    listDriverTasks: vi.fn(() => []),
    listOrders: vi.fn(() => []),
  };
}

function createForwarderRepositoryMock() {
  return {
    loadState: vi.fn(async () => ({
      forwardedOrders: [],
      adapterHealth: [],
    })),
    persistChanges: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };
}

function createService(options?: {
  adapter?: ForwarderAdapterInterface;
  eligibleDriverIds?: string[];
  ownedMobilityService?: ReturnType<typeof createOwnedMobilityServiceMock>;
  forwarderRepository?: ReturnType<typeof createForwarderRepositoryMock>;
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
  const forwarderRepository = options?.forwarderRepository;

  const service = new ForwarderService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    [adapter],
    forwarderRepository as never,
    ownedMobilityService as never,
  );

  return {
    service,
    adapter,
    auditNotificationService,
    forwarderRepository,
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
        reason: "none",
        credentialStatus: "valid",
        authStatus: "authenticated",
        webhookStatus: "healthy",
        rateLimitStatus: "ok",
        lastError: null,
      }),
    ]);
  });

  it("labels the checked-in Grab Taiwan adapter as stub-only on module init", async () => {
    const regulatoryRegistryService = {
      getEligibleCandidates: vi.fn(() => []),
    };
    const auditNotificationService = {
      recordAuditLog: vi.fn(),
    };
    const service = new ForwarderService(
      regulatoryRegistryService as never,
      auditNotificationService as never,
      [new GrabTaiwanAdapter()],
    );

    await service.onModuleInit();

    expect(service.listAdapterHealth()).toEqual([
      expect.objectContaining({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        status: "healthy",
        reason: "stub",
        credentialStatus: "stub",
        authStatus: "stub",
        webhookStatus: "stub",
        rateLimitStatus: "stub",
        capabilitySummary: expect.objectContaining({
          productionStatus: "stub",
        }),
      }),
    ]);
  });

  it("labels the sandbox adapter as a non-production stub on module init", async () => {
    const regulatoryRegistryService = {
      getEligibleCandidates: vi.fn(() => []),
    };
    const auditNotificationService = {
      recordAuditLog: vi.fn(),
    };
    const service = new ForwarderService(
      regulatoryRegistryService as never,
      auditNotificationService as never,
      [new SandboxAdapter()],
    );

    await service.onModuleInit();

    expect(service.listAdapterHealth()).toEqual([
      expect.objectContaining({
        platformCode: FORWARDER_SANDBOX_PLATFORM_CODE,
        status: "healthy",
        reason: "stub",
        credentialStatus: "stub",
        authStatus: "stub",
        webhookStatus: "stub",
        rateLimitStatus: "stub",
        capabilitySummary: expect.objectContaining({
          productionStatus: "stub",
          notes: expect.arrayContaining([
            expect.stringContaining("Non-production only"),
          ]),
        }),
      }),
    ]);
  });

  it("re-registers persisted forwarded orders with owned-mobility on module init", async () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    const forwarderRepository = createForwarderRepositoryMock();
    forwarderRepository.loadState.mockResolvedValue({
      forwardedOrders: [
        {
          mirrorOrderId: "FWD-persisted-001",
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-persisted-001",
          orderDomain: "forwarded",
          dispatchSemantics: "forwarder_broadcast",
          status: "received",
          candidateDriverIds: [],
          acceptedDriverId: null,
          lastNativeStatus: null,
          payload: { serviceBucket: "standard_taxi" },
          authoritativeSnapshot: {
            platformCode: GRAB_TAIWAN_PLATFORM_CODE,
            externalOrderId: "grab-order-persisted-001",
            nativeStatus: "received",
            serviceBucket: "standard_taxi",
          },
          financeContext: {
            fareAuthority: "external_platform",
            settlementAuthority: "external_platform",
            driverPayoutAuthority: "external_platform",
            localLedgerMode: "shadow_only",
          },
          lastSyncError: null,
          manualFallback: {
            required: false,
            reason: null,
            requestedAt: null,
            requestedBy: null,
            notes: null,
          },
          reconciliationJob: null,
          createdAt: "2026-04-30T09:00:00.000Z",
          updatedAt: "2026-04-30T09:00:00.000Z",
        },
      ],
      adapterHealth: [],
    });
    const { service } = createService({
      ownedMobilityService,
      forwarderRepository,
    });

    await service.onModuleInit();

    expect(ownedMobilityService.registerForwarderSource).toHaveBeenCalledWith(
      "FWD-persisted-001",
      GRAB_TAIWAN_PLATFORM_CODE,
    );
  });

  it("ingests Grab Taiwan webhooks through the generic forwarder flow", async () => {
    const { service, auditNotificationService } = createService();

    const record = await service.ingestGrabTaiwanWebhook(
      {
        orderId: "grab-order-001",
        passengerName: "Rider One",
      },
      {
        "x-grab-signature": "stub-signature",
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

  it("rejects Grab Taiwan webhooks when adapter verification fails", async () => {
    const adapter = createAdapter({
      verifyWebhook: vi.fn(async () => ({
        accepted: false,
        detail: "invalid signature",
        webhookStatus: "failing",
      })),
    });
    const { service } = createService({ adapter });

    await expect(
      service.ingestGrabTaiwanWebhook(
        {
          orderId: "grab-order-invalid-001",
        },
        {
          "x-grab-signature": "bad-signature",
        },
        "req-grab-invalid-001",
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "FORWARDER_WEBHOOK_VERIFICATION_FAILED",
        },
      },
    });
    expect(service.listOrders()).toEqual([]);
    expect(service.listAdapterHealth()).toEqual([
      expect.objectContaining({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        status: "degraded",
        reason: "webhook",
        webhookStatus: "failing",
        lastError: "invalid signature",
      }),
    ]);
  });

  it("keeps inbound ingestion idempotent by platform and external order id", () => {
    const { service } = createService();

    const first = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-idempotent-001",
      payload: { passengerName: "First payload" },
    });
    const second = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-idempotent-001",
      payload: { passengerName: "Second payload should not duplicate" },
    });

    expect(second.mirrorOrderId).toBe(first.mirrorOrderId);
    expect(service.listOrders()).toHaveLength(1);
    expect(service.listOrders()[0]).toMatchObject({
      mirrorOrderId: first.mirrorOrderId,
      externalOrderId: "grab-order-idempotent-001",
    });
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

  it("returns a driver-safe accept-pending response for mobile forwarded accept", async () => {
    const adapter = createAdapter();
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-safe-accept-001"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-mobile-accept-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-safe-accept-001"],
    });

    await expect(
      service.acceptForwardedOrder(
        order.mirrorOrderId,
        "driver-safe-accept-001",
        "req-mobile-accept-001",
      ),
    ).resolves.toEqual({
      action: "accept",
      outcome: "accept_pending",
      driverMessage: "Waiting for platform confirmation.",
      taskView: expect.objectContaining({
        taskId: order.mirrorOrderId,
        localStatus: "accept_pending",
        driverActionState: "awaiting_platform",
        allowedActions: [],
      }),
      managementCorrelationIds: {
        mirrorOrderId: order.mirrorOrderId,
        reconciliationJobId: null,
      },
    });
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

  it("returns driver-safe sync-failed copy and correlation ids when forwarded accept relay fails", async () => {
    const adapter = createAdapter({
      accept: vi.fn(async () => {
        throw new Error("platform timeout");
      }),
    });
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-safe-sync-001"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-mobile-sync-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-safe-sync-001"],
    });

    await expect(
      service.acceptForwardedOrder(
        order.mirrorOrderId,
        "driver-safe-sync-001",
        "req-mobile-sync-001",
      ),
    ).resolves.toEqual({
      action: "accept",
      outcome: "sync_failed",
      driverMessage:
        "Dispatch must confirm platform acceptance manually before continuing.",
      taskView: expect.objectContaining({
        taskId: order.mirrorOrderId,
        localStatus: "sync_failed",
        driverActionState: "blocked",
        requiresManualFallback: true,
      }),
      managementCorrelationIds: {
        mirrorOrderId: order.mirrorOrderId,
        reconciliationJobId: expect.any(String),
      },
    });
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
    const { service } = createService({
      ownedMobilityService,
      eligibleDriverIds: ["driver-forwarded-001"],
    });

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

  it("maps completed native sync into a completed local forwarded status", () => {
    const { service } = createService({
      adapter: new SandboxAdapter(),
      eligibleDriverIds: [FORWARDER_SANDBOX_FIXTURES.accept.driverId],
    });

    const order = service.ingestExternalOrder(
      FORWARDER_SANDBOX_FIXTURES.inboundOrder,
    );
    service.broadcastOrder(
      order.mirrorOrderId,
      FORWARDER_SANDBOX_FIXTURES.broadcast,
    );
    service.syncNativeStatus(
      order.mirrorOrderId,
      FORWARDER_SANDBOX_FIXTURES.completedSync,
    );

    expect(service.listOrders()).toEqual([
      expect.objectContaining({
        mirrorOrderId: order.mirrorOrderId,
        platformCode: FORWARDER_SANDBOX_PLATFORM_CODE,
        status: "completed_synced",
        authoritativeSnapshot: expect.objectContaining({
          nativeStatus: "completed",
          settlementReference: "SBX-STL-001",
        }),
      }),
    ]);
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

  it("builds a unified driver task list scoped to the requesting driver", () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    ownedMobilityService.listDriverTasks.mockReturnValue([
      {
        taskId: "task-owned-001",
        orderId: "order-owned-001",
        dispatchJobId: "dispatch-job-001",
        assignmentId: "assignment-001",
        driverId: "driver-multi-001",
        vehicleId: "vehicle-owned-001",
        sourcePlatform: null,
        routeProvided: true,
        waypoints: [],
        status: "pending_acceptance",
        acceptedAt: null,
        departedAt: null,
        arrivedPickupAt: null,
        startedAt: null,
        completedAt: null,
        actualDistanceKm: null,
        actualDurationSec: null,
        fare: null,
        proof: null,
        complianceGates: [],
      },
    ]);
    ownedMobilityService.listOrders.mockReturnValue([
      {
        orderId: "order-owned-001",
        orderNo: "ORD-0001",
        orderSource: "app",
        orderDomain: "owned",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: null,
        serviceBucket: "standard_taxi",
        dispatchSemantics: "realtime",
        businessDispatchSubtype: null,
        status: "assigned",
        pickup: { address: "Owned pickup", lat: null, lng: null },
        dropoff: { address: "Owned dropoff", lat: null, lng: null },
        passenger: { name: "Rider", phone: "0900000000" },
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
        costCenter: null,
        vehiclePreference: null,
        benefitReference: null,
        direction: null,
        flightNo: null,
        terminal: null,
        luggageCount: null,
        notes: null,
        fixedPrice: false,
        quotedFare: null,
        quotedFareSource: null,
        quotedFareRuleVersion: null,
        manualFareOverride: null,
        exceptionHold: null,
        proofRequirements: {
          minPhotoCount: 0,
          signoffRequired: false,
          expenseProofRequired: false,
        },
        complianceFlags: [],
        cancelledAt: null,
        cancelReason: null,
        reservationHoldStatus: "none",
        reservationHoldId: null,
        reservationHoldExpiresAt: null,
        dispatchAttemptCount: 0,
        lastDispatchFailureReason: null,
        noSupplyEscalation: null,
        dispatchTimeout: null,
        createdAt: "2026-05-07T14:00:00.000Z",
        updatedAt: "2026-05-07T14:05:00.000Z",
      },
    ]);
    const { service } = createService({
      ownedMobilityService,
      eligibleDriverIds: ["driver-multi-001"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-view-001",
      payload: {
        serviceBucket: "standard_taxi",
        pickupAddress: "Forwarded pickup",
        dropoffAddress: "Forwarded dropoff",
      },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-multi-001"],
    });

    expect(service.listDriverTaskViews("driver-multi-001")).toEqual([
      expect.objectContaining({
        taskId: order.mirrorOrderId,
        orderId: order.mirrorOrderId,
        orderDomain: "forwarded",
        sourcePlatform: GRAB_TAIWAN_PLATFORM_CODE,
        platformDisplayName: "Grab Taiwan",
        externalOrderId: "grab-order-view-001",
        localStatus: "broadcasted",
        driverActionState: "action_required",
        allowedActions: ["accept", "reject"],
        routeLocked: true,
        fareAuthority: "external_platform",
        syncIssueSummary: null,
        pickupSummary: "Forwarded pickup",
        dropoffSummary: "Forwarded dropoff",
      }),
      expect.objectContaining({
        taskId: "task-owned-001",
        orderId: "order-owned-001",
        orderDomain: "owned",
        sourcePlatform: "drts",
        platformDisplayName: "DRTS",
        allowedActions: ["accept", "reject"],
        pickupSummary: "Owned pickup",
        dropoffSummary: "Owned dropoff",
      }),
    ]);
  });

  it("lets a driver reject a broadcasted forwarded offer and removes it from their visible inbox", () => {
    const { service, auditNotificationService } = createService({
      eligibleDriverIds: ["driver-reject-001", "driver-other-002"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-reject-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-reject-001", "driver-other-002"],
    });

    expect(
      service.rejectForwardedOrder(
        order.mirrorOrderId,
        "driver-reject-001",
        "Too far away",
        "req-driver-reject-001",
      ),
    ).toEqual({
      action: "reject",
      outcome: "rejected",
      driverMessage: "Offer declined.",
      taskView: null,
      managementCorrelationIds: {
        mirrorOrderId: order.mirrorOrderId,
        reconciliationJobId: null,
      },
    });
    expect(service.listDriverTaskViews("driver-reject-001")).toEqual([]);
    expect(service.listDriverTaskViews("driver-other-002")).toEqual([
      expect.objectContaining({
        taskId: order.mirrorOrderId,
        allowedActions: ["accept", "reject"],
      }),
    ]);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "forwarder",
        actionName: "reject_forwarded_order",
        actorId: "driver-reject-001",
      }),
    );
  });

  it("hides forwarded orders from drivers who are not in the candidate set", () => {
    const { service } = createService({
      eligibleDriverIds: ["driver-included-001"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-broadcast-only-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-included-001"],
    });

    expect(service.listDriverTaskViews("driver-included-001")).toHaveLength(1);
    expect(service.listDriverTaskViews("driver-excluded-002")).toEqual([]);
    expect(() =>
      service.getDriverTaskView("driver-excluded-002", order.mirrorOrderId),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_TASK_VIEW_NOT_FOUND",
          }),
        }),
      }),
    );
  });

  it("hides forwarded orders that have only been received but not yet broadcast", () => {
    const { service } = createService();

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-received-only-001",
      payload: { serviceBucket: "standard_taxi" },
    });

    expect(service.listDriverTaskViews("any-driver-001")).toEqual([]);
    expect(() =>
      service.getDriverTaskView("any-driver-001", order.mirrorOrderId),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_TASK_VIEW_NOT_FOUND",
          }),
        }),
      }),
    );
  });

  it("hides accept_pending forwarded orders from drivers who did not accept", async () => {
    const { service } = createService({
      eligibleDriverIds: ["driver-accept-001", "driver-other-002"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-accept-pending-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-accept-001", "driver-other-002"],
    });
    await service.relayDriverAccept(order.mirrorOrderId, {
      driverId: "driver-accept-001",
    });

    expect(service.listDriverTaskViews("driver-accept-001")).toHaveLength(1);
    expect(service.listDriverTaskViews("driver-other-002")).toEqual([]);
    expect(() =>
      service.getDriverTaskView("driver-other-002", order.mirrorOrderId),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_TASK_VIEW_NOT_FOUND",
          }),
        }),
      }),
    );
  });

  it("only shows owned tasks belonging to the requesting driver", () => {
    const ownedMobilityService = createOwnedMobilityServiceMock();
    const ownedTaskFor = (driverId: string, taskId: string) => ({
      taskId,
      orderId: `order-${taskId}`,
      dispatchJobId: `dispatch-${taskId}`,
      assignmentId: `assignment-${taskId}`,
      driverId,
      vehicleId: `vehicle-${taskId}`,
      sourcePlatform: null,
      routeProvided: true,
      waypoints: [],
      status: "pending_acceptance" as const,
      acceptedAt: null,
      departedAt: null,
      arrivedPickupAt: null,
      startedAt: null,
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
      fare: null,
      proof: null,
      complianceGates: [],
    });
    ownedMobilityService.listDriverTasks.mockReturnValue([
      ownedTaskFor("driver-mine-001", "task-mine-001"),
      ownedTaskFor("driver-other-002", "task-other-002"),
    ]);
    ownedMobilityService.listOrders.mockReturnValue([]);

    const { service } = createService({ ownedMobilityService });

    const views = service.listDriverTaskViews("driver-mine-001");

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      taskId: "task-mine-001",
      orderDomain: "owned",
    });
    expect(() =>
      service.getDriverTaskView("driver-mine-001", "task-other-002"),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_TASK_VIEW_NOT_FOUND",
          }),
        }),
      }),
    );
  });

  it("requires a non-blank driverId on driver task view queries", () => {
    const { service } = createService();

    const fieldRequired = expect.objectContaining({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "FIELD_REQUIRED",
          details: expect.objectContaining({ field: "driverId" }),
        }),
      }),
    });
    expect(() => service.listDriverTaskViews("")).toThrow(fieldRequired);
    expect(() => service.getDriverTaskView("", "FWD-anything")).toThrow(
      fieldRequired,
    );
  });

  it("maps sync-failed forwarded orders into driver-safe blocking states", async () => {
    const adapter = createAdapter({
      accept: vi.fn(async () => {
        throw new Error("token expired; reauth required");
      }),
    });
    const { service } = createService({
      adapter,
      eligibleDriverIds: ["driver-view-002"],
    });

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-view-002",
      payload: { serviceBucket: "standard_taxi" },
    });
    service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-view-002"],
    });
    await expect(
      service.relayDriverAccept(order.mirrorOrderId, {
        driverId: "driver-view-002",
      }),
    ).rejects.toBeTruthy();

    expect(
      service.getDriverTaskView("driver-view-002", order.mirrorOrderId),
    ).toMatchObject({
      taskId: order.mirrorOrderId,
      orderDomain: "forwarded",
      localStatus: "sync_failed",
      driverActionState: "blocked",
      requiresManualFallback: true,
      requiresReauth: true,
      syncIssueSummary:
        "Dispatch must confirm platform acceptance manually before continuing.",
      blockingReason:
        "Dispatch must confirm platform acceptance manually before continuing.",
    });
    expect(service.listAdapterHealth()).toEqual([
      expect.objectContaining({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        status: "degraded",
        reason: "auth",
        authStatus: "reauth_required",
        credentialStatus: "expired",
      }),
    ]);
  });
});
