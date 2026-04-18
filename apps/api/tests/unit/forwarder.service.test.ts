import { describe, expect, it, vi } from "vitest";

import { ForwarderService } from "../../src/modules/forwarder/forwarder.service";
import {
  GRAB_TAIWAN_PLATFORM_CODE,
  GrabTaiwanAdapter,
} from "../../src/modules/forwarder/grab-taiwan.adapter";

function createService() {
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
    undefined,
  );

  return {
    service,
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
});
