import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { ForwarderRepository } from "../../apps/api/src/modules/forwarder/forwarder.repository";
import { ForwarderService } from "../../apps/api/src/modules/forwarder/forwarder.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function createServices() {
  const auditService = new AuditNotificationService();
  const regulatoryRegistryService = new RegulatoryRegistryService();
  const callcenterService = new CallcenterService(auditService);
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
  );
  const forwarderService = new ForwarderService(
    regulatoryRegistryService,
    auditService,
  );

  return {
    auditService,
    ownedMobilityService,
    forwarderService,
  };
}

describe("forwarder service", () => {
  it("covers SC-015 with local accept, confirmed_by_platform, and no owned assignment creation", () => {
    const { auditService, ownedMobilityService, forwarderService } =
      createServices();

    const inbound = forwarderService.ingestExternalOrder(
      {
        platformCode: "uber",
        externalOrderId: "UBER-ORDER-0001",
        payload: {
          serviceBucket: "standard_taxi",
          pickupAddress: "台中市梧棲區中二路一段9號",
        },
      },
      "forwarder-inbound-001",
    );

    const broadcast = forwarderService.broadcastOrder(
      inbound.mirrorOrderId,
      {
        candidateDriverIds: ["drv-demo-001"],
      },
      "forwarder-broadcast-001",
    );
    const accepted = forwarderService.relayDriverAccept(
      inbound.mirrorOrderId,
      {
        driverId: "drv-demo-001",
      },
      "forwarder-accept-001",
    );
    const synced = forwarderService.syncNativeStatus(
      inbound.mirrorOrderId,
      {
        nativeStatus: "confirmed_by_platform",
        payload: {
          confirmationCode: "CONF-001",
        },
      },
      "forwarder-sync-001",
    );

    expect(broadcast.status).toBe("broadcasted");
    expect(accepted.status).toBe("accept_pending");
    expect(synced.status).toBe("confirmed_by_platform");
    expect(
      forwarderService.listOrders()[0]?.authoritativeSnapshot.confirmationCode,
    ).toBe("CONF-001");
    expect(forwarderService.listOrders()[0]?.lastNativeStatus).toBe(
      "confirmed_by_platform",
    );
    expect(ownedMobilityService.listDispatchJobs()).toHaveLength(0);
    expect(ownedMobilityService.listDriverTasks()).toHaveLength(0);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "sync_forwarded_order_status",
    );
  });

  it("covers SC-016 lost_race after a local accept while preserving authoritative snapshot", () => {
    const { forwarderService, ownedMobilityService } = createServices();

    const inbound = forwarderService.ingestExternalOrder({
      platformCode: "uber",
      externalOrderId: "UBER-ORDER-0002",
      payload: {
        serviceBucket: "standard_taxi",
      },
    });

    forwarderService.broadcastOrder(inbound.mirrorOrderId, {
      candidateDriverIds: ["drv-demo-001"],
    });
    forwarderService.relayDriverAccept(inbound.mirrorOrderId, {
      driverId: "drv-demo-001",
    });
    const synced = forwarderService.syncNativeStatus(inbound.mirrorOrderId, {
      nativeStatus: "lost_race",
      payload: {
        externalWinner: "other-fleet",
      },
    });

    expect(synced.status).toBe("lost_race");
    expect(synced.authoritativeSnapshot.externalWinner).toBe("other-fleet");
    expect(forwarderService.listOrders()[0]?.acceptedDriverId).toBe(
      "drv-demo-001",
    );
    expect(ownedMobilityService.listOrders()).toHaveLength(0);
  });

  it("covers SC-017 cancelled_by_platform after mirror creation and keeps adapter health visible", () => {
    const { forwarderService } = createServices();

    const inbound = forwarderService.ingestExternalOrder({
      platformCode: "line-taxi",
      externalOrderId: "LT-ORDER-0003",
      payload: {
        serviceBucket: "business_dispatch",
      },
    });

    const synced = forwarderService.syncNativeStatus(inbound.mirrorOrderId, {
      nativeStatus: "cancelled_by_platform",
      payload: {
        cancelReason: "external_customer_cancelled",
      },
    });

    expect(synced.status).toBe("cancelled_by_platform");
    expect(
      forwarderService.listOrders()[0]?.authoritativeSnapshot.cancelReason,
    ).toBe("external_customer_cancelled");
    expect(forwarderService.listAdapterHealth()).toEqual([
      expect.objectContaining({
        platformCode: "line-taxi",
        status: "healthy",
        lastError: null,
      }),
    ]);
  });

  it("rehydrates persisted forwarder state and writes sync updates through the repository", async () => {
    const auditService = new AuditNotificationService();
    const regulatoryRegistryService = new RegulatoryRegistryService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        forwardedOrders: [
          {
            mirrorOrderId: "FWD-persisted-001",
            platformCode: "uber",
            externalOrderId: "UBER-PERSISTED-001",
            status: "broadcasted",
            candidateDriverIds: ["drv-demo-001"],
            acceptedDriverId: null,
            lastNativeStatus: null,
            payload: {
              serviceBucket: "standard_taxi",
            },
            authoritativeSnapshot: {
              platformCode: "uber",
              externalOrderId: "UBER-PERSISTED-001",
              nativeStatus: "received",
              serviceBucket: "standard_taxi",
            },
            createdAt: "2026-04-10T00:00:00Z",
            updatedAt: "2026-04-10T00:00:00Z",
          },
        ],
        adapterHealth: [
          {
            platformCode: "uber",
            status: "healthy",
            lastCheckedAt: "2026-04-10T00:00:00Z",
            lastError: null,
          },
        ],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as ForwarderRepository;
    const forwarderService = new ForwarderService(
      regulatoryRegistryService,
      auditService,
      repository,
    );

    await forwarderService.onModuleInit();

    expect(forwarderService.listOrders()[0]?.mirrorOrderId).toBe(
      "FWD-persisted-001",
    );

    forwarderService.syncNativeStatus("FWD-persisted-001", {
      nativeStatus: "confirmed_by_platform",
      payload: {
        confirmationCode: "CONF-PERSISTED-001",
      },
    });

    await Promise.resolve();

    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        forwardedOrders: [
          expect.objectContaining({
            mirrorOrderId: "FWD-persisted-001",
            status: "confirmed_by_platform",
          }),
        ],
        adapterHealth: [
          expect.objectContaining({
            platformCode: "uber",
            status: "healthy",
          }),
        ],
      }),
    );
  });
});
