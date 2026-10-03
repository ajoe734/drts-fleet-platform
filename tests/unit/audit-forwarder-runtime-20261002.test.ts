import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { ForwarderService } from "../../apps/api/src/modules/forwarder/forwarder.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { GrabTaiwanAdapter } from "../../apps/api/src/modules/forwarder/grab-taiwan.adapter";
import { PLATFORM_CODE_GRAB_TAIWAN } from "../../packages/contracts/src/platform-codes";

describe("audit-forwarder-runtime-20261002: Grab Taiwan unapproved adapter regressions", () => {
  it("F4/no_fake_provider_ack: adapter rejects operations explicitly", async () => {
    const adapter = new GrabTaiwanAdapter();

    const accept = await adapter.accept({ externalOrderId: "grab-test-1", driverId: "drv-1" });
    expect(accept.acknowledged).toBe(false);
    expect(accept.platformCode).toBe(PLATFORM_CODE_GRAB_TAIWAN);
    expect(accept.externalOrderId).toBe("grab-test-1");
    expect(accept.detail).toContain("MISSING_PROVIDER_CONTRACT");

    const complete = await adapter.complete({ externalOrderId: "grab-test-1" });
    expect(complete.acknowledged).toBe(false);
    expect(complete.platformCode).toBe(PLATFORM_CODE_GRAB_TAIWAN);
    expect(complete.externalOrderId).toBe("grab-test-1");
    expect(complete.detail).toContain("MISSING_PROVIDER_CONTRACT");

    const reject = await adapter.reject({ externalOrderId: "grab-test-1", reason: "test" });
    expect(reject.acknowledged).toBe(false);
    expect(reject.platformCode).toBe(PLATFORM_CODE_GRAB_TAIWAN);
    expect(reject.externalOrderId).toBe("grab-test-1");
    expect(reject.detail).toContain("MISSING_PROVIDER_CONTRACT");
    
    const hb = await adapter.heartbeat();
    expect(hb.acknowledged).toBe(false);
    
    await expect(adapter.fetchEarnings()).rejects.toThrow("MISSING_PROVIDER_CONTRACT");
    
    const hook = await adapter.verifyWebhook();
    expect(hook.accepted).toBe(false);
    expect(hook.credentialStatus).toBe("not_configured");
    expect(hook.webhookStatus).toBe("not_configured");
  });

  it("F3: rehydrates correctly without overriding credential issue with healthy", async () => {
    const auditService = new AuditNotificationService();
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      auditService,
      new DriverProfileService(auditService),
    );
    const adapter = new GrabTaiwanAdapter();

    const mockRepo = {
      loadState: vi.fn().mockResolvedValue({
        forwardedOrders: [],
        adapterHealth: [
          {
            platformCode: PLATFORM_CODE_GRAB_TAIWAN,
            status: "healthy",
            reason: "stub",
            lastCheckedAt: "2026-01-01T00:00:00Z",
            lastError: null,
          }
        ],
      }),
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as any;

    const service = new ForwarderService(
      regulatoryRegistryService,
      auditService,
      [adapter],
      mockRepo,
    );
    await service.onModuleInit();

    const snapshot = service.listAdapterHealth().find((r) => r.platformCode === PLATFORM_CODE_GRAB_TAIWAN);
    expect(snapshot?.status).toBe("degraded");
    expect(snapshot?.reason).toBe("credential");
    
    // Attempting to ingest should preserve degraded state
    const order = service.ingestExternalOrder({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      externalOrderId: "review-no-network",
    });
    
    const postIngest = service.listAdapterHealth().find((r) => r.platformCode === PLATFORM_CODE_GRAB_TAIWAN);
    expect(postIngest?.status).toBe("degraded");
    expect(postIngest?.reason).toBe("credential");
    
    // Same external id creates same mirror id
    const secondOrder = service.ingestExternalOrder({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      externalOrderId: "review-no-network",
    });
    expect(secondOrder.mirrorOrderId).toBe(order.mirrorOrderId);
  });

  it("F7: runtime adapter capability is authoritative over old persisted stub record", async () => {
    const auditService = new AuditNotificationService();
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      auditService,
      new DriverProfileService(auditService),
    );
    const adapter = new GrabTaiwanAdapter();

    const mockRepo = {
      loadState: vi.fn().mockResolvedValue({
        forwardedOrders: [],
        adapterHealth: [
          {
            platformCode: PLATFORM_CODE_GRAB_TAIWAN,
            status: "healthy",
            reason: "stub",
            credentialStatus: "stub",
            authStatus: "stub",
            webhookStatus: "stub",
            rateLimitStatus: "stub",
            capabilitySummary: {
              mode: "stub",
              productionStatus: "stub",
              notes: "Obsolete stub",
              supportsInboundWebhook: false,
            },
            lastCheckedAt: "2026-01-01T00:00:00Z",
            lastError: null,
          }
        ],
      }),
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as any;

    const service = new ForwarderService(
      regulatoryRegistryService,
      auditService,
      [adapter],
      mockRepo,
    );
    await service.onModuleInit();

    const snapshot = service.listAdapterHealth().find((r) => r.platformCode === PLATFORM_CODE_GRAB_TAIWAN);
    expect(snapshot?.status).toBe("degraded");
    expect(snapshot?.capabilitySummary.productionStatus).toBe("configuration_required");
    
    // Ensure the capability was persisted with the configured one
    expect(mockRepo.persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterHealth: expect.arrayContaining([
          expect.objectContaining({
            platformCode: PLATFORM_CODE_GRAB_TAIWAN,
            capabilitySummary: expect.objectContaining({
              productionStatus: "configuration_required",
            }),
          }),
        ]),
      })
    );
  });
  
  it("F4/fail-closed driver outcomes: relay driver accept rejects due to sync_failed", async () => {
    const auditService = new AuditNotificationService();
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      auditService,
      new DriverProfileService(auditService),
    );
    const adapter = new GrabTaiwanAdapter();

    const mockRepo = {
      loadState: vi.fn().mockResolvedValue({
        forwardedOrders: [],
        adapterHealth: [],
      }),
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as any;

    const service = new ForwarderService(
      regulatoryRegistryService,
      auditService,
      [adapter],
      mockRepo,
    );
    await service.onModuleInit();
    
    service.ingestExternalOrder({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      externalOrderId: "test-driver-accept",
    });
    
    const order = service.listOrders()[0]!;
    service.broadcastOrder(order.mirrorOrderId, { candidateDriverIds: ["drv-demo-001"] });
    
    // Relay to provider - will throw because it fails
    await expect(service.relayDriverAccept(order.mirrorOrderId, { driverId: "drv-demo-001" })).rejects.toThrow();
    
    const updatedOrder = service.listOrders()[0]!;
    // Since accept returns acknowledged: false, status should be sync_failed
    expect(updatedOrder.status).toBe("sync_failed");
  });

  it("F3/F4: rejected webhook creates zero orders and preserves credential failure on next ingest", async () => {
    const auditService = new AuditNotificationService();
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      auditService,
      new DriverProfileService(auditService),
    );
    const mockRepo = {
      loadState: vi.fn().mockResolvedValue({ forwardedOrders: [], adapterHealth: [] }),
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as any;

    const service = new ForwarderService(
      regulatoryRegistryService,
      auditService,
      [new GrabTaiwanAdapter()],
      mockRepo,
    );
    await service.onModuleInit();

    for (let i = 0; i < 2; i++) {
      let threw = false;
      try {
        await service.ingestGrabTaiwanWebhook(
          { orderId: "replayed-unapproved" },
          { "x-grab-signature": "unapproved" }
        );
      } catch (e: any) {
        threw = true;
        expect(e.status).toBe(401);
        expect(e.code).toBe("FORWARDER_WEBHOOK_VERIFICATION_FAILED");
      }
      expect(threw).toBe(true);
    }

    expect(service.listOrders().length).toBe(0);

    await service.ingestExternalOrder({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      externalOrderId: "local-inbound-after-hook"
    });

    const health = service.listAdapterHealth().find(a => a.platformCode === PLATFORM_CODE_GRAB_TAIWAN);
    expect(health?.status).toBe("degraded");
    expect(health?.credentialStatus).toBe("not_configured");
  });

  it("F3/F4: relay driver accept failure preserves credential failure on next ingest", async () => {
    const auditService = new AuditNotificationService();
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      auditService,
      new DriverProfileService(auditService),
    );
    // Explicitly add eligible candidates
    regulatoryRegistryService.getEligibleCandidates = vi.fn().mockReturnValue([{ driverId: "review-driver" }]);
    const mockRepo = {
      loadState: vi.fn().mockResolvedValue({ forwardedOrders: [], adapterHealth: [] }),
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as any;

    const service = new ForwarderService(
      regulatoryRegistryService,
      auditService,
      [new GrabTaiwanAdapter()],
      mockRepo,
    );
    await service.onModuleInit();

    const order = await service.ingestExternalOrder({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      externalOrderId: "local-inbound-before-relay"
    });
    
    await service.broadcastOrder(order.mirrorOrderId, { candidateDriverIds: ["review-driver"] });
    
    await expect(
      service.relayDriverAccept(order.mirrorOrderId, { driverId: "review-driver" })
    ).rejects.toThrow();
    
    const updatedOrder = service.listOrders().find(o => o.mirrorOrderId === order.mirrorOrderId);
    expect(updatedOrder?.status).toBe("sync_failed");

    await service.ingestExternalOrder({
      platformCode: PLATFORM_CODE_GRAB_TAIWAN,
      externalOrderId: "local-inbound-after-relay"
    });

    const health = service.listAdapterHealth().find(a => a.platformCode === PLATFORM_CODE_GRAB_TAIWAN);
    expect(health?.status).toBe("degraded");
    expect(health?.credentialStatus).toBe("not_configured");
  });
});
