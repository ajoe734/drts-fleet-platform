import { describe, expect, it, vi } from "vitest";

import { ForwarderService } from "../../src/modules/forwarder/forwarder.service";
import {
  GRAB_TAIWAN_PLATFORM_CODE,
} from "../../src/modules/forwarder/grab-taiwan.adapter";
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

function createService(options?: {
  adapter?: ForwarderAdapterInterface;
  eligibleDriverIds?: string[];
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

  const service = new ForwarderService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    [adapter],
    undefined,
  );

  return {
    service,
    adapter,
    auditNotificationService,
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
});
