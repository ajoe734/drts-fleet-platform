import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";

import type {
  DriverSosEventRecord,
  DriverSosTimelineEntry,
  DriverSosUrgentAlertOutboxRecord,
  IncidentRecord,
  IncidentTimelineEntry,
} from "@drts/contracts";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import {
  DriverSosController,
  OpsDriverSosController,
} from "../../src/modules/driver-sos/driver-sos.controller";
import {
  type DriverSosRepositoryState,
  type PersistDriverSosSubmission,
  type PersistDriverSosSubmissionResult,
  DriverSosRepository,
} from "../../src/modules/driver-sos/driver-sos.repository";
import { DriverSosService } from "../../src/modules/driver-sos/driver-sos.service";
import { IncidentService } from "../../src/modules/incident/incident.service";

class InMemoryDriverSosRepository {
  private events = new Map<string, DriverSosEventRecord>();
  private eventIdByKey = new Map<string, string>();
  private timelines = new Map<string, DriverSosTimelineEntry[]>();
  private urgentAlertOutbox = new Map<
    string,
    DriverSosUrgentAlertOutboxRecord
  >();
  private incidents = new Map<string, IncidentRecord>();
  private incidentTimelines = new Map<string, IncidentTimelineEntry[]>();

  isEnabled() {
    return true;
  }

  async loadState(): Promise<DriverSosRepositoryState> {
    return this.snapshot();
  }

  async persistSubmission(
    submission: PersistDriverSosSubmission,
  ): Promise<PersistDriverSosSubmissionResult> {
    const key = this.keyFor(
      submission.event.driverId,
      submission.event.clientEventId,
    );
    const existingEventId = this.eventIdByKey.get(key);
    if (existingEventId) {
      const event = this.events.get(existingEventId)!;
      const incident = this.incidents.get(event.incidentId!)!;
      return {
        duplicate: true,
        event: this.cloneEvent(event),
        sosTimelines: (this.timelines.get(existingEventId) ?? []).map((entry) =>
          this.cloneTimeline(entry),
        ),
        urgentAlertOutbox: this.cloneOutbox(
          this.urgentAlertOutbox.get(existingEventId)!,
        ),
        incident: this.cloneIncident(incident),
        incidentTimelines: (
          this.incidentTimelines.get(incident.incidentId) ?? []
        ).map((entry) => this.cloneIncidentTimeline(entry)),
      };
    }

    const event = this.cloneEvent(submission.event);
    this.events.set(event.sosEventId, event);
    this.eventIdByKey.set(key, event.sosEventId);
    this.timelines.set(
      event.sosEventId,
      submission.sosTimelines.map((entry) => this.cloneTimeline(entry)),
    );
    this.urgentAlertOutbox.set(
      event.sosEventId,
      this.cloneOutbox(submission.urgentAlertOutbox),
    );
    this.incidents.set(
      submission.incident.incidentId,
      this.cloneIncident(submission.incident),
    );
    this.incidentTimelines.set(
      submission.incident.incidentId,
      submission.incidentTimelines.map((entry) =>
        this.cloneIncidentTimeline(entry),
      ),
    );

    return {
      duplicate: false,
      event,
      sosTimelines: submission.sosTimelines.map((entry) =>
        this.cloneTimeline(entry),
      ),
      urgentAlertOutbox: this.cloneOutbox(submission.urgentAlertOutbox),
      incident: this.cloneIncident(submission.incident),
      incidentTimelines: submission.incidentTimelines.map((entry) =>
        this.cloneIncidentTimeline(entry),
      ),
    };
  }

  reportPersistenceFailure() {}

  snapshot(): DriverSosRepositoryState {
    return {
      events: [...this.events.values()].map((event) => this.cloneEvent(event)),
      timelines: [...this.timelines.values()]
        .flat()
        .map((entry) => this.cloneTimeline(entry)),
      urgentAlertOutbox: [...this.urgentAlertOutbox.values()].map((record) =>
        this.cloneOutbox(record),
      ),
    };
  }

  private keyFor(driverId: string, clientEventId: string) {
    return `${driverId}:${clientEventId}`;
  }

  private cloneEvent(event: DriverSosEventRecord): DriverSosEventRecord {
    return {
      ...event,
      location: event.location ? { ...event.location } : null,
      falseAlarm: { ...event.falseAlarm },
      dutyAcknowledgement: { ...event.dutyAcknowledgement },
    };
  }

  private cloneTimeline(entry: DriverSosTimelineEntry): DriverSosTimelineEntry {
    return {
      ...entry,
      payload: { ...entry.payload },
    };
  }

  private cloneOutbox(
    record: DriverSosUrgentAlertOutboxRecord,
  ): DriverSosUrgentAlertOutboxRecord {
    return {
      ...record,
      payload: { ...record.payload },
    };
  }

  private cloneIncident(incident: IncidentRecord): IncidentRecord {
    return {
      ...incident,
      serviceRecoveryActions: incident.serviceRecoveryActions.map((action) => ({
        ...action,
      })),
      matchingSuppression: incident.matchingSuppression
        ? { ...incident.matchingSuppression }
        : null,
      availableActions: incident.availableActions?.map((action) => ({
        ...action,
      })),
    };
  }

  private cloneIncidentTimeline(
    entry: IncidentTimelineEntry,
  ): IncidentTimelineEntry {
    return { ...entry };
  }
}

