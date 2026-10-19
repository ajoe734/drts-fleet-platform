import { describe, expect, it } from "vitest";

import type { IncidentRecord } from "@drts/contracts";

import { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { FakeIncidentDatabaseService } from "./fake-incident-pg-client";

// Production repository with a sequential SQL-expression model only.
// Official-schema lock waits and concurrency are covered by the hosted test;
// these socket-free cases do not establish PostgreSQL execution credit.

function buildIncident(overrides: Partial<IncidentRecord>): IncidentRecord {
  return {
    incidentId: "INC-OWN-1",
    title: "SOS duty handover",
    description: "Driver SOS requires duty acknowledgment.",
    category: "safety",
    severity: "high",
    status: "open",
    relatedOrderId: null,
    relatedVehicleId: null,
    relatedDriverId: "drv-1",
    relatedComplaintCaseNo: null,
    reportedBy: "drv-1",
    assignedTo: null,
    escalationTarget: null,
    sourceDispatchExceptionOrderId: null,
    occurredAt: null,
    location: null,
    resolutionNote: null,
    serviceRecoveryActions: [],
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...overrides,
  };
}

function setup() {
  const fakeDb = new FakeIncidentDatabaseService();
  const repository = new IncidentRepository(
    fakeDb as unknown as DatabaseService,
  );
  return { fakeDb, repository };
}

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R10 repair: F5 SQL-NULL compensation", () => {
  it("clears assignedTo via revertAssignedToIfStillOwner without violating record's NOT NULL constraint", async () => {
    const { fakeDb, repository } = setup();
    await repository.persistChanges({
      incidents: [
        buildIncident({
          assignedTo: "driver-A",
          updatedAt: "2026-10-18T00:00:00.000Z",
        }),
      ],
    });

    const applied = await repository.revertAssignedToIfStillOwner(
      "INC-OWN-1",
      "driver-A",
      null,
      "2026-10-18T00:01:00.000Z",
    );

    expect(applied).toBe(true);
    const row = fakeDb.client.getRow("INC-OWN-1")!;
    expect(row.assigned_to).toBeUndefined(); // SQL NULL column, nullable
    expect((row.record as IncidentRecord).assignedTo).toBeNull(); // JSON null literal, not SQL NULL
    expect(row.updated_at).toBe("2026-10-18T00:01:00.000Z");
  });

  it("is a no-op (not an error) when some other writer already moved assignedTo away from the expected owner", async () => {
    const { fakeDb, repository } = setup();
    await repository.persistChanges({
      incidents: [
        buildIncident({
          assignedTo: "driver-C",
          updatedAt: "2026-10-18T00:00:00.000Z",
        }),
      ],
    });

    const applied = await repository.revertAssignedToIfStillOwner(
      "INC-OWN-1",
      "driver-A",
      null,
      "2026-10-18T00:01:00.000Z",
    );

    expect(applied).toBe(false);
    const row = fakeDb.client.getRow("INC-OWN-1")!;
    expect(row.assigned_to).toBe("driver-C"); // untouched -- not our owner to revert
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R10 repair: F5 retained deferred carrying writer", () => {
  it("does not let a stale full-record write that landed after a (no-op) compensation resurrect the rejected owner, while still applying its legitimate status change", async () => {
    const { fakeDb, repository } = setup();

    // T0: baseline durable state -- unowned, open.
    await repository.persistChanges({
      incidents: [
        buildIncident({
          assignedTo: null,
          status: "open",
          updatedAt: "2026-10-18T00:00:00.000Z",
        }),
      ],
    });

    // T1: a concurrent generic status update captures the Incident's
    // in-memory state *while* a rejected duty claim ("driver-B") was still
    // exposed there, carrying it into its own full-record snapshot. Its own
    // persistChanges call is "deferred" -- held here, not sent yet.
    const staleCarryingSnapshot = buildIncident({
      assignedTo: "driver-B",
      status: "investigating",
      updatedAt: "2026-10-18T00:00:01.000Z",
    });

    // T2 (> T1): the claim is rejected and compensation runs. Because the
    // stale carrying write (T1) has not landed in the database yet, durable
    // assigned_to is still null here -- the CAS condition does not hold, so
    // this is a no-op for assigned_to, but it must still durably advance
    // updated_at so the later-landing T1 write can be fenced.
    const compensationApplied = await repository.revertAssignedToIfStillOwner(
      "INC-OWN-1",
      "driver-B",
      null,
      "2026-10-18T00:00:02.000Z",
    );
    expect(compensationApplied).toBe(false);

    // T1's write finally lands, after compensation.
    await repository.persistChanges({ incidents: [staleCarryingSnapshot] });

    const row = fakeDb.client.getRow("INC-OWN-1")!;
    expect(row.assigned_to).toBeUndefined(); // rejected owner must not resurface
    expect(row.status).toBe("investigating"); // legitimate field change still applied
    expect((row.record as IncidentRecord).assignedTo).toBeNull();
    expect((row.record as IncidentRecord).status).toBe("investigating");
    // updated_at never regresses behind the compensation that already ran.
    expect(row.updated_at).toBe("2026-10-18T00:00:02.000Z");
  });

  it.each(["2026-10-18T00:00:00.000Z", "2026-10-17T23:59:59.000Z"])(
    "does not resurrect a rejected owner when carrying/compensation timestamps tie or clocks differ (%s)",
    async (carryingTime) => {
      const { fakeDb, repository } = setup();
      await repository.persistChanges({ incidents: [buildIncident({})] });
      await repository.revertAssignedToIfStillOwner(
        "INC-OWN-1",
        "rejected",
        null,
        "2026-10-18T00:00:00.000Z",
      );
      await repository.persistChanges({
        incidents: [
          buildIncident({
            assignedTo: "rejected",
            status: "investigating",
            updatedAt: carryingTime,
          }),
        ],
      });
      const row = fakeDb.client.getRow("INC-OWN-1")!;
      expect(row.assigned_to).toBeUndefined();
      expect((row.record as IncidentRecord).assignedTo).toBeNull();
      expect(row.status).toBe("investigating");
    },
  );

  it("still applies an explicit legitimate assignment intent (no regression on the happy path)", async () => {
    const { fakeDb, repository } = setup();
    await repository.persistChanges({
      incidents: [
        buildIncident({
          assignedTo: null,
          status: "open",
          updatedAt: "2026-10-18T00:00:00.000Z",
        }),
      ],
    });

    await repository.persistChanges(
      {
        incidents: [
          buildIncident({
            assignedTo: "driver-D",
            status: "open",
            updatedAt: "2026-10-18T00:05:00.000Z",
          }),
        ],
      },
      { assignIntentIncidentIds: ["INC-OWN-1"] },
    );

    const row = fakeDb.client.getRow("INC-OWN-1")!;
    expect(row.assigned_to).toBe("driver-D");
    expect((row.record as IncidentRecord).assignedTo).toBe("driver-D");
    expect(row.updated_at).toBe("2026-10-18T00:05:00.000Z");
  });

  it("keeps ownership null when a generic carrying write lands first and then compensation runs", async () => {
    const { fakeDb, repository } = setup();
    await repository.persistChanges({
      incidents: [
        buildIncident({
          assignedTo: null,
          status: "open",
          updatedAt: "2026-10-18T00:00:00.000Z",
        }),
      ],
    });

    // The carrying write lands *first* this time.
    await repository.persistChanges({
      incidents: [
        buildIncident({
          assignedTo: "driver-B",
          status: "investigating",
          updatedAt: "2026-10-18T00:00:01.000Z",
        }),
      ],
    });

    const compensationApplied = await repository.revertAssignedToIfStillOwner(
      "INC-OWN-1",
      "driver-B",
      null,
      "2026-10-18T00:00:02.000Z",
    );

    expect(compensationApplied).toBe(false);
    const row = fakeDb.client.getRow("INC-OWN-1")!;
    expect(row.assigned_to).toBeUndefined();
    expect(row.status).toBe("investigating"); // compensation never touches status
    expect((row.record as IncidentRecord).assignedTo).toBeNull();
  });
});
