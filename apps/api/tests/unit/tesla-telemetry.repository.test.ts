import { describe, expect, it, vi } from "vitest";

import { TeslaTelemetryRepository } from "../../src/modules/tesla-telemetry/tesla-telemetry.repository";

describe("TeslaTelemetryRepository", () => {
  it("normalizes omitted session ids to the DB default and maps them back to null", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          telemetry_event_id: "evt-db-001",
          provider_code: "tesla",
          feed_kind: "vehicle_state",
          vehicle_id: "veh-av-101",
          external_vehicle_ref: "VIN-101",
          session_id: "",
          provider_event_id: "provider-event-101",
          sequence_no: 7,
          captured_at: "2026-06-26T13:10:00.000Z",
          source_schema_version: "tesla.vehicle-state.v1",
          payload_sha256: "abc123",
          payload_body: { sample: true },
          received_at: "2026-06-26T13:10:01.000Z",
          ingest_status: "accepted",
          quarantine_reason: null,
        },
      ],
    });

    const repository = new TeslaTelemetryRepository({
      isEnabled: () => true,
      query,
    } as never);

    const record = await repository.createEvent({
      providerCode: "tesla",
      feedKind: "vehicle_state",
      vehicleId: "veh-av-101",
      externalVehicleRef: "VIN-101",
      sessionId: null,
      providerEventId: "provider-event-101",
      sequenceNo: 7,
      capturedAt: "2026-06-26T13:10:00.000Z",
      sourceSchemaVersion: "tesla.vehicle-state.v1",
      payloadSha256: "abc123",
      payloadBody: { sample: true },
      receivedAt: "2026-06-26T13:10:01.000Z",
      ingestStatus: "accepted",
      quarantineReason: null,
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]?.[5]).toBe("");
    expect(record.sessionId).toBeNull();
  });

  it("treats a unique violation during insert as a duplicate and reloads the existing event", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    const query = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            telemetry_event_id: "evt-db-duplicate",
            provider_code: "tesla",
            feed_kind: "vehicle_state",
            vehicle_id: "veh-av-102",
            external_vehicle_ref: "VIN-102",
            session_id: "",
            provider_event_id: "provider-event-102",
            sequence_no: 8,
            captured_at: "2026-06-26T13:11:00.000Z",
            source_schema_version: "tesla.vehicle-state.v1",
            payload_sha256: "def456",
            payload_body: { sample: true },
            received_at: "2026-06-26T13:11:01.000Z",
            ingest_status: "accepted",
            quarantine_reason: null,
          },
        ],
      });

    const repository = new TeslaTelemetryRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.createEventIfAbsent({
      providerCode: "tesla",
      feedKind: "vehicle_state",
      vehicleId: "veh-av-102",
      externalVehicleRef: "VIN-102",
      sessionId: null,
      providerEventId: "provider-event-102",
      sequenceNo: 8,
      capturedAt: "2026-06-26T13:11:00.000Z",
      sourceSchemaVersion: "tesla.vehicle-state.v1",
      payloadSha256: "def456",
      payloadBody: { sample: true },
      receivedAt: "2026-06-26T13:11:01.000Z",
      ingestStatus: "accepted",
      quarantineReason: null,
    });

    expect(result).toMatchObject({
      inserted: false,
      eventRecord: {
        providerEventId: "provider-event-102",
        sequenceNo: 8,
        sessionId: null,
      },
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
