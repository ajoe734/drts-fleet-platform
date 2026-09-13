import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { MemoryMailOutbox } from "./test-helpers";

describe("SR-CREDENTIAL-EXPIRY-20260913: Credential Expiry Reconciliation & Renewal Superseding", () => {
  const createService = (options?: {
    withOutbox?: boolean;
    mockAcademyService?: any;
  }) => {
    const opsEvents = new OpsDispatchEventsService(new EventEmitter() as any);
    const auditNotification = new AuditNotificationService();
    const driverProfile = new DriverProfileService(auditNotification);
    const repository = new RegulatoryRegistryRepository();

    const outbox = options?.withOutbox ? new MemoryMailOutbox() : null;
    const notificationDelivery = outbox
      ? new NotificationDeliveryService(outbox)
      : undefined;

    const service = new RegulatoryRegistryService(
      opsEvents,
      auditNotification,
      driverProfile,
      repository,
      notificationDelivery,
      options?.mockAcademyService,
    );

    return { service, repository, outbox };
  };

  describe("Driver Credential Expiry Scanning & Event Invariants", () => {
    it("scans expired driver licenses (<= asOf) and creates expiry events with delivery intents", async () => {
      const { service } = createService();

      // Seed driver with expired license
      service.updateDriverLicenses("drv-demo-001", {
        licenseExpiry: "2026-05-01T00:00:00.000Z",
      });

      const asOf = "2026-05-15T00:00:00.000Z";
      const result = await service.reconcileExpiredCredentials({
        asOf,
        scope: "default",
      });

      expect(result.scannedDrivers).toBeGreaterThanOrEqual(1);
      expect(result.expiredEventsCreated).toBeGreaterThanOrEqual(1);
      expect(result.deliveryIntentsCreated).toBeGreaterThanOrEqual(1);

      // Verify the event was persisted in backlog
      const backlog = await service.getExpiryBacklog({ entityType: "driver" });
      const driverEvent = backlog.find(
        (e) => e.entity_id === "drv-demo-001" && e.credential_type === "driver_license",
      );
      expect(driverEvent).toBeDefined();
      expect(driverEvent!.status).toBe("pending");
      expect(driverEvent!.source_expiry_at).toBe("2026-05-01T00:00:00.000Z");

      // Verify delivery intent was created
      expect(driverEvent!.intent).toBeDefined();
      expect(driverEvent!.intent!.delivery_status).toBe("pending");
      expect(driverEvent!.intent!.idempotency_key).toContain("drv-demo-001");
      expect(driverEvent!.intent!.subject).toContain("driver_license");
    });

    it("does not flag future credentials (> asOf) as expired", async () => {
      const { service } = createService();

      service.updateDriverLicenses("drv-demo-002", {
        licenseExpiry: "2027-01-01T00:00:00.000Z",
        professionalDriverLicenseExpiry: "2027-01-01T00:00:00.000Z",
        taxiDriverRegistrationExpiry: "2027-01-01T00:00:00.000Z",
      });

      const asOf = "2026-06-01T00:00:00.000Z";
      await service.reconcileExpiredCredentials({ asOf });

      const backlog = await service.getExpiryBacklog({
        entityType: "driver",
      });
      const drv2Events = backlog.filter((e) => e.entity_id === "drv-demo-002");
      expect(drv2Events).toHaveLength(0);
    });

    it("does not permanently overwrite licensesValid on the driver record", async () => {
      const { service } = createService();

      const initialDriver = service.updateDriverLicenses("drv-demo-001", {
        licenseExpiry: "2028-01-01T00:00:00.000Z",
        licensesValid: true,
      });
      expect(initialDriver.licensesValid).toBe(true);

      await service.reconcileExpiredCredentials({
        asOf: "2026-06-01T00:00:00.000Z",
      });

      // Original driver record's stored licensesValid remains untouched
      const drivers = service.listDrivers();
      const current = drivers.find((d) => d.driverId === "drv-demo-001");
      expect(current!.licensesValid).toBe(true);
    });
  });

  describe("Insurance Policy Expiry Scanning (endAt < asOf)", () => {
    it("scans expired policies and creates policy expiry events", async () => {
      const { service } = createService();

      // Create an expired policy
      const policy = service.createInsurancePolicy({
        vehicleId: "veh-demo-001",
        policyNo: "POL-EXP-001",
        insuranceType: "commercial_liability",
        insurerName: "SafeGuard Insurance",
        coverageAmount: 1000000,
        startAt: "2025-01-01T00:00:00.000Z",
        endAt: "2026-01-01T00:00:00.000Z",
      });

      const asOf = "2026-06-01T00:00:00.000Z";
      const result = await service.reconcileExpiredCredentials({ asOf });

      expect(result.scannedPolicies).toBeGreaterThanOrEqual(1);

      const backlog = await service.getExpiryBacklog({ entityType: "policy" });
      const policyEvent = backlog.find((e) => e.entity_id === policy.policyId);
      expect(policyEvent).toBeDefined();
      expect(policyEvent!.credential_type).toBe("insurance_policy");
      expect(policyEvent!.source_expiry_at).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("Academy Driver Qualification Expiry Evaluation (§B2 / WIRE)", () => {
    it("evaluates driver academy qualification via AcademyService and records event", async () => {
      const mockAcademyService = {
        evaluateDriverQualification: async (driverId: string) => ({
          driverId,
          asOf: new Date().toISOString(),
          records: [
            {
              recordId: "rec-1",
              driverId,
              courseId: "course-mandatory-1",
              courseCode: "MAND-01",
              courseTitle: "Safety",
              status: "expired",
              highestScore: 80,
              passed: false,
              attemptsCount: 1,
              completedAt: "2025-01-01T00:00:00.000Z",
              expiresAt: "2026-01-01T00:00:00.000Z",
              isOverdue: true,
              lastAttemptAt: "2025-01-01T00:00:00.000Z",
            },
          ],
          requiredCount: 1,
          trainingSatisfied: false,
          trainingIncomplete: true,
          regulatoryStatus: "expired" as const,
        }),
      };

      const { service } = createService({ mockAcademyService });

      // Seed driver
      service.updateDriverLicenses("drv-demo-004", {
        licenseExpiry: "2027-01-01T00:00:00.000Z", // License valid
      });

      const asOf = "2026-06-01T00:00:00.000Z";
      await service.reconcileExpiredCredentials({ asOf });

      const backlog = await service.getExpiryBacklog({ entityType: "driver" });
      const academyEvent = backlog.find(
        (e) => e.entity_id === "drv-demo-004" && e.credential_type === "academy_qualification",
      );
      expect(academyEvent).toBeDefined();
      expect(academyEvent!.source_expiry_at).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("Renewal & Superseded Invariant (§B4)", () => {
    it("marks older active event superseded upon driver credential renewal", async () => {
      const { service } = createService();

      // Expired license
      service.updateDriverLicenses("drv-demo-001", {
        licenseExpiry: "2026-01-01T00:00:00.000Z",
      });

      await service.reconcileExpiredCredentials({ asOf: "2026-06-01T00:00:00.000Z" });

      const beforeRenewal = await service.getExpiryBacklog({ entityType: "driver" });
      const initialEvent = beforeRenewal.find(
        (e) => e.entity_id === "drv-demo-001" && e.status === "pending",
      );
      expect(initialEvent).toBeDefined();

      // Driver renews license!
      service.updateDriverLicenses("drv-demo-001", {
        licenseExpiry: "2028-01-01T00:00:00.000Z",
      });

      // Older event should now be marked superseded
      const eventAfter = await service.getExpiryEvent(initialEvent!.event_id);
      expect(eventAfter).toBeDefined();
      expect(eventAfter!.status).toBe("superseded");
      expect(eventAfter!.superseded_at).toBeDefined();

      // Pending intent is also superseded
      expect(eventAfter!.intent?.delivery_status).toBe("superseded");
    });

    it("marks older active policy event superseded upon policy activation", async () => {
      const { repository } = createService();

      // Insert an expired policy event
      const event = await repository.insertExpiryEvent({
        scope: "default",
        entityType: "policy",
        entityId: "pol-test-1",
        credentialType: "insurance_policy",
        sourceFingerprint: "dummy-policy-fingerprint",
        sourceExpiryAt: "2026-01-01T00:00:00.000Z",
        status: "pending",
      });

      expect(event.status).toBe("pending");

      // Activate policy
      await repository.supersedeActiveExpiryEventsForEntity("policy", "pol-test-1", "insurance_policy");

      const refreshed = await repository.getExpiryEventById(event.event_id);
      expect(refreshed!.status).toBe("superseded");
    });
  });

  describe("Durable Delivery Intent & Outbox Hand-off (§B5)", () => {
    it("enqueues delivery intent to NotificationDeliveryService and marks intent enqueued & event completed", async () => {
      const { service, outbox } = createService({ withOutbox: true });

      service.updateDriverLicenses("drv-demo-001", {
        licenseExpiry: "2026-01-01T00:00:00.000Z",
      });

      const result = await service.reconcileExpiredCredentials({
        asOf: "2026-06-01T00:00:00.000Z",
      });

      expect(result.deliveryIntentsEnqueued).toBeGreaterThanOrEqual(1);

      // Verify intent is enqueued with outbox_delivery_id
      const receipts = await service.getExpiryReceipts();
      expect(receipts.length).toBeGreaterThanOrEqual(1);
      expect(receipts.every((r) => r.delivery_status === "enqueued")).toBe(true);
      expect(receipts[0]!.outbox_delivery_id).toBeDefined();

      // Verify event is marked completed
      const event = await service.getExpiryEvent(receipts[0]!.event_id);
      expect(event!.status).toBe("completed");

      // Verify outbox received the message
      const queuedDeliveries = Object.values(outbox!.state.deliveries);
      expect(queuedDeliveries.length).toBeGreaterThanOrEqual(1);
      expect(queuedDeliveries[0]!.message.idempotencyKey).toBe(receipts[0]!.idempotency_key);
    });

    it("leaves intent pending and event pending when no delivery service is configured", async () => {
      const { service } = createService({ withOutbox: false });

      service.updateDriverLicenses("drv-demo-001", {
        licenseExpiry: "2026-01-01T00:00:00.000Z",
      });

      const result = await service.reconcileExpiredCredentials({
        asOf: "2026-06-01T00:00:00.000Z",
      });

      expect(result.deliveryIntentsEnqueued).toBe(0);

      const receipts = await service.getExpiryReceipts();
      expect(receipts.length).toBeGreaterThanOrEqual(1);
      expect(receipts.every((r) => r.delivery_status === "pending")).toBe(true);

      const event = await service.getExpiryEvent(receipts[0]!.event_id);
      expect(event!.status).toBe("pending");
    });
  });
});
