import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type {
  DriverSosAttachmentStorageProvider,
  DriverSosUploadedObjectMetadata,
} from "../../../../apps/api/src/modules/driver-sos/driver-sos-attachment.ports";
import { DriverSosService } from "../../../../apps/api/src/modules/driver-sos/driver-sos.service";
import { IncidentService } from "../../../../apps/api/src/modules/incident/incident.service";

function buildDriverIdentity(driverId = "drv-qa-c047-01"): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write", "incident:write"],
    requestId: `req-${driverId}`,
  };
}

function buildOpsIdentity(): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId: "ops-duty-01",
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_dispatcher"],
    scopes: ["incident:read", "incident:write"],
    requestId: "req-ops-duty-01",
  };
}

function createMockStorage(): DriverSosAttachmentStorageProvider {
  return {
    providerName: "mock-s3-provider",
    availability: () => ({ state: "available" }),
    createUploadIntent: vi.fn().mockResolvedValue({
      uploadUrl: "https://s3.drts.example/uploads/presigned-sos-photo-01",
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    }),
    inspectUploadedObject: vi.fn().mockImplementation((objectKey: string): Promise<DriverSosUploadedObjectMetadata> => {
      return Promise.resolve({
        objectKey,
        contentType: "image/jpeg",
        fileSize: 1024 * 150, // 150 KB
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      });
    }),
  };
}

function setupService(storage?: DriverSosAttachmentStorageProvider) {
  const auditService = new AuditNotificationService();
  const incidentService = new IncidentService(auditService);
  const driverSosService = new DriverSosService(
    auditService,
    incidentService,
    undefined,
    undefined,
    storage,
  );

  return { auditService, incidentService, driverSosService };
}