@Module({
  controllers: [DriverSosController, OpsDriverSosController],
  providers: [
    DriverSosService,
    IncidentService,
    AuditNotificationService,
    {
      provide: APP_GUARD,
      useClass: BootstrapAuthGuard,
    },
    {
      provide: DriverSosRepository,
      useClass: InMemoryDriverSosRepository,
    },
  ],
})
class DriverSosIntegrationTestModule {}

async function createTestApp() {
  const app = await NestFactory.create(DriverSosIntegrationTestModule, {
    logger: false,
  });
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function buildDriverHeaders() {
  return {
    "content-type": "application/json",
    "x-actor-type": "driver_user",
    "x-actor-id": "drv-int-sos-001",
    "x-realm": "driver",
    "x-role-families": "driver",
    "x-scopes": "driver:read,driver:write,incident:write",
  };
}

function buildOpsHeaders() {
  return {
    "content-type": "application/json",
    "x-actor-type": "ops_user",
    "x-actor-id": "ops-int-sos-001",
    "x-realm": "ops",
    "x-role-families": "ops",
    "x-scopes": "incident:read,incident:write",
  };
}

describe("INT-S3-001 driver SOS idempotency", () => {
  afterEach(() => {
    // no-op placeholder to align with the integration suite style
  });

  it("creates exactly one correlated incident/timeline/outbox across replayed uploads", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const payload = {
        clientEventId: "33333333-3333-4333-8333-333333333333",
        driverId: "SPOOFED-DRIVER",
        vehicleId: "veh-int-sos-001",
        plateNo: "XYZ-7788",
        orderId: "ord-int-sos-001",
        taskId: "task-int-sos-001",
        eventType: "security_incident",
        severity: "major",
        description: "Driver pressed SOS in integration test.",
        location: {
          lat: 25.0478,
          lng: 121.5319,
          accuracyM: 5,
          recordedAt: "2026-07-20T08:45:00.000Z",
          reverseGeocodedAddress: "Taipei Main Station",
          geocodeProvider: "manual",
        },
        originalTriggeredAt: "2026-07-20T08:44:59.000Z",
        offlineAtTrigger: true,
      };

      const firstResponse = await fetch(`${baseUrl}/api/driver/sos-events`, {
        method: "POST",
        headers: buildDriverHeaders(),
        body: JSON.stringify(payload),
      });
      expect(firstResponse.ok).toBe(true);
      const firstBody = await firstResponse.json();

      const replayResponse = await fetch(`${baseUrl}/api/driver/sos-events`, {
        method: "POST",
        headers: buildDriverHeaders(),
        body: JSON.stringify({
          ...payload,
          description: "Replay payload should not overwrite the original SOS.",
          severity: "normal",
        }),
      });
      expect(replayResponse.ok).toBe(true);
      const replayBody = await replayResponse.json();

      expect(firstBody.data.event.driverId).toBe("drv-int-sos-001");
      expect(firstBody.data.receipt.duplicate).toBe(false);
      expect(firstBody.data.event.incidentId).toBe(
        firstBody.data.receipt.incidentId,
      );

      expect(replayBody.data.receipt.duplicate).toBe(true);
      expect(replayBody.data.event.sosEventId).toBe(
        firstBody.data.event.sosEventId,
      );
      expect(replayBody.data.receipt.incidentId).toBe(
        firstBody.data.receipt.incidentId,
      );
      expect(replayBody.data.event.description).toBe(
        "Driver pressed SOS in integration test.",
      );

      const uploadIntentResponse = await fetch(
        `${baseUrl}/api/driver/sos-events/${firstBody.data.event.sosEventId}/attachments/upload-intents`,
        {
          method: "POST",
          headers: buildDriverHeaders(),
          body: JSON.stringify({
            attachmentType: "photo",
            originalFileName: "scene.jpg",
            contentType: "image/jpeg",
            fileSize: 1024,
          }),
        },
      );
      expect(uploadIntentResponse.ok).toBe(true);
      expect((await uploadIntentResponse.json()).data).toEqual({
        state: "unavailable",
        sosEventId: firstBody.data.event.sosEventId,
        reasonCode: "storage_provider_unavailable",
        reason: "No attachment storage provider is configured.",
        retryable: true,
      });

      const renderedAt = new Date(
        Math.max(
          Date.now(),
          Date.parse(firstBody.data.receipt.fleetReportConfirmedAt),
        ),
      ).toISOString();
      const renderResponse = await fetch(
        `${baseUrl}/api/ops/driver-sos/alerts/rendered`,
        {
          method: "POST",
          headers: buildOpsHeaders(),
          body: JSON.stringify({
            incidentIds: [firstBody.data.receipt.incidentId],
            renderedAt,
          }),
        },
      );
      expect(renderResponse.ok).toBe(true);
      const renderBody = await renderResponse.json();
      expect(renderBody.data.observations[0]).toEqual(
        expect.objectContaining({
          incidentId: firstBody.data.receipt.incidentId,
          fleetReportConfirmedAt: firstBody.data.receipt.fleetReportConfirmedAt,
          opsAlertRenderedAt: renderedAt,
          alertToOpsLatencyMs: expect.any(Number),
          duplicate: false,
        }),
      );

      const repository = app.get(
        DriverSosRepository,
      ) as InMemoryDriverSosRepository;
      const incidentService = app.get(IncidentService);
      const snapshot = repository.snapshot();

      expect(snapshot.events).toHaveLength(1);
      expect(snapshot.timelines).toHaveLength(1);
      expect(snapshot.urgentAlertOutbox).toHaveLength(1);
      expect(incidentService.listIncidents()).toHaveLength(1);
      expect(
        incidentService.getTimeline(firstBody.data.receipt.incidentId),
      ).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
