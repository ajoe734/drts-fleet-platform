import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { DriverHeartbeatController } from "../../src/modules/regulatory-registry/driver-heartbeat.controller";
import { OpsDriverTrackingController } from "../../src/modules/regulatory-registry/ops-driver-tracking.controller";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

const regulatoryRegistryService = {
  getDriverTrackingStatus: vi.fn(async (driverId: string) => ({
    driverId,
    locationFreshness: "fresh",
    currentLocation: {
      driverId,
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
    lastEventId: "evt-001",
    lastDeviceId: "device-001",
    lastSequenceNo: 1001,
    lastHeartbeatRecordedAt: "2026-06-20T06:00:00.000Z",
    lastHeartbeatReceivedAt: "2026-06-20T06:00:05.000Z",
    lastSuccessfulUploadAt: "2026-06-20T06:00:05.000Z",
  })),
  recordDriverLocationBatch: vi.fn(),
};

@Module({
  controllers: [DriverHeartbeatController, OpsDriverTrackingController],
  providers: [
    {
      provide: RegulatoryRegistryService,
      useValue: regulatoryRegistryService,
    },
  ],
})
class DriverTrackingHttpTestModule {}

describe("Driver heartbeat HTTP routing", () => {
  let baseUrl: string;
  let closeApplication: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const app = await NestFactory.create(DriverTrackingHttpTestModule, {
      logger: false,
    });
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral HTTP server address.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    closeApplication = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    await closeApplication?.();
  });

  it("routes the driver tracking-status endpoint", async () => {
    const response = await fetch(
      `${baseUrl}/driver/tracking-status?driverId=drv-demo-001`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        driverId: "drv-demo-001",
        locationFreshness: "fresh",
        currentVehicleId: "veh-demo-001",
      }),
      meta: {
        requestId: expect.any(String),
        timestamp: expect.any(String),
      },
    });
  });

  it("routes the ops driver tracking-status endpoint", async () => {
    const response = await fetch(
      `${baseUrl}/ops/drivers/drv-demo-002/tracking-status`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        driverId: "drv-demo-002",
        locationFreshness: "fresh",
      }),
      meta: {
        requestId: expect.any(String),
        timestamp: expect.any(String),
      },
    });
  });
});
