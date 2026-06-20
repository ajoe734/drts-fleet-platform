import { describe, expect, it, vi } from "vitest";

import { DriverTelemetryController } from "../../src/modules/regulatory-registry/regulatory-registry.controller";

describe("DriverTelemetryController", () => {
  it("wraps batch heartbeat ingestion in the standard success envelope", async () => {
    const regulatoryRegistryService = {
      recordDriverLocationBatch: vi.fn(async () => ({
        items: [
          {
            eventId: "11111111-1111-4111-8111-111111111111",
            accepted: true,
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: "2026-06-20T00:00:05.000Z",
          },
        ],
      })),
    };
    const controller = new DriverTelemetryController(
      regulatoryRegistryService as never,
    );

    const response = await controller.recordDriverLocationBatch(
      {
        items: [
          {
            eventId: "11111111-1111-4111-8111-111111111111",
            deviceId: "device-001",
            driverId: "drv-demo-001",
            vehicleId: null,
            taskId: null,
            sequenceNo: 1,
            recordedAt: "2026-06-20T00:00:00.000Z",
            lat: 24.163,
            lng: 120.647,
            accuracyM: 5,
            workState: "available",
            appState: "foreground",
            transportMode: "foreground",
            networkType: "wifi",
          },
        ],
      },
      "req-driver-heartbeat-batch-001",
    );

    expect(regulatoryRegistryService.recordDriverLocationBatch).toHaveBeenCalledWith({
      items: [
        {
          eventId: "11111111-1111-4111-8111-111111111111",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: null,
          taskId: null,
          sequenceNo: 1,
          recordedAt: "2026-06-20T00:00:00.000Z",
          lat: 24.163,
          lng: 120.647,
          accuracyM: 5,
          workState: "available",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "wifi",
        },
      ],
    });
    expect(response).toEqual({
      data: {
        items: [
          {
            eventId: "11111111-1111-4111-8111-111111111111",
            accepted: true,
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: "2026-06-20T00:00:05.000Z",
          },
        ],
      },
      meta: {
        requestId: "req-driver-heartbeat-batch-001",
        timestamp: expect.any(String),
      },
    });
  });
});
