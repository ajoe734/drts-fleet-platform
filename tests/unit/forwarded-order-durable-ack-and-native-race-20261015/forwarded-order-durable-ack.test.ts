import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { ForwarderController } from "../../../apps/api/src/modules/forwarder/forwarder.controller";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import type { ForwarderRepository } from "../../../apps/api/src/modules/forwarder/forwarder.repository";
import { GRAB_TAIWAN_PLATFORM_CODE } from "../../../apps/api/src/modules/forwarder/grab-taiwan.adapter";
import type {
  ForwarderAdapterAcceptInput,
  ForwarderAdapterActionResult,
  ForwarderAdapterCompleteInput,
  ForwarderAdapterEarningsResult,
  ForwarderAdapterHeartbeatResult,
  ForwarderAdapterInterface,
  ForwarderAdapterRejectInput,
} from "../../../apps/api/src/modules/forwarder/forwarder-adapter.interface";

/**
 * C033-F1 regression coverage: the forwarded mirror command lifecycle must
 * await the repository's durable ACK before publishing audit/HTTP success,
 * and an unconfirmed write must produce an honest degraded state (not a
 * silent/fake success) while preserving mirror identity for retries.
 */

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
    accept: vi.fn(
      async ({
        externalOrderId,
      }: ForwarderAdapterAcceptInput): Promise<ForwarderAdapterActionResult> => ({
        acknowledged: true,
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId,
        detail: "accept_ok",
      }),
    ),
    reject: vi.fn(
      async ({
        externalOrderId,
      }: ForwarderAdapterRejectInput): Promise<ForwarderAdapterActionResult> => ({
        acknowledged: true,
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId,
        detail: "reject_ok",
      }),
    ),
    complete: vi.fn(
      async ({
        externalOrderId,
      }: ForwarderAdapterCompleteInput): Promise<ForwarderAdapterActionResult> => ({
        acknowledged: true,
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId,
        detail: "complete_ok",
      }),
    ),
    heartbeat: vi.fn(
      async (): Promise<ForwarderAdapterHeartbeatResult> => ({
        acknowledged: true,
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        checkedAt: new Date().toISOString(),
      }),
    ),
    fetchEarnings: vi.fn(
      async (): Promise<ForwarderAdapterEarningsResult> => ({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        currency: "TWD",
        totalAmount: 0,
        asOf: new Date().toISOString(),
      }),
    ),
    ...overrides,
  };
}

/**
 * Repository "restart/readback" double: a real-shaped ForwarderRepository
 * whose persistChanges promise the test fully controls (deferred, rejected,
 * or resolved), so the test can observe exactly what the service does while
 * a durable write is in flight or has failed, without a real Postgres.
 */
