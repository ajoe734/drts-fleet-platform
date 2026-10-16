import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { ForwarderController } from "../../../apps/api/src/modules/forwarder/forwarder.controller";
import { ForwarderRepository } from "../../../apps/api/src/modules/forwarder/forwarder.repository";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
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

function driverIdentity(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: [],
    requestId: null,
  };
}

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
  const findOrderByIdentity = vi.fn(async () => null);

  return {
    repository: {
      loadState: vi.fn(async () => ({
        forwardedOrders: [],
        adapterHealth: [],
      })),
      persistChanges,
      findOrderByIdentity,
      reportPersistenceFailure: vi.fn(),
    } as unknown as ForwarderRepository,
    persistChanges,
    findOrderByIdentity,
    readPersisted: () => persistedForwardedOrders,
  };
}

/**
 * Real-shaped `DatabaseService` double used for the C034-F1 regression below:
 * controls exactly one targeted `query()` call (the forwarded-order write
 * whose `status` column matches `gatedStatus`) so the test can hold it open
 * while a concurrent command races it, without duplicating any business SQL
 * — every call still goes through the real `ForwarderRepository` and its
 * actual INSERT/UPSERT statements.
 */
function createGatedDatabaseService(gatedStatus: string) {
  let releaseGate!: () => void;
  let gateRejects = false;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  let gateEnteredResolve!: () => void;
  const gateEntered = new Promise<void>((resolve) => {
    gateEnteredResolve = resolve;
  });
  let gateHit = false;

  const query = vi.fn(
    async (text: string, values?: readonly unknown[]): Promise<{
      rows: unknown[];
      rowCount: number;
    }> => {
      const isForwardedOrderWrite =
        text.includes("ops.phase1_forwarded_orders") &&
        text.includes("INSERT");
      const status = isForwardedOrderWrite
        ? (values as unknown[] | undefined)?.[3]
        : undefined;

      if (isForwardedOrderWrite && status === gatedStatus && !gateHit) {
        gateHit = true;
        gateEnteredResolve();
        await gate;
        if (gateRejects) {
          throw new Error(
            `simulated write failure for gated status ${gatedStatus}`,
          );
        }
      }

      return { rows: [], rowCount: 0 };
    },
  );

  return {
    databaseService: { isEnabled: () => true, query } as unknown as DatabaseService,
    query,
    waitForGateEntered: () => gateEntered,
    releaseGate: (rejectAfter: boolean) => {
      gateRejects = rejectAfter;
      releaseGate();
    },
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

  it("does not let a driver-visible read (getOrder/listOrders/driver task view) observe the broadcast before its durable ACK resolves", async () => {
    const { repository, persistChanges } = createControllableRepository();
    const { service } = createHarness({ repository });

    const order = await service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-cache-gate-001",
      payload: { serviceBucket: "standard_taxi" },
    });

    let resolvePersist!: () => void;
    persistChanges.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = () => resolve();
        }),
    );

    const broadcastPromise = service.broadcastOrder(order.mirrorOrderId, {
      candidateDriverIds: ["driver-ack-001"],
    });

    await Promise.resolve();
    await Promise.resolve();

    // The durable write for the broadcast is still in flight: no reader may
    // observe "broadcasted" yet, including the driver task view that would
    // newly become visible once candidateDriverIds includes this driver.
    expect(service.getOrder(order.mirrorOrderId).status).toBe("received");
    expect(service.listOrders()[0]!.status).toBe("received");
    expect(
      await service.listDriverTaskViewsForRead("driver-ack-001"),
    ).toEqual([]);

    resolvePersist();
    await broadcastPromise;

    expect(service.getOrder(order.mirrorOrderId).status).toBe("broadcasted");
    expect(
      (await service.listDriverTaskViewsForRead("driver-ack-001")).map(
        (view) => view.taskId,
      ),
    ).toContain(order.mirrorOrderId);
  });

  describe("C033-F1 reportSyncFailure: honest durable-ACK command", () => {
    it("durably records the sync failure and returns it once the write is ACKed", async () => {
      const { repository } = createControllableRepository();
      const { service, auditNotificationService } = createHarness({
        repository,
      });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-report-sync-failure-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      auditNotificationService.recordAuditLog.mockClear();

      const resolved = await service.reportSyncFailure(order.mirrorOrderId, {
        errorCode: "FORWARDER_MANUAL_SYNC_FAILURE",
        errorMessage: "ops reported a platform mismatch",
        retryable: true,
      });

      expect(resolved.status).toBe("sync_failed");
      expect(resolved.lastSyncError).toMatchObject({
        code: "FORWARDER_MANUAL_SYNC_FAILURE",
      });
      expect(service.listOrders()[0]!.status).toBe("sync_failed");
      expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actionName: "mark_forwarder_sync_failed",
          newValuesSummary: expect.objectContaining({ persisted: true }),
        }),
      );
    });

    it("throws instead of reporting a fake success when its own durable write is never ACKed", async () => {
      const { repository, persistChanges } = createControllableRepository();
      const { service } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-report-sync-failure-ack-002",
        payload: { serviceBucket: "standard_taxi" },
      });

      persistChanges.mockRejectedValueOnce(
        new Error("simulated connection reset recording sync failure"),
      );

      await expect(
        service.reportSyncFailure(order.mirrorOrderId, {
          errorCode: "FORWARDER_MANUAL_SYNC_FAILURE",
          errorMessage: "ops reported a platform mismatch",
          retryable: true,
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
            retryable: true,
          },
        },
      });

      // The in-memory record is honestly marked uncertain (not a confirmed
      // sync_failed), distinguishable from a durably-recorded failure.
      const cached = service.listOrders()[0]!;
      expect(cached.status).toBe("sync_failed");
      expect(cached.lastSyncError).toMatchObject({
        code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
      });
    });
  });

  describe("C033-F1 ingest retry: readback before re-attempting a write", () => {
    it("adopts the repository's readback instead of blindly trusting the cached uncertain guess", async () => {
      const { repository, persistChanges, findOrderByIdentity } =
        createControllableRepository();
      persistChanges.mockRejectedValueOnce(
        new Error("simulated timeout before ACK"),
      );
      const { service } = createHarness({ repository });

      await expect(
        service.ingestExternalOrder({
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-retry-readback-001",
          payload: { serviceBucket: "standard_taxi" },
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      const firstMirrorOrderId = service.listOrders()[0]!.mirrorOrderId;

      // The prior write actually landed server-side despite the client
      // never seeing the ACK (e.g. a connection reset after commit).
      // Readback must recover that real row rather than re-writing.
      findOrderByIdentity.mockResolvedValueOnce({
        mirrorOrderId: firstMirrorOrderId,
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-retry-readback-001",
        orderDomain: "forwarded",
        dispatchSemantics: "forwarder_broadcast",
        status: "received",
        candidateDriverIds: [],
        acceptedDriverId: null,
        lastNativeStatus: null,
        payload: { serviceBucket: "standard_taxi" },
        authoritativeSnapshot: {
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-retry-readback-001",
          nativeStatus: "received",
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
        createdAt: "2026-10-16T00:00:00.000Z",
        updatedAt: "2026-10-16T00:05:00.000Z",
      } as never);

      const callsBeforeRetry = persistChanges.mock.calls.length;
      const retried = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-retry-readback-001",
        payload: { serviceBucket: "standard_taxi" },
      });

      expect(findOrderByIdentity).toHaveBeenCalledWith(
        GRAB_TAIWAN_PLATFORM_CODE,
        "grab-order-retry-readback-001",
      );
      expect(retried.mirrorOrderId).toBe(firstMirrorOrderId);
      expect(retried.status).toBe("received");
      expect(retried.lastSyncError).toBeNull();
      // Readback adoption must not re-attempt a write of its own.
      expect(persistChanges.mock.calls.length).toBe(callsBeforeRetry);
    });

    it("re-attempts the write (not just a cache return) when nothing durable exists yet for this identity", async () => {
      const { repository, persistChanges, findOrderByIdentity } =
        createControllableRepository();
      persistChanges.mockRejectedValueOnce(
        new Error("simulated timeout before ACK"),
      );
      const { service } = createHarness({ repository });

      await expect(
        service.ingestExternalOrder({
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-retry-write-001",
          payload: { serviceBucket: "standard_taxi" },
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      const firstMirrorOrderId = service.listOrders()[0]!.mirrorOrderId;

      // Default double continues to report no durable row for this identity.
      const callsBeforeRetry = persistChanges.mock.calls.length;
      const retried = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-retry-write-001",
        payload: { serviceBucket: "standard_taxi" },
      });

      expect(findOrderByIdentity).toHaveBeenCalled();
      // A genuine new write was attempted (and, here, succeeded).
      expect(persistChanges.mock.calls.length).toBeGreaterThan(
        callsBeforeRetry,
      );
      expect(retried.mirrorOrderId).toBe(firstMirrorOrderId);
      expect(retried.externalOrderId).toBe("grab-order-retry-write-001");
      expect(retried.status).toBe("received");
      expect(retried.lastSyncError).toBeNull();
      expect(service.listOrders()).toHaveLength(1);
    });
  });

  describe("C034-F1 real repository-level race: accept vs. native authority", () => {
    async function setupBroadcastedOrder(databaseService: DatabaseService) {
      const repository = new ForwarderRepository(databaseService);
      const regulatoryRegistryService = {
        getEligibleCandidates: vi.fn(() => [
          {
            driverId: "driver-dbrace-001",
            vehicleId: "veh-dbrace-001",
            etaMinutes: 5,
            operatingArea: "default",
            serviceBuckets: ["standard_taxi"],
            currentLocation: null,
          },
        ]),
        getVehicleLicenseType: vi.fn(() => "taxi"),
      };
      const auditNotificationService = { recordAuditLog: vi.fn() };
      const adapter = createAdapter();
      const service = new ForwarderService(
        regulatoryRegistryService as never,
        auditNotificationService as never,
        [adapter],
        repository,
      );
      const controller = new ForwarderController(service);

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-db-race-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-dbrace-001"],
      });

      return { service, controller, order };
    }

    it("preserves a native cancellation over a stale accept write even when the accept's own durable write ultimately fails (late rejection)", async () => {
      const { databaseService, waitForGateEntered, releaseGate } =
        createGatedDatabaseService("accept_pending");
      const { service, controller, order } =
        await setupBroadcastedOrder(databaseService);

      // Exercised through the actual mounted driver caller, not just the
      // service method directly.
      const acceptPromise = controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-dbrace-001"),
        {},
      );

      // Let the accept relay's real repository write reach (and hold) the
      // gate before the native sync is issued, so the native sync is forced
      // to queue behind the accept command's own commit instead of racing
      // ahead of it.
      await waitForGateEntered();
      const syncPromise = service.syncNativeStatus(order.mirrorOrderId, {
        nativeStatus: "cancelled_by_platform",
      });

      releaseGate(true);

      await Promise.allSettled([acceptPromise, syncPromise]);

      const finalOrder = service.listOrders()[0]!;
      expect(finalOrder.status).toBe("cancelled_by_platform");
      // syncNativeStatus never touches acceptedDriverId; the driver who
      // attempted the accept stays attributable for dispatch/manual
      // follow-up even though the native platform's cancellation wins.
      expect(finalOrder.acceptedDriverId).toBe("driver-dbrace-001");
    });

    it("preserves a native cancellation over a stale accept write even when the accept's own durable write ultimately succeeds (late success)", async () => {
      const { databaseService, waitForGateEntered, releaseGate } =
        createGatedDatabaseService("accept_pending");
      const { service, controller, order } =
        await setupBroadcastedOrder(databaseService);

      const acceptPromise = controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-dbrace-001"),
        {},
      );

      await waitForGateEntered();
      const syncPromise = service.syncNativeStatus(order.mirrorOrderId, {
        nativeStatus: "cancelled_by_platform",
      });

      releaseGate(false);

      await Promise.allSettled([acceptPromise, syncPromise]);

      // Even though the accept relay's own durable write landed, it landed
      // strictly before the native sync's write (the lock forces that
      // ordering), so the native cancellation is the final durable row —
      // never a restored/stale accept_pending.
      const finalOrder = service.listOrders()[0]!;
      expect(finalOrder.status).toBe("cancelled_by_platform");
      expect(finalOrder.acceptedDriverId).toBe("driver-dbrace-001");
    });
  });
});
