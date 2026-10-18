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
 *
 * Unlike a stateless stub, this double keeps an actual backing table keyed
 * by mirror_order_id, applying the same "a write older than the row it
 * would replace is a no-op" guard as the repository's real conditional
 * UPSERT (`WHERE EXCLUDED.updated_at >= ...`). That lets tests assert on
 * the durable row directly (`readDurableOrder`) and exercise a genuine
 * restart (`loadState`) through this same table, instead of only observing
 * the in-memory service cache.
 */
function createGatedDatabaseService(gatedStatus: string) {
  const table = new Map<string, { updatedAt: string; record: unknown }>();
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
      const isForwardedOrdersTable = text.includes(
        "ops.phase1_forwarded_orders",
      );

      if (isForwardedOrdersTable && text.includes("INSERT")) {
        const params = values as unknown[];
        const [mirrorOrderId, , , status, , updatedAt, recordJson] = params;

        if (status === gatedStatus && !gateHit) {
          gateHit = true;
          gateEnteredResolve();
          await gate;
          if (gateRejects) {
            throw new Error(
              `simulated write failure for gated status ${gatedStatus}`,
            );
          }
        }

        const existing = table.get(mirrorOrderId as string);
        if (!existing || (updatedAt as string) >= existing.updatedAt) {
          table.set(mirrorOrderId as string, {
            updatedAt: updatedAt as string,
            record: JSON.parse(recordJson as string),
          });
        }
        return { rows: [], rowCount: 1 };
      }

      if (isForwardedOrdersTable && text.includes("SELECT")) {
        if (text.includes("WHERE platform_code")) {
          const [platformCode, externalOrderId] = values as [string, string];
          const match = [...table.values()].find((row) => {
            const record = row.record as {
              platformCode: string;
              externalOrderId: string;
            };
            return (
              record.platformCode === platformCode &&
              record.externalOrderId === externalOrderId
            );
          });
          return match
            ? { rows: [{ record: match.record }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        const rows = [...table.values()].map((row) => ({
          record: row.record,
        }));
        return { rows, rowCount: rows.length };
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
    readDurableOrder: (mirrorOrderId: string) =>
      table.get(mirrorOrderId)?.record as
        | { status: string; acceptedDriverId: string | null }
        | undefined,
  };
}

/**
 * Real-shaped `DatabaseService` double backed by an actual table keyed by
 * mirror_order_id (same shape as `createGatedDatabaseService`, without the
 * gate), used where a test only needs to toggle whether forwarded-order
 * writes/readbacks succeed or fail and then assert on the durable row and a
 * genuine restart — not just the in-memory service cache.
 */
function createRecordingDatabaseService() {
  const table = new Map<string, unknown>();
  let rejectOrderWrites = false;
  let rejectOrderWritesRemaining = 0;
  let rejectReadback = false;

  const query = vi.fn(
    async (
      text: string,
      values?: readonly unknown[],
    ): Promise<{ rows: unknown[]; rowCount: number }> => {
      const isForwardedOrdersTable = text.includes(
        "ops.phase1_forwarded_orders",
      );

      if (isForwardedOrdersTable && text.includes("INSERT")) {
        if (rejectOrderWrites || rejectOrderWritesRemaining > 0) {
          if (rejectOrderWritesRemaining > 0) {
            rejectOrderWritesRemaining -= 1;
          }
          throw new Error("order write not acknowledged");
        }
        const params = values as unknown[];
        const [mirrorOrderId, , , , , , recordJson] = params;
        table.set(mirrorOrderId as string, JSON.parse(recordJson as string));
        return { rows: [], rowCount: 1 };
      }

      if (isForwardedOrdersTable && text.includes("WHERE platform_code")) {
        if (rejectReadback) {
          throw new Error("readback query timed out");
        }
        const [platformCode, externalOrderId] = values as [string, string];
        const match = [...table.values()].find((record) => {
          const typed = record as {
            platformCode: string;
            externalOrderId: string;
          };
          return (
            typed.platformCode === platformCode &&
            typed.externalOrderId === externalOrderId
          );
        });
        return match
          ? { rows: [{ record: match }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (isForwardedOrdersTable) {
        const rows = [...table.values()].map((record) => ({ record }));
        return { rows, rowCount: rows.length };
      }

      if (text.includes("ops.phase1_adapter_health")) {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    },
  );

  return {
    databaseService: { isEnabled: () => true, query } as unknown as DatabaseService,
    setRejectOrderWrites: (value: boolean) => {
      rejectOrderWrites = value;
    },
    // Rejects exactly the next `count` forwarded-order writes (e.g. just the
    // accept_pending write), then lets later writes (e.g. markSyncFailed's
    // own fallback write) land normally — unlike `setRejectOrderWrites`,
    // which rejects every write unconditionally.
    setRejectOrderWritesOnce: (count: number) => {
      rejectOrderWritesRemaining = count;
    },
    setRejectReadback: (value: boolean) => {
      rejectReadback = value;
    },
    readDurableOrder: (mirrorOrderId: string) =>
      table.get(mirrorOrderId) as
        | { status: string; acceptedDriverId: string | null; candidateDriverIds: string[] }
        | undefined,
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
      const { databaseService, waitForGateEntered, releaseGate, readDurableOrder } =
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

      const [acceptSettled, syncSettled] = await Promise.allSettled([
        acceptPromise,
        syncPromise,
      ]);
      // The accept relay's own accept_pending write never durably lands,
      // but markSyncFailed's own fallback write (a *different* write, not
      // gated by this double) does land — so accept resolves with an
      // honestly-confirmed degraded "sync_failed" success envelope, not a
      // thrown error. The sync caller (queued behind the same lock) must
      // also resolve cleanly, unaffected by the accept's local failure.
      expect(acceptSettled.status).toBe("fulfilled");
      expect(syncSettled.status).toBe("fulfilled");

      const finalOrder = service.listOrders()[0]!;
      expect(finalOrder.status).toBe("cancelled_by_platform");
      // syncNativeStatus never touches acceptedDriverId; the driver who
      // attempted the accept stays attributable for dispatch/manual
      // follow-up even though the native platform's cancellation wins.
      expect(finalOrder.acceptedDriverId).toBe("driver-dbrace-001");

      // The durable row itself (not just the in-memory cache) must agree,
      // and a cold restart reading that same row must reconstruct the
      // identical canonical state.
      const durable = readDurableOrder(order.mirrorOrderId);
      expect(durable?.status).toBe("cancelled_by_platform");
      expect(durable?.acceptedDriverId).toBe("driver-dbrace-001");

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      const restarted = restartedService.getOrder(order.mirrorOrderId);
      expect(restarted.status).toBe("cancelled_by_platform");
      expect(restarted.acceptedDriverId).toBe("driver-dbrace-001");
    });

    it("preserves a native cancellation over a stale accept write even when the accept's own durable write ultimately succeeds (late success)", async () => {
      const { databaseService, waitForGateEntered, releaseGate, readDurableOrder } =
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

      const [acceptSettled, syncSettled] = await Promise.allSettled([
        acceptPromise,
        syncPromise,
      ]);
      expect(acceptSettled.status).toBe("fulfilled");
      expect(syncSettled.status).toBe("fulfilled");

      // Even though the accept relay's own durable write landed, it landed
      // strictly before the native sync's write (the lock forces that
      // ordering), so the native cancellation is the final durable row —
      // never a restored/stale accept_pending.
      const finalOrder = service.listOrders()[0]!;
      expect(finalOrder.status).toBe("cancelled_by_platform");
      expect(finalOrder.acceptedDriverId).toBe("driver-dbrace-001");

      const durable = readDurableOrder(order.mirrorOrderId);
      expect(durable?.status).toBe("cancelled_by_platform");
      expect(durable?.acceptedDriverId).toBe("driver-dbrace-001");

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      const restarted = restartedService.getOrder(order.mirrorOrderId);
      expect(restarted.status).toBe("cancelled_by_platform");
      expect(restarted.acceptedDriverId).toBe("driver-dbrace-001");
    });
  });

  describe("R4 batch write settlement: a rejected sibling write must not leave a dangling write behind", () => {
    /**
     * Repository double for one persistChanges() batch containing TWO
     * writes (the forwarded-order write and its adapter-health sibling).
     * The health write rejects immediately; the order write resolves later
     * ("slow success"). Before the fix, `Promise.all` in the repository
     * (and the caller) returned/threw as soon as the health write rejected,
     * without waiting for the still-in-flight order write — leaving it free
     * to land after the lock protecting this very batch had already been
     * released, potentially clobbering a newer command's write. The fix
     * (`Promise.allSettled`) must wait for the order write too before the
     * batch is considered settled.
     */
    function createSlowOrderFastHealthFailureDatabaseService() {
      const table = new Map<string, unknown>();
      let armed = false;
      let orderWriteSettledBeforeBatchReturns = false;
      let batchReturned = false;
      const query = vi.fn(
        async (
          text: string,
          values?: readonly unknown[],
        ): Promise<{ rows: unknown[]; rowCount: number }> => {
          if (
            text.includes("ops.phase1_forwarded_orders") &&
            text.includes("INSERT")
          ) {
            const params = values as unknown[];
            const [mirrorOrderId, , , , , , recordJson] = params;
            if (armed) {
              // Resolve after a macrotask so it is still in flight when the
              // sibling health write below rejects on the same microtask
              // turn.
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            table.set(mirrorOrderId as string, JSON.parse(recordJson as string));
            if (armed) {
              orderWriteSettledBeforeBatchReturns = !batchReturned;
            }
            return { rows: [], rowCount: 1 };
          }
          if (text.includes("ops.phase1_adapter_health")) {
            if (armed) {
              throw new Error("adapter health write rejected immediately");
            }
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        },
      );
      return {
        databaseService: {
          isEnabled: () => true,
          query,
        } as unknown as DatabaseService,
        readDurableOrder: (mirrorOrderId: string) =>
          table.get(mirrorOrderId) as
            | { status: string; acceptedDriverId: string | null }
            | undefined,
        // Ingest/broadcast of the order under test must land normally
        // first; only the accept batch under test should see the health
        // write fail.
        arm: () => {
          armed = true;
        },
        markBatchReturned: () => {
          batchReturned = true;
        },
        didOrderWriteSettleBeforeBatchReturned: () =>
          orderWriteSettledBeforeBatchReturns,
      };
    }

    it("waits for the slow order write to land before the batch (and the per-order lock) is considered done", async () => {
      const {
        databaseService,
        readDurableOrder,
        arm,
        markBatchReturned,
        didOrderWriteSettleBeforeBatchReturned,
      } = createSlowOrderFastHealthFailureDatabaseService();
      const repository = new ForwarderRepository(databaseService);
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-batch-settle-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      arm();
      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      markBatchReturned();

      // The whole point of the fix: by the time the batch has returned
      // (thrown), the slow sibling write was already settled — not still
      // dangling in the background.
      expect(didOrderWriteSettleBeforeBatchReturned()).toBe(true);

      // The durable order write did land (with the accept_pending status
      // this batch attempted), and the subsequent honest fallback
      // (sync_failed, newer updatedAt) is what is actually canonical now —
      // nothing is left to resurface later and clobber a future command.
      const durable = readDurableOrder(order.mirrorOrderId);
      expect(durable?.status).toBe("sync_failed");
      expect(service.getOrder(order.mirrorOrderId).status).toBe(
        "sync_failed",
      );
    });
  });

  describe("C033-F1 mounted accept caller: persistence-uncertain failure must not become a success envelope", () => {
    it("rejects (instead of returning a sync_failed success envelope) when both the accept write and its own markSyncFailed fallback write are rejected", async () => {
      const { repository, persistChanges } = createControllableRepository();
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-accept-double-failure-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      // Every write from here on (the accept_pending write AND
      // markSyncFailed's own fallback write) is rejected: this is a
      // doubly-uncertain write, not a confirmed degraded state.
      persistChanges.mockRejectedValue(new Error("no write acknowledged"));

      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" },
        },
      });

      // The cache still had to record *something* honest (sync_failed with
      // an uncertain-ACK error), but the caller must not have reported that
      // as a driver-visible success.
      const cached = service.getOrder(order.mirrorOrderId);
      expect(cached.status).toBe("sync_failed");
      expect(cached.lastSyncError?.code).toBe(
        "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
      );
    });

    it("also rejects a repeated accept call for the same still-uncertain order (not just the first)", async () => {
      const { repository, persistChanges } = createControllableRepository();
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-accept-repeat-failure-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      persistChanges.mockRejectedValue(new Error("no write acknowledged"));

      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // The order's status is now "sync_failed" (not "broadcasted"), so a
      // repeated mounted accept call skips the relay/catch path entirely and
      // falls through to the plain cache-read branch. That branch must still
      // honor the same uncertain-ACK marker instead of treating the cached
      // sync_failed status as proof of a confirmed degraded state.
      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // No new repository calls were attempted by the repeated read-only
      // path, and the durable row is still the pre-accept broadcasted state.
      const cached = service.getOrder(order.mirrorOrderId);
      expect(cached.status).toBe("sync_failed");
      expect(cached.lastSyncError?.code).toBe(
        "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
      );
    });

    it("never creates a durable accept row while the order stays uncertain, and a cold restart recovers the true pre-accept canonical state (not the in-memory guess)", async () => {
      const { databaseService, setRejectOrderWrites, readDurableOrder } =
        createRecordingDatabaseService();
      const repository = new ForwarderRepository(databaseService);
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-accept-repeat-restart-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      // Every order write from here on (the accept_pending write AND
      // markSyncFailed's own fallback write) is rejected, through the real
      // ForwarderRepository/DatabaseService path, not a repository-level
      // fake.
      setRejectOrderWrites(true);

      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // Neither failed accept ever durably landed: canonical storage still
      // has the pre-accept broadcasted state from the earlier, successfully
      // ACKed broadcast — not the in-memory sync_failed guess this process
      // is carrying.
      const durable = readDurableOrder(order.mirrorOrderId);
      expect(durable?.status).toBe("broadcasted");
      expect(durable?.acceptedDriverId).toBeNull();

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      const restarted = restartedService.getOrder(order.mirrorOrderId);
      expect(restarted.status).toBe("broadcasted");
      expect(restarted.acceptedDriverId).toBeNull();
    });

    it("still returns the sync_failed success envelope once that degraded state is itself durably ACKed", async () => {
      const { repository, persistChanges } = createControllableRepository();
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-accept-honest-failure-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      // Only the accept_pending write fails; the markSyncFailed fallback
      // that records the degraded state durably succeeds.
      persistChanges.mockRejectedValueOnce(
        new Error("no write acknowledged for accept_pending"),
      );

      const response = await controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-ack-001"),
        {},
      );

      expect(response.data.outcome).toBe("sync_failed");
      expect(service.getOrder(order.mirrorOrderId).status).toBe(
        "sync_failed",
      );
    });

    it("still returns the sync_failed success envelope on a repeated mounted accept once that degraded state is durably ACKed, confirmed via the real repository and a cold restart", async () => {
      const {
        databaseService,
        setRejectOrderWritesOnce,
        readDurableOrder,
      } = createRecordingDatabaseService();
      const repository = new ForwarderRepository(databaseService);
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-accept-confirmed-fallback-repeat-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      // Only the accept_pending write fails; markSyncFailed's own fallback
      // write that records the degraded state durably succeeds. The cached
      // lastSyncError.code still reads "FORWARDER_PERSISTENCE_ACK_UNCERTAIN"
      // afterwards (that is `persistOrFail`'s fixed description of *why* it
      // fell back to sync_failed), but the write that actually landed was
      // genuinely ACKed — a later identical accept must not re-reject off
      // that historical cause code.
      setRejectOrderWritesOnce(1);

      const first = await controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-ack-001"),
        {},
      );
      expect(first.data.outcome).toBe("sync_failed");

      const second = await controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-ack-001"),
        {},
      );
      expect(second.data.outcome).toBe("sync_failed");

      const durable = readDurableOrder(order.mirrorOrderId);
      expect(durable?.status).toBe("sync_failed");
      expect(durable?.acceptedDriverId).toBe("driver-ack-001");

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      const restarted = restartedService.getOrder(order.mirrorOrderId);
      expect(restarted.status).toBe("sync_failed");
      expect(restarted.acceptedDriverId).toBe("driver-ack-001");
    });

    it("does not let a mounted reject on the same still-uncertain order report success off an unACKed cache (both the accept write and its own markSyncFailed fallback write were rejected)", async () => {
      const {
        databaseService,
        setRejectOrderWrites,
        readDurableOrder,
      } = createRecordingDatabaseService();
      const repository = new ForwarderRepository(databaseService);
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-reject-after-double-failure-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      // Every order write from here on (the accept_pending write AND
      // markSyncFailed's own fallback write) is rejected: this order's
      // cached sync_failed state is doubly uncertain, not durably confirmed.
      setRejectOrderWrites(true);

      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // The same unACKed cache must not turn into a success just because the
      // next command is "reject" instead of a repeated "accept".
      await expect(
        controller.rejectForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // Durable storage never recorded either write: canonical state is
      // still the pre-accept broadcasted order, not the in-memory
      // sync_failed guess.
      const durable = readDurableOrder(order.mirrorOrderId);
      expect(durable?.status).toBe("broadcasted");
      expect(durable?.acceptedDriverId).toBeNull();

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      const restarted = restartedService.getOrder(order.mirrorOrderId);
      expect(restarted.status).toBe("broadcasted");
      expect(restarted.acceptedDriverId).toBeNull();
    });
  });

  describe("R6: a later confirmed write must not durably re-assert a stale uncertain-ACK marker", () => {
    it("clears the stale mirrorWriteAckUncertain marker once engageManualFallback's own write is durably ACKed, so later accept/reject and a cold restart are honest again", async () => {
      const {
        databaseService,
        setRejectOrderWrites,
        readDurableOrder,
      } = createRecordingDatabaseService();
      const repository = new ForwarderRepository(databaseService);
      const { service, controller } = createHarness({ repository });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-manual-fallback-clears-marker-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-ack-001"],
      });

      // Both the accept_pending write and markSyncFailed's own fallback
      // write are rejected: the cache is left with a genuinely uncertain
      // sync_failed state (lastSyncError.payload.mirrorWriteAckUncertain:
      // true), and nothing durable was ever written for either.
      setRejectOrderWrites(true);
      await expect(
        controller.acceptForwardedOrder(
          order.mirrorOrderId,
          driverIdentity("driver-ack-001"),
          {},
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      expect(
        service.getOrder(order.mirrorOrderId).lastSyncError?.payload
          ?.mirrorWriteAckUncertain,
      ).toBe(true);

      // Durable writes recover. A real ops command (manual fallback) now
      // lands a genuine, ACKed write (rowCount 1) for this same order.
      setRejectOrderWrites(false);
      const fallbackResponse = await controller.engageManualFallback(
        order.mirrorOrderId,
        { reason: "ops confirmed platform state manually" },
      );
      expect(fallbackResponse.data.status).toBe("sync_failed");

      // The durable row this write just landed must not itself claim to be
      // unACKed: the marker describes whether *this* write was confirmed,
      // and it plainly was (the call above did not throw).
      const durableAfterFallback = readDurableOrder(order.mirrorOrderId) as {
        status: string;
        acceptedDriverId: string | null;
        lastSyncError?: { payload?: Record<string, unknown> } | null;
      };
      expect(durableAfterFallback.status).toBe("sync_failed");
      expect(durableAfterFallback.acceptedDriverId).toBe("driver-ack-001");
      expect(
        durableAfterFallback.lastSyncError?.payload?.mirrorWriteAckUncertain,
      ).not.toBe(true);

      // A later accept/reject on the same driver must read this as the
      // confirmed sync_failed state it now durably is, not re-reject it as
      // still-uncertain off a stale marker.
      const acceptAfterFallback = await controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-ack-001"),
        {},
      );
      expect(acceptAfterFallback.data.outcome).toBe("sync_failed");

      const rejectAfterFallback = await controller.rejectForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-ack-001"),
        {},
      );
      expect(rejectAfterFallback.data.outcome).toBe("sync_failed");

      // A cold restart reloads the same, now-honest durable row: it must
      // not resurrect the stale marker either, and driver commands against
      // the restarted service must stay honest too.
      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      const restartedController = new ForwarderController(restartedService);
      const restarted = restartedService.getOrder(order.mirrorOrderId);
      expect(restarted.status).toBe("sync_failed");
      expect(restarted.acceptedDriverId).toBe("driver-ack-001");
      expect(
        restarted.lastSyncError?.payload?.mirrorWriteAckUncertain,
      ).not.toBe(true);

      const acceptAfterRestart = await restartedController.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-ack-001"),
        {},
      );
      expect(acceptAfterRestart.data.outcome).toBe("sync_failed");
    });
  });

  describe("R3 ingress retry shares the mirrorOrderId lock with native sync (unified lock domain)", () => {
    it("queues native sync behind an in-flight uncertain-retry readback instead of letting it interleave, and the later-queued native result survives", async () => {
      const { repository, persistChanges, findOrderByIdentity } =
        createControllableRepository();
      persistChanges.mockRejectedValueOnce(
        new Error("order write not acknowledged"),
      );
      const { service, controller } = createHarness({ repository });

      await expect(
        service.ingestExternalOrder({
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-lock-unify-001",
          payload: { serviceBucket: "standard_taxi" },
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      const mirrorOrderId = service.listOrders()[0]!.mirrorOrderId;

      let releaseReadback!: () => void;
      let readbackEnteredResolve!: () => void;
      const readbackEntered = new Promise<void>((resolve) => {
        readbackEnteredResolve = resolve;
      });
      findOrderByIdentity.mockImplementationOnce(async () => {
        readbackEnteredResolve();
        await new Promise<void>((resolve) => {
          releaseReadback = resolve;
        });
        return null;
      });

      const retryPromise = service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-lock-unify-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await readbackEntered;

      let syncResolved = false;
      const syncPromise = controller
        .syncNativeStatus(mirrorOrderId, {
          nativeStatus: "cancelled_by_platform",
          payload: { providerReference: "native-new-ref" },
        })
        .then((result) => {
          syncResolved = true;
          return result;
        });

      // The retry still holds the mirrorOrderId lock while its readback is
      // in flight; native sync (same lock key) must still be queued behind
      // it, not interleaved with it.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(syncResolved).toBe(false);

      releaseReadback();
      const retried = await retryPromise;
      const syncResult = await syncPromise;

      expect(syncResolved).toBe(true);
      expect(retried.status).toBe("received");
      // Native sync ran after the retry released the lock, so its newer
      // cancellation is what actually survives as canonical — never
      // clobbered by the retry that queued ahead of it.
      expect(syncResult.data.status).toBe("cancelled_by_platform");
      const finalOrder = service.getOrder(mirrorOrderId);
      expect(finalOrder.status).toBe("cancelled_by_platform");
      expect(finalOrder.authoritativeSnapshot.providerReference).toBe(
        "native-new-ref",
      );
      expect(finalOrder.mirrorOrderId).toBe(mirrorOrderId);
      expect(finalOrder.platformCode).toBe(GRAB_TAIWAN_PLATFORM_CODE);
      expect(finalOrder.externalOrderId).toBe("grab-order-lock-unify-001");
    });

    it("stays uncertain instead of blindly resetting to received when the readback query itself fails (failure is not evidence of absence)", async () => {
      const { repository, persistChanges, findOrderByIdentity } =
        createControllableRepository();
      persistChanges.mockRejectedValueOnce(
        new Error("order write not acknowledged"),
      );
      const { service } = createHarness({ repository });

      await expect(
        service.ingestExternalOrder({
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-readback-failure-001",
          payload: { serviceBucket: "standard_taxi" },
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      const mirrorOrderId = service.listOrders()[0]!.mirrorOrderId;

      findOrderByIdentity.mockRejectedValueOnce(
        new Error("readback query timed out"),
      );
      const callsBeforeRetry = persistChanges.mock.calls.length;

      // A failed readback must not be treated as "nothing durable exists
      // yet": it must neither re-attempt the original write nor fabricate a
      // "received" reset, AND it must not let the command report a success
      // envelope for a mirror whose canonical state it just failed to
      // confirm — the retry has to reject honestly instead of silently
      // returning the still-uncertain cached order as if the command had
      // completed.
      await expect(
        service.ingestExternalOrder({
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-readback-failure-001",
          payload: { serviceBucket: "standard_taxi" },
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      expect(persistChanges.mock.calls.length).toBe(callsBeforeRetry);
      const retried = service.listOrders()[0]!;
      expect(retried.status).toBe("sync_failed");
      expect(retried.lastSyncError?.code).toBe(
        "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
      );
      expect(retried.mirrorOrderId).toBe(mirrorOrderId);
      expect(retried.platformCode).toBe(GRAB_TAIWAN_PLATFORM_CODE);
      expect(retried.externalOrderId).toBe("grab-order-readback-failure-001");
    });

    it("never fabricates a durable row out of a failed readback, and a cold restart finds the mirror genuinely absent (not a ghost 'received' row)", async () => {
      const {
        databaseService,
        setRejectOrderWrites,
        setRejectReadback,
        readDurableOrder,
      } = createRecordingDatabaseService();
      const repository = new ForwarderRepository(databaseService);
      const { service } = createHarness({ repository });

      setRejectOrderWrites(true);
      await expect(
        service.ingestExternalOrder({
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-readback-restart-001",
          payload: { serviceBucket: "standard_taxi" },
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });
      const mirrorOrderId = service.listOrders()[0]!.mirrorOrderId;
      expect(readDurableOrder(mirrorOrderId)).toBeUndefined();

      setRejectReadback(true);
      await expect(
        service.ingestExternalOrder({
          platformCode: GRAB_TAIWAN_PLATFORM_CODE,
          externalOrderId: "grab-order-readback-restart-001",
          payload: { serviceBucket: "standard_taxi" },
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // The failed readback must not fabricate a row: canonical storage
      // never actually received a write for this mirror.
      expect(readDurableOrder(mirrorOrderId)).toBeUndefined();

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      // A cold restart reading the same canonical storage finds nothing for
      // this mirror either — there is no stale/ghost order to serve.
      expect(restartedService.listOrders()).toHaveLength(0);
    });
  });

  describe("F3: a late accept must not ignore a durably changed candidate set while status stays broadcasted", () => {
    function createDeferredAcceptAdapter() {
      let resolveAccept!: (value: ForwarderAdapterActionResult) => void;
      let rejectAccept!: (error: unknown) => void;
      let acceptInvokedResolve!: () => void;
      const acceptInvoked = new Promise<void>((resolve) => {
        acceptInvokedResolve = resolve;
      });
      const acceptGate = new Promise<ForwarderAdapterActionResult>(
        (resolve, reject) => {
          resolveAccept = resolve;
          rejectAccept = reject;
        },
      );
      const adapter = createAdapter({
        accept: vi.fn(async () => {
          acceptInvokedResolve();
          return acceptGate;
        }) as unknown as ForwarderAdapterInterface["accept"],
      });
      return {
        adapter,
        acceptInvoked,
        resolveLate: () =>
          resolveAccept({
            acknowledged: true,
            platformCode: GRAB_TAIWAN_PLATFORM_CODE,
            externalOrderId: "grab-order-f3",
            detail: "late_accept_ok",
          }),
        rejectLate: (error: unknown) => rejectAccept(error),
      };
    }

    it("does not revive a rejected driver when the adapter resolves after a concurrent reject already landed (late success)", async () => {
      const { repository } = createControllableRepository();
      const { adapter, acceptInvoked, resolveLate } =
        createDeferredAcceptAdapter();
      const { service, controller } = createHarness({
        repository,
        adapter,
        eligibleDriverIds: ["driver-f3-001"],
      });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-f3-late-success-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-f3-001"],
      });

      const acceptPromise = controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-f3-001"),
        {},
      );
      await acceptInvoked;

      // A legitimate opt-out already lands durably while the adapter call
      // above is still in flight; status stays "broadcasted" throughout.
      const rejectResponse = await controller.rejectForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-f3-001"),
        {},
      );
      expect(rejectResponse.data.outcome).toBe("rejected");
      expect(
        service.getOrder(order.mirrorOrderId).candidateDriverIds,
      ).not.toContain("driver-f3-001");
      expect(service.getOrder(order.mirrorOrderId).status).toBe(
        "broadcasted",
      );

      resolveLate();

      // The old status-only guard would have seen status still "broadcasted"
      // and committed accept_pending/acceptedDriverId for a driver who was
      // durably removed from the candidate set in the meantime. The fix
      // must instead treat this late success as moot.
      await expect(acceptPromise).rejects.toMatchObject({
        response: { error: { code: "DRIVER_TASK_VIEW_NOT_FOUND" } },
      });

      const finalOrder = service.getOrder(order.mirrorOrderId);
      expect(finalOrder.status).toBe("broadcasted");
      expect(finalOrder.acceptedDriverId).toBeNull();
      expect(finalOrder.candidateDriverIds).not.toContain("driver-f3-001");
    });

    it("does not record a stale sync_failed for a rejected driver when the adapter rejects after a concurrent reject already landed (late failure)", async () => {
      const { repository } = createControllableRepository();
      const { adapter, acceptInvoked, rejectLate } =
        createDeferredAcceptAdapter();
      const { service, controller } = createHarness({
        repository,
        adapter,
        eligibleDriverIds: ["driver-f3-002"],
      });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-f3-late-failure-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-f3-002"],
      });

      const acceptPromise = controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-f3-002"),
        {},
      );
      await acceptInvoked;

      await controller.rejectForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-f3-002"),
        {},
      );

      rejectLate(new Error("adapter timed out"));

      // The old status-only guard would have written sync_failed with
      // acceptedDriverId set for a driver who was already durably removed
      // from the candidate set, reviving their driver-visible task.
      await expect(acceptPromise).rejects.toMatchObject({
        response: { error: { code: "DRIVER_TASK_VIEW_NOT_FOUND" } },
      });

      const finalOrder = service.getOrder(order.mirrorOrderId);
      expect(finalOrder.status).toBe("broadcasted");
      expect(finalOrder.acceptedDriverId).toBeNull();
      expect(finalOrder.lastSyncError).toBeNull();
    });

    it("does not revive a driver dropped by a durable rebroadcast to a different candidate set (late success), verified through the real repository and a restart", async () => {
      const { databaseService, readDurableOrder } =
        createRecordingDatabaseService();
      const repository = new ForwarderRepository(databaseService);
      const { adapter, acceptInvoked, resolveLate } =
        createDeferredAcceptAdapter();
      const { service, controller } = createHarness({
        repository,
        adapter,
        eligibleDriverIds: ["driver-f3-003", "driver-f3-004"],
      });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-f3-rebroadcast-001",
        payload: { serviceBucket: "standard_taxi" },
      });
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-f3-003"],
      });

      const acceptPromise = controller.acceptForwardedOrder(
        order.mirrorOrderId,
        driverIdentity("driver-f3-003"),
        {},
      );
      await acceptInvoked;

      // A legitimate rebroadcast durably replaces the candidate set with a
      // different driver while the first driver's adapter call is still
      // in flight (the adapter call runs outside the order lock); status
      // stays "broadcasted" throughout.
      await service.broadcastOrder(order.mirrorOrderId, {
        candidateDriverIds: ["driver-f3-004"],
      });
      expect(
        service.getOrder(order.mirrorOrderId).candidateDriverIds,
      ).toEqual(["driver-f3-004"]);

      resolveLate();

      // The old status-only guard would have seen status still "broadcasted"
      // and committed accept_pending/acceptedDriverId for a driver who was
      // durably dropped from the candidate set by the rebroadcast.
      await expect(acceptPromise).rejects.toMatchObject({
        response: { error: { code: "DRIVER_TASK_VIEW_NOT_FOUND" } },
      });

      const finalOrder = service.getOrder(order.mirrorOrderId);
      expect(finalOrder.status).toBe("broadcasted");
      expect(finalOrder.acceptedDriverId).toBeNull();
      expect(finalOrder.candidateDriverIds).toEqual(["driver-f3-004"]);

      // The durable row (not just the in-memory cache) must agree, and a
      // cold restart reading that same row must reconstruct the identical
      // canonical state — the rebroadcast's candidate set, never the first
      // driver's stale late-success accept.
      const durable = readDurableOrder(order.mirrorOrderId);
      expect(durable?.status).toBe("broadcasted");
      expect(durable?.acceptedDriverId).toBeNull();
      expect(durable?.candidateDriverIds).toEqual(["driver-f3-004"]);

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      const restarted = restartedService.getOrder(order.mirrorOrderId);
      expect(restarted.status).toBe("broadcasted");
      expect(restarted.acceptedDriverId).toBeNull();
      expect(restarted.candidateDriverIds).toEqual(["driver-f3-004"]);
    });
  });

  describe("F4: a zero-row conditional UPSERT must not be treated as a durable ACK", () => {
    it("treats a rowCount:0 conflicting-canonical-row result as a write failure, not a silent success", async () => {
      let insertAttempted = false;
      const databaseService = {
        isEnabled: () => true,
        query: vi.fn(async (text: string) => {
          if (text.includes("ops.phase1_forwarded_orders") && text.includes("INSERT")) {
            insertAttempted = true;
            // Simulates a real Postgres conditional UPSERT whose WHERE guard
            // rejected the update because an equal-or-newer canonical row
            // already exists: the query resolves successfully but with
            // rowCount 0, not an error.
            return { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as unknown as DatabaseService;

      const repository = new ForwarderRepository(databaseService);

      await expect(
        repository.persistChanges({
          forwardedOrders: [
            {
              mirrorOrderId: "FWD-f4-001",
              platformCode: GRAB_TAIWAN_PLATFORM_CODE,
              externalOrderId: "grab-order-f4-001",
              orderDomain: "forwarded",
              dispatchSemantics: "forwarder_broadcast",
              status: "accept_pending",
              candidateDriverIds: [],
              acceptedDriverId: "driver-f4-001",
              lastNativeStatus: null,
              payload: {},
              authoritativeSnapshot: {},
              financeContext: {
                billingMode: "shadow_only",
                shadowOnly: true,
              } as never,
              lastSyncError: null,
              manualFallback: {
                required: false,
                reason: null,
                requestedAt: null,
                requestedBy: null,
                notes: null,
              },
              reconciliationJob: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            } as never,
          ],
        }),
      ).rejects.toThrow(/did not apply/);

      expect(insertAttempted).toBe(true);
    });

    it("surfaces the honest failure through the real service/controller instead of publishing a success audit for the unapplied draft", async () => {
      let allowUpdate = false;
      const databaseService = {
        isEnabled: () => true,
        query: vi.fn(async (text: string) => {
          if (
            text.includes("ops.phase1_forwarded_orders") &&
            text.includes("INSERT")
          ) {
            return { rows: [], rowCount: allowUpdate ? 1 : 0 };
          }
          if (text.includes("ops.phase1_adapter_health")) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      } as unknown as DatabaseService;

      const repository = new ForwarderRepository(databaseService);
      const { service, auditNotificationService } = createHarness({
        repository,
        eligibleDriverIds: ["driver-f4-002"],
      });

      allowUpdate = true;
      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-f4-conflict-001",
        payload: { serviceBucket: "standard_taxi" },
      });

      allowUpdate = false;
      auditNotificationService.recordAuditLog.mockClear();

      await expect(
        service.broadcastOrder(order.mirrorOrderId, {
          candidateDriverIds: ["driver-f4-002"],
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // No success audit for the broadcast that never actually applied.
      expect(
        auditNotificationService.recordAuditLog,
      ).not.toHaveBeenCalledWith(
        expect.objectContaining({ actionName: "broadcast_forwarded_order" }),
      );
      const cached = service.getOrder(order.mirrorOrderId);
      expect(cached.lastSyncError?.code).toBe(
        "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
      );
    });

    it("never overwrites a newer canonical row (a legitimate native correction) that already won the conditional UPSERT race, confirmed via durable storage and a restart", async () => {
      const table = new Map<string, { updatedAt: string; record: unknown }>();
      const databaseService = {
        isEnabled: () => true,
        query: vi.fn(
          async (
            text: string,
            values?: readonly unknown[],
          ): Promise<{ rows: unknown[]; rowCount: number }> => {
            if (
              text.includes("ops.phase1_forwarded_orders") &&
              text.includes("INSERT")
            ) {
              const params = values as unknown[];
              const [mirrorOrderId, , , , , updatedAt, recordJson] = params;
              const existing = table.get(mirrorOrderId as string);
              if (existing && (updatedAt as string) < existing.updatedAt) {
                // Same conditional guard as the real repository SQL: an
                // older write than the row currently in place is a no-op,
                // not an ACK of the attempted (stale) draft.
                return { rows: [], rowCount: 0 };
              }
              table.set(mirrorOrderId as string, {
                updatedAt: updatedAt as string,
                record: JSON.parse(recordJson as string),
              });
              return { rows: [], rowCount: 1 };
            }
            if (text.includes("ops.phase1_forwarded_orders")) {
              const rows = [...table.values()].map((row) => ({
                record: row.record,
              }));
              return { rows, rowCount: rows.length };
            }
            return { rows: [], rowCount: 0 };
          },
        ),
      } as unknown as DatabaseService;

      const repository = new ForwarderRepository(databaseService);
      const { service } = createHarness({
        repository,
        eligibleDriverIds: ["driver-f4-003"],
      });

      const order = await service.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-order-f4-restart-001",
        payload: { serviceBucket: "standard_taxi" },
      });

      // Simulates a legitimate native correction that already landed with a
      // later updatedAt than the stale broadcast attempt below will use
      // (e.g. a concurrent process/pod applying a canonical write this
      // in-memory instance never saw).
      const existing = table.get(order.mirrorOrderId)!;
      const newerUpdatedAt = new Date(
        Date.parse(order.updatedAt) + 60_000,
      ).toISOString();
      table.set(order.mirrorOrderId, {
        updatedAt: newerUpdatedAt,
        record: {
          ...(existing.record as Record<string, unknown>),
          status: "cancelled_by_platform",
        },
      });

      await expect(
        service.broadcastOrder(order.mirrorOrderId, {
          candidateDriverIds: ["driver-f4-003"],
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN" } },
      });

      // The newer canonical row (the native correction) is untouched by the
      // stale broadcast attempt's lost conditional UPSERT.
      const durable = table.get(order.mirrorOrderId)?.record as
        | { status: string }
        | undefined;
      expect(durable?.status).toBe("cancelled_by_platform");

      const restartedRepository = new ForwarderRepository(databaseService);
      const restartedService = new ForwarderService(
        { getEligibleCandidates: vi.fn(() => []) } as never,
        { recordAuditLog: vi.fn() } as never,
        [createAdapter()],
        restartedRepository,
      );
      await restartedService.onModuleInit();
      expect(restartedService.getOrder(order.mirrorOrderId).status).toBe(
        "cancelled_by_platform",
      );
    });
  });
});
