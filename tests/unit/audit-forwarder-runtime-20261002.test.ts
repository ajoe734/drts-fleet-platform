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
    expect(accept.detail).toContain("MISSING_PROVIDER_CONTRACT");

    const complete = await adapter.complete({ externalOrderId: "grab-test-1" });
    expect(complete.acknowledged).toBe(false);
    expect(complete.detail).toContain("MISSING_PROVIDER_CONTRACT");

    const reject = await adapter.reject({ externalOrderId: "grab-test-1", reason: "test" });
    expect(reject.acknowledged).toBe(false);
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
});