function createControllableRepository() {
  let persistedForwardedOrders: unknown[] = [];
  const persistChanges = vi.fn(
    async (changes: { forwardedOrders?: readonly unknown[] }) => {
      if (changes.forwardedOrders) {
        persistedForwardedOrders = [...changes.forwardedOrders];
      }
    },
  );

  return {
    repository: {
      loadState: vi.fn(async () => ({
        forwardedOrders: [],
        adapterHealth: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as ForwarderRepository,
    persistChanges,
    readPersisted: () => persistedForwardedOrders,
  };
}

function createHarness(options?: {
  adapter?: ForwarderAdapterInterface;
  repository?: ForwarderRepository;
  eligibleDriverIds?: string[];
}) {
  const eligibleDriverIds = options?.eligibleDriverIds ?? ["driver-ack-001"];
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() =>
      eligibleDriverIds.map((driverId) => ({
        driverId,
        vehicleId: "veh-ack-001",
        etaMinutes: 5,
        operatingArea: "default",
        serviceBuckets: ["standard_taxi"],
        currentLocation: null,
      })),
    ),
    getVehicleLicenseType: vi.fn(() => "taxi"),
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const adapter = options?.adapter ?? createAdapter();

  const service = new ForwarderService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    [adapter],
    options?.repository,
  );
  const controller = new ForwarderController(service);

  return { service, controller, auditNotificationService, adapter };
}

describe("FORWARDED-ORDER-DURABLE-ACK-AND-NATIVE-RACE-FLOW-20261015: C033-F1 durable ACK", () => {
  it("does not publish the broadcast success audit until the repository's durable ACK resolves", async () => {
    const { repository, persistChanges } = createControllableRepository();
    const { service, controller, auditNotificationService } = createHarness({
      repository,
    });

    // Ingress itself durably ACKs normally; only the broadcast write below
    // is held open.
    const order = await service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-ack-timing-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    auditNotificationService.recordAuditLog.mockClear();

    let resolvePersist!: () => void;
    persistChanges.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = () => resolve();
        }),
    );

    const broadcastPromise = controller.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-ack-001"],
    });

    // The repository write is still in flight: the broadcast must not yet
    // have published its success audit log entry.
    await Promise.resolve();
    await Promise.resolve();
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();

    resolvePersist();
    const response = await broadcastPromise;

    expect(response.data?.status).toBe("broadcasted");
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: "broadcast_forwarded_order" }),
    );
  });

  it("reports an honest degraded state and does not publish a fake success when the durable write is never ACKed", async () => {
    const { repository, persistChanges } = createControllableRepository();
    const { service, auditNotificationService } = createHarness({
      repository,
    });

    const order = await service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-ack-failure-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    auditNotificationService.recordAuditLog.mockClear();
    persistChanges.mockRejectedValueOnce(
      new Error("simulated connection reset before ACK"),
    );

    await expect(
      service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
          retryable: true,
        },
      },
    });

    // No success audit for the broadcast was published; only the honest
    // sync-failure recording was.
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionName: "broadcast_forwarded_order" }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: "mark_forwarder_sync_failed" }),
    );

    const persistedOrder = service.listOrders()[0]!;
    expect(persistedOrder.status).toBe("sync_failed");
    expect(persistedOrder.manualFallback.required).toBe(true);
    expect(persistedOrder.reconciliationJob).toMatchObject({
      reason: "sync_failed",
      status: "queued",
    });
    // The mirror identity is unchanged by the failed write.
    expect(persistedOrder.mirrorOrderId).toBe(order.mirrorOrderId);
    expect(persistedOrder.platformCode).toBe(GRAB_TAIWAN_PLATFORM_CODE);
    expect(persistedOrder.externalOrderId).toBe(
      "grab-order-ack-failure-001",
    );
  });

  it("preserves platformCode/externalOrderId/mirror identity when the same ingress is retried after an unconfirmed write", async () => {
    const { repository, persistChanges } = createControllableRepository();
    persistChanges.mockRejectedValueOnce(
      new Error("simulated timeout before ACK"),
    );
    const { service } = createHarness({ repository });

    await expect(
      service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-retry-identity-001",
        payload: { serviceBucket: "standard_taxi" },
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" },
      },
    });

    expect(service.listOrders()).toHaveLength(1);
    const firstMirrorOrderId = service.listOrders()[0]!.mirrorOrderId;
    expect(service.listOrders()[0]!.status).toBe("sync_failed");

    // Retrying the exact same external order (the natural client behavior
    // after a 502/retryable response) must not mint a second mirror order,
    // and must not re-attempt a write against the now-stable record.
    const retried = await service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-retry-identity-001",
      payload: { serviceBucket: "standard_taxi" },
    });

    expect(retried.mirrorOrderId).toBe(firstMirrorOrderId);
    expect(retried.platformCode).toBe(GRAB_TAIWAN_PLATFORM_CODE);
    expect(retried.externalOrderId).toBe("grab-order-retry-identity-001");
    expect(service.listOrders()).toHaveLength(1);
  });

  it("surfaces the real native race outcome (not a fake persistence success) when the durable write fails during accept relay", async () => {
    const { repository, persistChanges } = createControllableRepository();
    const { service } = createHarness({ repository });

    const order = await service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-accept-ack-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    await service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-ack-001"],
    });

    persistChanges.mockRejectedValueOnce(
      new Error("simulated write failure after adapter accept"),
    );

    await expect(
      service.relayDriverAccept(order.mirrorOrderId, {
        driverId: "driver-ack-001",
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" },
      },
    });

    const persistedOrder = service.listOrders()[0]!;
    expect(persistedOrder.status).toBe("sync_failed");
    expect(persistedOrder.manualFallback.required).toBe(true);
    // No invented provider receipt: the driver who requested accept is not
    // left holding a fabricated accept_pending outcome.
    expect(persistedOrder.acceptedDriverId).toBe("driver-ack-001");
  });

  it("recovers the honest mirror identity from the repository on restart/readback after a prior unconfirmed write", async () => {
    const { repository } = createControllableRepository();
    (repository.loadState as ReturnType<typeof vi.fn>).mockResolvedValue({
      forwardedOrders: [
        {
          mirrorOrderId: "FWD-readback-001",
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-readback-001",
          orderDomain: "forwarded",
          dispatchSemantics: "forwarder_broadcast",
          status: "sync_failed",
          candidateDriverIds: [],
          acceptedDriverId: null,
          lastNativeStatus: null,
          payload: { serviceBucket: "standard_taxi" },
          authoritativeSnapshot: {
            platformCode: GRAB_TAIWAN_PLATFORM_CODE,
            externalOrderId: "grab-order-readback-001",
            nativeStatus: "received",
          },
          financeContext: {
            fareAuthority: "external_platform",
            settlementAuthority: "external_platform",
            driverPayoutAuthority: "external_platform",
            localLedgerMode: "shadow_only",
          },
          lastSyncError: {
            code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
            message: "Durable persistence ACK was not received",
            retryable: true,
            failedAt: "2026-10-16T00:00:00.000Z",
            nativeStatus: null,
            payload: {},
          },
          manualFallback: {
            required: true,
            reason:
              "Local mirror write was not durably confirmed; verify canonical state via readback/reconciliation before retrying.",
            requestedAt: "2026-10-16T00:00:00.000Z",
            requestedBy: null,
            notes: null,
          },
          reconciliationJob: {
            reconciliationJobId: "FWD-REC-readback-001",
            mirrorOrderId: "FWD-readback-001",
            platformCode: GRAB_TAIWAN_PLATFORM_CODE,
            externalOrderId: "grab-order-readback-001",
            reason: "sync_failed",
            status: "queued",
            mismatchCount: 0,
            notes: null,
            createdAt: "2026-10-16T00:00:00.000Z",
            completedAt: null,
          },
          createdAt: "2026-10-16T00:00:00.000Z",
          updatedAt: "2026-10-16T00:00:00.000Z",
        },
      ],
      adapterHealth: [],
    });
    const { service } = createHarness({ repository });

    await service.onModuleInit();

    const recovered = service.listOrders()[0]!;
    expect(recovered.mirrorOrderId).toBe("FWD-readback-001");
    expect(recovered.externalOrderId).toBe("grab-order-readback-001");
    expect(recovered.status).toBe("sync_failed");
    expect(recovered.reconciliationJob?.status).toBe("queued");

    // Dispatch can now resolve the previously-unconfirmed mirror through the
    // normal reconciliation command, preserving the same mirror identity.
    const resolved = await service.completeReconciliation(
      "FWD-readback-001",
      {
        nativeStatus: "confirmed_by_platform",
        mismatchCount: 0,
      },
    );

    expect(resolved.mirrorOrderId).toBe("FWD-readback-001");
    expect(resolved.status).toBe("confirmed_by_platform");
  });
});
