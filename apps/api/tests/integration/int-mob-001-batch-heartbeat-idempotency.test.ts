import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DriverLocationHeartbeatEnvelope,
  DriverLocationSnapshot,
} from "@drts/contracts";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { DriverHeartbeatController } from "../../src/modules/regulatory-registry/driver-heartbeat.controller";
import { OpsDriverTrackingController } from "../../src/modules/regulatory-registry/ops-driver-tracking.controller";
import {
  type DriverHeartbeatEventSnapshot,
  RegulatoryRegistryRepository,
} from "../../src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

type StoredHeartbeatEvent = DriverHeartbeatEventSnapshot;

class InMemoryHeartbeatRepository {
  private readonly currentLocations = new Map<string, DriverLocationSnapshot>();
  private readonly heartbeatEvents: StoredHeartbeatEvent[] = [];

  isEnabled() {
    return true;
  }

  async persistChanges() {}

  reportPersistenceFailure() {}

  async loadState() {
    return {
      vehicles: [],
      drivers: [],
      supplyPairs: [],
      contracts: [],
      policies: [],
      exclusivities: [],
    };
  }

  async listLatestDriverLocations(): Promise<DriverLocationSnapshot[]> {
    return Array.from(this.currentLocations.values()).map((location) => ({
      ...location,
    }));
  }

  async findLatestDriverLocation(
    driverId: string,
  ): Promise<DriverLocationSnapshot | null> {
    const location = this.currentLocations.get(driverId);
    return location ? { ...location } : null;
  }

  async recordDriverLocationEvent(event: DriverLocationHeartbeatEnvelope) {
    const duplicate = this.heartbeatEvents.find(
      (candidate) =>
        candidate.eventId === event.eventId ||
        (candidate.deviceId === event.deviceId &&
          candidate.sequenceNo === event.sequenceNo),
    );
    if (duplicate) {
      return {
        duplicate: true,
        currentLocationUpdated: false,
        serverReceivedAt: duplicate.receivedAt,
      };
    }

    const serverReceivedAt = new Date().toISOString();
    const currentLocation = this.currentLocations.get(event.driverId);
    const currentLocationUpdated =
      !currentLocation ||
      Date.parse(event.recordedAt) > Date.parse(currentLocation.recordedAt);

    this.heartbeatEvents.push({
      ...event,
      receivedAt: serverReceivedAt,
    });

    if (currentLocationUpdated) {
      this.currentLocations.set(event.driverId, {
        driverId: event.driverId,
        lat: event.lat,
        lng: event.lng,
        accuracyM: event.accuracyM,
        recordedAt: event.recordedAt,
        updatedAt: serverReceivedAt,
      });
    }

    return {
      duplicate: false,
      currentLocationUpdated,
      serverReceivedAt,
    };
  }

  async findLatestDriverHeartbeatEvent(
    driverId: string,
  ): Promise<StoredHeartbeatEvent | null> {
    const events = this.heartbeatEvents
      .filter((event) => event.driverId === driverId)
      .sort((left, right) => {
        const receivedDiff =
          Date.parse(right.receivedAt) - Date.parse(left.receivedAt);
        if (receivedDiff !== 0) {
          return receivedDiff;
        }

        const recordedDiff =
          Date.parse(right.recordedAt) - Date.parse(left.recordedAt);
        if (recordedDiff !== 0) {
          return recordedDiff;
        }

        return right.sequenceNo - left.sequenceNo;
      });

    return events[0] ? { ...events[0] } : null;
  }

  async findDriverHeartbeatEventByRecordedAt(
    driverId: string,
    recordedAt: string,
    receivedAt?: string,
  ): Promise<StoredHeartbeatEvent | null> {
    const event = this.heartbeatEvents
      .filter((candidate) => {
        if (
          candidate.driverId !== driverId ||
          candidate.recordedAt !== recordedAt
        ) {
          return false;
        }

        return receivedAt === undefined || candidate.receivedAt === receivedAt;
      })
      .sort((left, right) => {
        const receivedDiff =
          Date.parse(left.receivedAt) - Date.parse(right.receivedAt);
        if (receivedDiff !== 0) {
          return receivedDiff;
        }

        return left.sequenceNo - right.sequenceNo;
      })[0];

    return event ? { ...event } : null;
  }
}

