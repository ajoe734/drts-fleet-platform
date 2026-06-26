import { describe, expect, it } from "vitest";

import { TeslaTelemetryRepository } from "../../src/modules/tesla-telemetry/tesla-telemetry.repository";
import { TeslaTelemetryService } from "../../src/modules/tesla-telemetry/tesla-telemetry.service";

describe("TeslaTelemetryService", () => {
  function buildService() {
    const repository = new TeslaTelemetryRepository();
    const service = new TeslaTelemetryService(repository);
    return { repository, service };
  }

  it("preserves out-of-order events and opens a backfill query after the gap threshold", async () => {
    const { repository, service } = buildService();

    await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-001",
        externalVehicleRef: "VIN-001",
        capturedAt: "2026-06-26T10:00:00.000Z",
        location: { lat: 25.03, lng: 121.56 },
        speedMps: 8,
        headingDeg: 90,
        shiftState: "D",
        autonomyState: "fsd_engaged",
        batteryLevelPct: 80,
        batteryRangeKm: 280,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-001",
        sequenceNo: 1,
        schemaVersion: "tesla.vehicle-state.v1",
        sessionId: "drive-session-1",
        receivedAt: "2026-06-26T10:00:00.000Z",
      },
    );
    await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-001",
        externalVehicleRef: "VIN-001",
        capturedAt: "2026-06-26T10:00:05.000Z",
        location: { lat: 25.031, lng: 121.561 },
        speedMps: 10,
        headingDeg: 95,
        shiftState: "D",
        autonomyState: "fsd_engaged",
        batteryLevelPct: 79,
        batteryRangeKm: 279,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-003",
        sequenceNo: 3,
        schemaVersion: "tesla.vehicle-state.v1",
        sessionId: "drive-session-1",
        receivedAt: "2026-06-26T10:00:05.000Z",
      },
    );

    expect(
      repository.listEvents({
        feedKind: "vehicle_state",
        externalVehicleRef: "VIN-001",
        sessionId: "drive-session-1",
      }),
    ).toMatchObject([
      { providerEventId: "veh-state-001", sequenceNo: 1 },
      { providerEventId: "veh-state-003", sequenceNo: 3 },
    ]);

    const health = service.getProviderHealth({
      feedKind: "vehicle_state",
      externalVehicleRef: "VIN-001",
      sessionId: "drive-session-1",
      asOf: "2026-06-26T10:01:06.000Z",
    });

    expect(health).toMatchObject({
      healthState: "gap_detected",
      latestSequenceNo: 3,
      latestContiguousSequenceNo: 1,
      missingSequences: [2],
    });
    expect(service.listBackfillQueries()).toEqual([
      expect.objectContaining({
        vin: "VIN-001",
        from: "2026-06-26T10:00:00.000Z",
        to: "2026-06-26T10:01:06.000Z",
        sessionId: "drive-session-1",
        eventId: "veh-state-003",
        sequenceAfter: 1,
      }),
    ]);
  });

  it("keeps a gap open when the missing sequence arrives quarantined with an unknown schema", async () => {
    const { service } = buildService();

    await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-004",
        externalVehicleRef: "VIN-004",
        capturedAt: "2026-06-26T10:00:00.000Z",
        location: { lat: 25.03, lng: 121.56 },
        speedMps: 8,
        headingDeg: 90,
        shiftState: "D",
        autonomyState: "fsd_engaged",
        batteryLevelPct: 80,
        batteryRangeKm: 280,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-gap-001",
        sequenceNo: 1,
        schemaVersion: "tesla.vehicle-state.v1",
        sessionId: "drive-session-gap",
        receivedAt: "2026-06-26T10:00:00.000Z",
      },
    );
    await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-004",
        externalVehicleRef: "VIN-004",
        capturedAt: "2026-06-26T10:00:05.000Z",
        location: { lat: 25.031, lng: 121.561 },
        speedMps: 10,
        headingDeg: 95,
        shiftState: "D",
        autonomyState: "fsd_engaged",
        batteryLevelPct: 79,
        batteryRangeKm: 279,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-gap-003",
        sequenceNo: 3,
        schemaVersion: "tesla.vehicle-state.v1",
        sessionId: "drive-session-gap",
        receivedAt: "2026-06-26T10:00:05.000Z",
      },
    );

    expect(
      service.getProviderHealth({
        feedKind: "vehicle_state",
        externalVehicleRef: "VIN-004",
        sessionId: "drive-session-gap",
        asOf: "2026-06-26T10:01:06.000Z",
      }),
    ).toMatchObject({
      healthState: "gap_detected",
      latestSequenceNo: 3,
      latestContiguousSequenceNo: 1,
      missingSequences: [2],
    });

    const receipt = await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-004",
        externalVehicleRef: "VIN-004",
        capturedAt: "2026-06-26T10:00:03.000Z",
        location: { lat: 25.0305, lng: 121.5605 },
        speedMps: 9,
        headingDeg: 92,
        shiftState: "D",
        autonomyState: "fsd_engaged",
        batteryLevelPct: 79.5,
        batteryRangeKm: 279.5,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-gap-002-unknown",
        sequenceNo: 2,
        schemaVersion: "tesla.vehicle-state.v9",
        sessionId: "drive-session-gap",
        receivedAt: "2026-06-26T10:01:10.000Z",
      },
    );

    expect(receipt.status).toBe("quarantined");
    expect(receipt.providerHealthState).toBe("regulator_data_incident");
    expect(receipt.backfillRequired).toBe(true);

    expect(
      service.getProviderHealth({
        feedKind: "vehicle_state",
        externalVehicleRef: "VIN-004",
        sessionId: "drive-session-gap",
        asOf: "2026-06-26T10:01:10.000Z",
      }),
    ).toMatchObject({
      healthState: "regulator_data_incident",
      latestSequenceNo: 3,
      latestContiguousSequenceNo: 1,
      missingSequences: [2],
    });

    expect(service.listBackfillQueries()).toEqual([
      expect.objectContaining({
        vin: "VIN-004",
        from: "2026-06-26T10:00:00.000Z",
        eventId: "veh-state-gap-003",
        sequenceAfter: 1,
      }),
    ]);
  });

  it("treats the newest quarantined sequence as a gap and requests backfill after threshold", async () => {
    const { service } = buildService();

    await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-005",
        externalVehicleRef: "VIN-005",
        capturedAt: "2026-06-26T10:00:00.000Z",
        location: { lat: 25.03, lng: 121.56 },
        speedMps: 8,
        headingDeg: 90,
        shiftState: "D",
        autonomyState: "fsd_engaged",
        batteryLevelPct: 80,
        batteryRangeKm: 280,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-newest-gap-001",
        sequenceNo: 1,
        schemaVersion: "tesla.vehicle-state.v1",
        sessionId: "drive-session-newest-gap",
        receivedAt: "2026-06-26T10:00:00.000Z",
      },
    );

    const receipt = await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-005",
        externalVehicleRef: "VIN-005",
        capturedAt: "2026-06-26T10:00:05.000Z",
        location: { lat: 25.031, lng: 121.561 },
        speedMps: 10,
        headingDeg: 95,
        shiftState: "D",
        autonomyState: "fsd_engaged",
        batteryLevelPct: 79,
        batteryRangeKm: 279,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-newest-gap-002-unknown",
        sequenceNo: 2,
        schemaVersion: "tesla.vehicle-state.v9",
        sessionId: "drive-session-newest-gap",
        receivedAt: "2026-06-26T10:01:05.000Z",
      },
    );

    expect(receipt.status).toBe("quarantined");
    expect(receipt.providerHealthState).toBe("regulator_data_incident");
    expect(receipt.backfillRequired).toBe(false);

    expect(
      service.getProviderHealth({
        feedKind: "vehicle_state",
        externalVehicleRef: "VIN-005",
        sessionId: "drive-session-newest-gap",
        asOf: "2026-06-26T10:01:05.000Z",
      }),
    ).toMatchObject({
      healthState: "regulator_data_incident",
      latestSequenceNo: 2,
      latestContiguousSequenceNo: 1,
      missingSequences: [2],
      gapDetectedAt: "2026-06-26T10:01:05.000Z",
      backfillRequestedAt: null,
    });

    expect(service.listBackfillQueries()).toEqual([]);

    expect(
      service.getProviderHealth({
        feedKind: "vehicle_state",
        externalVehicleRef: "VIN-005",
        sessionId: "drive-session-newest-gap",
        asOf: "2026-06-26T10:02:06.000Z",
      }),
    ).toMatchObject({
      healthState: "regulator_data_incident",
      latestSequenceNo: 2,
      latestContiguousSequenceNo: 1,
      missingSequences: [2],
      gapDetectedAt: "2026-06-26T10:01:05.000Z",
      backfillRequestedAt: "2026-06-26T10:02:06.000Z",
    });

    expect(service.listBackfillQueries()).toEqual([
      expect.objectContaining({
        vin: "VIN-005",
        from: "2026-06-26T10:00:00.000Z",
        to: "2026-06-26T10:02:06.000Z",
        sessionId: "drive-session-newest-gap",
        eventId: "veh-state-newest-gap-002-unknown",
        sequenceAfter: 1,
      }),
    ]);
  });

  it("moves stale telemetry into dispatch hold after the hold threshold", async () => {
    const { service } = buildService();

    await service.ingestPublicTelemetrySample(
      {
        externalVehicleRef: "VIN-002",
        capturedAt: "2026-06-26T11:00:00.000Z",
        location: { lat: 25.04, lng: 121.52 },
        batteryLevelPct: 62,
        online: true,
      },
      {
        eventId: "pub-telemetry-001",
        sequenceNo: 1,
        schemaVersion: "tesla.public-telemetry.v1",
        sessionId: "public-session-1",
        receivedAt: "2026-06-26T11:00:00.000Z",
      },
    );

    const health = service.getProviderHealth({
      feedKind: "public_telemetry",
      externalVehicleRef: "VIN-002",
      sessionId: "public-session-1",
      asOf: "2026-06-26T11:03:30.000Z",
    });

    expect(health).toMatchObject({
      healthState: "incomplete_hold",
      dispatchHold: true,
    });
    expect((health?.qualityScore ?? 1) < 0.8).toBe(true);
  });

  it("quarantines unknown schemas and escalates provider health to regulator_data_incident", async () => {
    const { service } = buildService();

    const receipt = await service.ingestVehicleStateSnapshot(
      {
        vehicleId: "veh-av-003",
        externalVehicleRef: "VIN-003",
        capturedAt: "2026-06-26T12:00:00.000Z",
        location: { lat: 25.05, lng: 121.54 },
        speedMps: 0,
        headingDeg: 0,
        shiftState: "P",
        autonomyState: "manual",
        batteryLevelPct: 75,
        batteryRangeKm: 300,
        charging: false,
        online: true,
      },
      {
        eventId: "veh-state-unknown-001",
        sequenceNo: 1,
        schemaVersion: "tesla.vehicle-state.v9",
        sessionId: "drive-session-9",
        receivedAt: "2026-06-26T12:00:00.000Z",
      },
    );

    expect(receipt.status).toBe("quarantined");
    expect(receipt.providerHealthState).toBe("regulator_data_incident");
    expect(receipt.dispatchHold).toBe(true);
  });
});
