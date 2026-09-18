import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryController } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { MemoryMailOutbox } from "../../../unit/system-remediation/sr-credential-expiry-20260913/test-helpers";

describe("SR-CREDENTIAL-EXPIRY-20260913: RegulatoryRegistry Controller & Lifecycle Integration", () => {
  const createController = () => {
    const opsEvents = new OpsDispatchEventsService(new EventEmitter() as any);
    const auditNotification = new AuditNotificationService();
    const driverProfile = new DriverProfileService(auditNotification);
    const repository = new RegulatoryRegistryRepository();
    const outbox = new MemoryMailOutbox();
    const notificationDelivery = new NotificationDeliveryService(outbox);

    const service = new RegulatoryRegistryService(
      opsEvents,
      auditNotification,
      driverProfile,
      repository,
      notificationDelivery,
    );

    const controller = new RegulatoryRegistryController(service);

    return { controller, service, repository, outbox };
  };

  it("executes full lifecycle: reconcile endpoint -> backlog -> receipts -> event detail -> renewal", async () => {
    const { controller, service } = createController();

    // 1. Seed expired driver license
    service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: "2026-04-01T00:00:00.000Z",
    });

    // 2. Call reconcile-expiry endpoint
    const reconcileResponse = await controller.reconcileExpiry({
      asOf: "2026-05-01T00:00:00.000Z",
      scope: "default",
      limit: 50,
    });

    expect(reconcileResponse.data).toBeDefined();
    expect(reconcileResponse.data.scannedDrivers).toBeGreaterThanOrEqual(1);
    expect(reconcileResponse.data.expiredEventsCreated).toBeGreaterThanOrEqual(1);
    expect(reconcileResponse.data.deliveryIntentsEnqueued).toBeGreaterThanOrEqual(1);

    // 3. Query backlog endpoint
    const backlogResponse = await controller.getExpiryBacklog("default", "driver");
    expect(backlogResponse.data).toBeDefined();
    const events = backlogResponse.data;
    expect(events.length).toBeGreaterThanOrEqual(1);

    const targetEvent = events.find((e: any) => e.entity_id === "drv-demo-001");
    expect(targetEvent).toBeDefined();
    if (!targetEvent) throw new Error("targetEvent expected to be defined");
    expect(targetEvent.credential_type).toBe("driver_license");

    // 4. Query receipts endpoint
    const receiptsResponse = await controller.getExpiryReceipts();
    expect(receiptsResponse.data).toBeDefined();
    const receipts = receiptsResponse.data;
    expect(receipts.length).toBeGreaterThanOrEqual(1);

    // 5. Query event by ID endpoint
    const eventDetailResponse = await controller.getExpiryEvent(targetEvent.event_id);
    expect(eventDetailResponse.data).toBeDefined();
    expect(eventDetailResponse.data.event_id).toBe(targetEvent.event_id);
    expect(eventDetailResponse.data.intent).toBeDefined();

    // 6. Renewal superseding
    service.updateDriverLicenses("drv-demo-001", {
      licenseExpiry: "2028-01-01T00:00:00.000Z",
    });

    const refreshedEvent = await controller.getExpiryEvent(targetEvent.event_id);
    expect(refreshedEvent.data.status).toBe("superseded");
    expect(refreshedEvent.data.superseded_at).toBeDefined();

    // 7. Clean shutdown via onModuleDestroy
    await service.onModuleDestroy();
  });

  it("returns 404 when querying an unknown event ID", async () => {
    const { controller } = createController();

    await expect(
      controller.getExpiryEvent("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(ApiRequestError);
  });
});