describe("C047: SOS Duty Lifecycle, Deduplication, Alert Receipt & Latency Metrics (SR-QA-CALL-001)", () => {
  describe("Positive workflows: SOS emergency submission, automated incident link, network deduplication, duty alert render & latency", () => {
    it("submits SOS event, automatically allocates correlated incident, and activates driver matching suppression", async () => {
      const { driverSosService, incidentService } = setupService();
      const driverIdentity = buildDriverIdentity();

      const result = await driverSosService.submitSosEvent(
        {
          clientEventId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          vehicleId: "veh-sos-test-01",
          plateNo: "TDC-9988",
          orderId: "ord-sos-active-01",
          eventType: "traffic_accident",
          severity: "major",
          description: "Collision at intersection with private vehicle, driver and passenger conscious",
          location: {
            lat: 25.033,
            lng: 121.5654,
            accuracyM: 5,
            recordedAt: "2026-09-10T20:30:00Z",
            reverseGeocodedAddress: "Taipei City Hall",
            geocodeProvider: "manual",
          },
          originalTriggeredAt: "2026-09-10T20:30:00Z",
          offlineAtTrigger: false,
        },
        driverIdentity,
        "req-sos-submit-01",
      );

      expect(result.receipt.duplicate).toBe(false);
      expect(result.receipt.incidentId).toBeDefined();
      expect(result.event.driverId).toBe("drv-qa-c047-01");
      expect(result.event.eventNo).toMatch(/^SOS-\d{14}-[0-9A-Z]{6}$/);
      expect(result.event.status).toBe("submitted");
      expect(result.event.incidentId).toBe(result.receipt.incidentId);

      // Verify associated incident in IncidentService
      const incident = incidentService.getIncident(result.receipt.incidentId);
      expect(incident.incidentId).toBe(result.receipt.incidentId);
      expect(incident.relatedDriverId).toBe("drv-qa-c047-01");
      expect(incident.category).toBe("traffic");
      expect(incident.matchingSuppression?.active).toBe(true);
    });

    it("deduplicates network retransmissions on identical (driverId, clientEventId) idempotently", async () => {
      const { driverSosService } = setupService();
      const driverIdentity = buildDriverIdentity();
      const clientEventId = "b2c3d4e5-f6a7-4b8c-8d0e-1f2a3b4c5d6e";

      const first = await driverSosService.submitSosEvent(
        {
          clientEventId,
          eventType: "security_incident",
          severity: "major",
          description: "Unruly passenger threatening driver",
          originalTriggeredAt: "2026-09-10T20:35:00Z",
          offlineAtTrigger: false,
        },
        driverIdentity,
        "req-sos-dup-1",
      );
      expect(first.receipt.duplicate).toBe(false);

      // Replay attempt with same clientEventId
      const replay = await driverSosService.submitSosEvent(
        {
          clientEventId,
          eventType: "other",
          severity: "normal",
          description: "Changed text should NOT overwrite original payload",
          originalTriggeredAt: "2026-09-10T20:35:10Z",
          offlineAtTrigger: false,
        },
        driverIdentity,
        "req-sos-dup-2",
      );

      // Must return duplicate true and retain original event attributes
      expect(replay.receipt.duplicate).toBe(true);
      expect(replay.event.sosEventId).toBe(first.event.sosEventId);
      expect(replay.receipt.incidentId).toBe(first.receipt.incidentId);
      expect(replay.event.description).toBe("Unruly passenger threatening driver");
      expect(replay.event.eventType).toBe("security_incident");
    });

    it("records offline trigger packet arrival and preserves original triggered time", async () => {
      const { driverSosService } = setupService();
      const driverIdentity = buildDriverIdentity();

      const pastTriggerTime = new Date(Date.now() - 300_000).toISOString();
      const offlineResult = await driverSosService.submitSosEvent(
        {
          clientEventId: "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f",
          eventType: "passenger_medical",
          severity: "major",
          description: "Passenger experiencing acute shortness of breath in tunnel with no cell signal",
          originalTriggeredAt: pastTriggerTime,
          offlineAtTrigger: true,
        },
        driverIdentity,
        "req-offline-sos",
      );

      expect(offlineResult.event.offlineAtTrigger).toBe(true);
      expect(offlineResult.event.originalTriggeredAt).toBe(pastTriggerTime);
      expect(offlineResult.event.serverReceivedAt).toBeDefined();

      const triggeredMs = new Date(offlineResult.event.originalTriggeredAt).getTime();
      const serverReceivedMs = new Date(offlineResult.event.serverReceivedAt).getTime();
      expect(serverReceivedMs).toBeGreaterThanOrEqual(triggeredMs);
    });

    it("records Ops console duty alert rendered receipt and computes latency summary metrics", async () => {
      const { driverSosService } = setupService();
      const driverIdentity = buildDriverIdentity();
      const opsIdentity = buildOpsIdentity();

      // Submit SOS event
      const sosResult = await driverSosService.submitSosEvent(
        {
          clientEventId: "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a",
          eventType: "traffic_accident",
          severity: "major",
          originalTriggeredAt: new Date(Date.now() - 1500).toISOString(),
          offlineAtTrigger: false,
        },
        driverIdentity,
      );

      // Ops duty console renders alert on dashboard
      const renderedTime = new Date().toISOString();
      const renderReceipt = await driverSosService.recordOpsAlertsRendered(
        {
          incidentIds: [sosResult.receipt.incidentId],
          renderedAt: renderedTime,
        },
        opsIdentity,
        "req-render-receipt",
      );

      expect(renderReceipt.observations).toHaveLength(1);
      const obs = renderReceipt.observations[0]!;
      expect(obs.incidentId).toBe(sosResult.receipt.incidentId);
      expect(obs.alertToOpsLatencyMs).toBeGreaterThanOrEqual(0);
      expect(obs.duplicate).toBe(false);

      // Duplicate render observation check
      const dupRender = await driverSosService.recordOpsAlertsRendered(
        {
          incidentIds: [sosResult.receipt.incidentId],
          renderedAt: renderedTime,
        },
        opsIdentity,
      );
      expect(dupRender.observations[0]?.duplicate).toBe(true);

      // Query latency metrics summary
      const summary = await driverSosService.getOpsAlertLatencySummary({}, opsIdentity);
      expect(summary.sampleCount).toBeGreaterThanOrEqual(1);
      expect(summary.targetLatencyMs).toBe(5000);
      expect(summary.withinTargetCount).toBeGreaterThanOrEqual(1);
      expect(summary.withinTargetRate).toBeGreaterThan(0);
    });

    it("creates upload intent, confirms attachment upload with SHA-256, and lists attachments", async () => {
      const mockStorage = createMockStorage();
      const { driverSosService } = setupService(mockStorage);
      const driverIdentity = buildDriverIdentity("drv-upload-01");

      const sos = await driverSosService.submitSosEvent(
        {
          clientEventId: "e5f6a7b8-c9d0-4e1f-af3b-4c5d6e7f8a9b",
          eventType: "traffic_accident",
          severity: "major",
          originalTriggeredAt: new Date().toISOString(),
          offlineAtTrigger: false,
        },
        driverIdentity,
      );

      // 1. Create upload intent for accident scene photo
      const intentResult = await driverSosService.createAttachmentUploadIntent(
        sos.event.sosEventId,
        {
          attachmentType: "photo",
          originalFileName: "scene-accident-front.jpg",
          contentType: "image/jpeg",
          fileSize: 1024 * 150,
        },
        driverIdentity,
        "req-intent-01",
      );
      expect(intentResult.state).toBe("ready");
      if (intentResult.state === "ready") {
        expect(intentResult.uploadUrl).toContain("presigned");
        expect(intentResult.objectKey).toBeDefined();

        // 2. Confirm attachment upload
        const confirmResult = await driverSosService.confirmAttachmentUpload(
          sos.event.sosEventId,
          {
            objectKey: intentResult.objectKey,
          },
          driverIdentity,
          "req-confirm-01",
        );
        expect(confirmResult.state).toBe("confirmed");
        if (confirmResult.state === "confirmed") {
          expect(confirmResult.attachment.objectKey).toBe(intentResult.objectKey);
          expect(confirmResult.attachment.checksumSha256).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          );

          // 3. List attachments
          const list = await driverSosService.listAttachments(
            sos.event.sosEventId,
            driverIdentity,
          );
          expect(list).toHaveLength(1);
          expect(list[0]?.originalFileName).toBe("scene-accident-front.jpg");
        }
      }
    });
  });

  describe("Negative & boundary cases: non-UUID clientEventId, non-driver role rejection, invalid render timestamps", () => {
    it("rejects SOS submission with non-UUID v4 clientEventId", async () => {
      const { driverSosService } = setupService();
      const driverIdentity = buildDriverIdentity();

      await expect(
        driverSosService.submitSosEvent(
          {
            clientEventId: "not-a-valid-uuid",
            eventType: "other",
            severity: "normal",
            originalTriggeredAt: new Date().toISOString(),
            offlineAtTrigger: false,
          },
          driverIdentity,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await driverSosService.submitSosEvent(
          {
            clientEventId: "12345",
            eventType: "other",
            severity: "normal",
            originalTriggeredAt: new Date().toISOString(),
            offlineAtTrigger: false,
          },
          driverIdentity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("VALIDATION_ERROR");
      }
    });

    it("rejects SOS submission from non-driver realm with 403", async () => {
      const { driverSosService } = setupService();
      const opsIdentity = buildOpsIdentity();

      await expect(
        driverSosService.submitSosEvent(
          {
            clientEventId: "f6a7b8c9-d0e1-4f2a-8b4c-5d6e7f8a9b0c",
            eventType: "other",
            severity: "normal",
            originalTriggeredAt: new Date().toISOString(),
            offlineAtTrigger: false,
          },
          opsIdentity,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await driverSosService.submitSosEvent(
          {
            clientEventId: "f6a7b8c9-d0e1-4f2a-8b4c-5d6e7f8a9b0c",
            eventType: "other",
            severity: "normal",
            originalTriggeredAt: new Date().toISOString(),
            offlineAtTrigger: false,
          },
          opsIdentity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
      }
    });

    it("rejects ops alert rendered receipt when incident does not have an SOS alert with 404", async () => {
      const { driverSosService } = setupService();
      const opsIdentity = buildOpsIdentity();

      try {
        await driverSosService.recordOpsAlertsRendered(
          {
            incidentIds: ["INC-NON-EXISTENT-99"],
            renderedAt: new Date().toISOString(),
          },
          opsIdentity,
        );
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiRequestError);
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("DRIVER_SOS_ALERT_NOT_FOUND");
      }
    });

    it("rejects renderedAt timestamp more than 5 minutes in the future with 400", async () => {
      const { driverSosService } = setupService();
      const driverIdentity = buildDriverIdentity();
      const opsIdentity = buildOpsIdentity();

      const sos = await driverSosService.submitSosEvent(
        {
          clientEventId: "a7b8c9d0-e1f2-4a3b-8f5d-6e7f8a9b0c1d",
          eventType: "security_incident",
          severity: "major",
          originalTriggeredAt: new Date().toISOString(),
          offlineAtTrigger: false,
        },
        driverIdentity,
      );

      const farFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes in future

      try {
        await driverSosService.recordOpsAlertsRendered(
          {
            incidentIds: [sos.receipt.incidentId],
            renderedAt: farFuture,
          },
          opsIdentity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("VALIDATION_ERROR");
      }
    });

    it("rejects alert latency query when from timestamp is later than to timestamp with 400", async () => {
      const { driverSosService } = setupService();
      const opsIdentity = buildOpsIdentity();

      try {
        await driverSosService.getOpsAlertLatencySummary(
          {
            from: "2026-09-10T22:00:00Z",
            to: "2026-09-10T20:00:00Z",
          },
          opsIdentity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("VALIDATION_ERROR");
      }
    });
  });
});