const opsDispatchEventsService = {
  publishDriverLocationUpdated: vi.fn(),
  publishSupplyLifecycleUpdated: vi.fn(),
};

@Module({
  controllers: [DriverHeartbeatController, OpsDriverTrackingController],
  providers: [
    RegulatoryRegistryService,
    AuditNotificationService,
    DriverProfileService,
    {
      provide: RegulatoryRegistryRepository,
      useClass: InMemoryHeartbeatRepository,
    },
    {
      provide: "OpsDispatchEventsService",
      useValue: opsDispatchEventsService,
    },
    {
      provide: RegulatoryRegistryService,
      useFactory: (
        auditNotificationService: AuditNotificationService,
        driverProfileService: DriverProfileService,
        repository: RegulatoryRegistryRepository,
      ) =>
        new RegulatoryRegistryService(
          opsDispatchEventsService as never,
          auditNotificationService,
          driverProfileService,
          repository,
        ),
      inject: [
        AuditNotificationService,
        DriverProfileService,
        RegulatoryRegistryRepository,
      ],
    },
  ],
})
class DriverHeartbeatIntegrationTestModule {}

async function createTestApp() {
  const app = await NestFactory.create(DriverHeartbeatIntegrationTestModule, {
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

describe("INT-MOB-001 batch heartbeat idempotency", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("dedupes replayed uploads, preserves the newest current location, and reports stale tracking status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T06:00:05.000Z"));

    const { app, baseUrl } = await createTestApp();

    try {
      const batchResponse = await fetch(
        `${baseUrl}/api/driver/location-heartbeats/batch`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            items: [
              {
                eventId: "evt-001",
                deviceId: "device-001",
                driverId: "drv-demo-001",
                vehicleId: "veh-demo-001",
                taskId: "task-001",
                sequenceNo: 1001,
                recordedAt: "2026-06-20T06:00:00.000Z",
                lat: 24.1477,
                lng: 120.6736,
                accuracyM: 8,
                workState: "assigned",
                appState: "foreground",
                transportMode: "foreground",
                networkType: "cellular",
              },
              {
                eventId: "evt-001-replay",
                deviceId: "device-001",
                driverId: "drv-demo-001",
                vehicleId: "veh-demo-001",
                taskId: "task-001",
                sequenceNo: 1001,
                recordedAt: "2026-06-20T06:00:00.000Z",
                lat: 24.1477,
                lng: 120.6736,
                accuracyM: 8,
                workState: "assigned",
                appState: "foreground",
                transportMode: "foreground",
                networkType: "cellular",
              },
              {
                eventId: "evt-002",
                deviceId: "device-001",
                driverId: "drv-demo-001",
                vehicleId: null,
                taskId: null,
                sequenceNo: 1002,
                recordedAt: "2026-06-20T05:59:00.000Z",
                lat: 24.147,
                lng: 120.673,
                accuracyM: 16,
                workState: "available",
                appState: "background",
                transportMode: "background",
                networkType: "wifi",
              },
            ] satisfies DriverLocationHeartbeatEnvelope[],
          }),
        },
      );

      expect(batchResponse.status).toBe(201);
      await expect(batchResponse.json()).resolves.toEqual({
        data: {
          items: [
            {
              eventId: "evt-001",
              accepted: true,
              duplicate: false,
              currentLocationUpdated: true,
              serverReceivedAt: "2026-06-20T06:00:05.000Z",
            },
            {
              eventId: "evt-001-replay",
              accepted: true,
              duplicate: true,
              currentLocationUpdated: false,
              serverReceivedAt: "2026-06-20T06:00:05.000Z",
            },
            {
              eventId: "evt-002",
              accepted: true,
              duplicate: false,
              currentLocationUpdated: false,
              serverReceivedAt: "2026-06-20T06:00:05.000Z",
            },
          ],
        },
        meta: {
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });

      const driverStatusResponse = await fetch(
        `${baseUrl}/api/driver/tracking-status?driverId=drv-demo-001`,
      );

      expect(driverStatusResponse.status).toBe(200);
      await expect(driverStatusResponse.json()).resolves.toEqual({
        data: {
          driverId: "drv-demo-001",
          locationFreshness: "fresh",
          currentLocation: {
            driverId: "drv-demo-001",
            lat: 24.1477,
            lng: 120.6736,
            accuracyM: 8,
            recordedAt: "2026-06-20T06:00:00.000Z",
            updatedAt: "2026-06-20T06:00:05.000Z",
          },
          currentVehicleId: "veh-demo-001",
          currentTaskId: "task-001",
          trackingState: "assigned",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
          lastEventId: "evt-002",
          lastDeviceId: "device-001",
          lastSequenceNo: 1002,
          lastHeartbeatRecordedAt: "2026-06-20T05:59:00.000Z",
          lastHeartbeatReceivedAt: "2026-06-20T06:00:05.000Z",
          lastSuccessfulUploadAt: "2026-06-20T06:00:05.000Z",
        },
        meta: {
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });

      vi.setSystemTime(new Date("2026-06-20T06:01:37.000Z"));

      const opsStatusResponse = await fetch(
        `${baseUrl}/api/ops/drivers/drv-demo-001/tracking-status`,
      );

      expect(opsStatusResponse.status).toBe(200);
      await expect(opsStatusResponse.json()).resolves.toEqual({
        data: expect.objectContaining({
          driverId: "drv-demo-001",
          locationFreshness: "stale",
          currentLocation: expect.objectContaining({
            recordedAt: "2026-06-20T06:00:00.000Z",
          }),
          lastEventId: "evt-002",
        }),
        meta: {
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    } finally {
      await app.close();
    }
  });

  it("reconstructs current tracking context after restart from the persisted current-location write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T06:00:05.000Z"));

    const repository = new InMemoryHeartbeatRepository();
    const firstWrite = await repository.recordDriverLocationEvent({
      eventId: "evt-001",
      deviceId: "device-001",
      driverId: "drv-demo-001",
      vehicleId: "veh-demo-001",
      taskId: null,
      sequenceNo: 1001,
      recordedAt: "2026-06-20T06:00:00.000Z",
      lat: 24.1477,
      lng: 120.6736,
      accuracyM: 8,
      workState: "available",
      appState: "foreground",
      transportMode: "foreground",
      networkType: "cellular",
    });
    expect(firstWrite.currentLocationUpdated).toBe(true);

    vi.setSystemTime(new Date("2026-06-20T06:00:06.000Z"));

    const secondWrite = await repository.recordDriverLocationEvent({
      eventId: "evt-002",
      deviceId: "device-001",
      driverId: "drv-demo-001",
      vehicleId: "veh-demo-001",
      taskId: "task-002",
      sequenceNo: 1002,
      recordedAt: "2026-06-20T06:00:00.000Z",
      lat: 24.148,
      lng: 120.674,
      accuracyM: 18,
      workState: "assigned",
      appState: "background",
      transportMode: "background",
      networkType: "wifi",
    });
    expect(secondWrite.currentLocationUpdated).toBe(false);

    const service = new RegulatoryRegistryService(
      opsDispatchEventsService as never,
      new AuditNotificationService(),
      new DriverProfileService(new AuditNotificationService()),
      repository as never,
    );

    await expect(
      service.getDriverTrackingStatus("drv-demo-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        currentLocation: expect.objectContaining({
          recordedAt: "2026-06-20T06:00:00.000Z",
          updatedAt: firstWrite.serverReceivedAt,
        }),
        currentTaskId: null,
        trackingState: "available",
        appState: "foreground",
        transportMode: "foreground",
        networkType: "cellular",
        lastEventId: "evt-002",
        lastSequenceNo: 1002,
        lastHeartbeatRecordedAt: "2026-06-20T06:00:00.000Z",
        lastHeartbeatReceivedAt: secondWrite.serverReceivedAt,
      }),
    );
  });
});
