import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  DriverSosUrgentAlertOutboxRecord,
  IncidentRecord,
} from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverSosService } from "../../../apps/api/src/modules/driver-sos/driver-sos.service";
import { DriverSosVerificationRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos-verification.repository";
import { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

function identity(
  actorId: string,
  realm: "driver" | "ops",
): BootstrapRequestIdentity {
  return {
    actorId,
    realm,
    authMode: "bootstrap_headers",
    actorType: realm === "driver" ? "driver_user" : "ops_user",
    tenantId: null,
    roleFamilies: [realm],
    roles: [realm === "driver" ? "driver_user" : "ops_dispatcher"],
    scopes: ["incident:read", "incident:write", "driver:read", "driver:write"],
    requestId: `req-${actorId}`,
  };
}
async function submit(service: DriverSosService) {
  return service.submitSosEvent(
    {
      clientEventId: randomUUID(),
      eventType: "traffic_accident",
      severity: "major",
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: false,
    },
    identity("driver-owner", "driver"),
  );
}
function outbox(service: DriverSosService, eventId: string) {
  // Inspect the production cache, without replacing any service decision.
  return (
    service as unknown as {
      urgentAlertOutbox: Map<string, DriverSosUrgentAlertOutboxRecord>;
    }
  ).urgentAlertOutbox.get(eventId)!;
}

describe("SOS durable decision consumers and S-3 §24 outbox transitions", () => {
  it("consumes the actual repository owner instead of reporting its attempted owner after a successful transport", async () => {
    // Only the external DB transport returns a controlled already-owned row.
    // No SQL arbitration/concurrency is claimed by this socket-free fixture.
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("phase1_incidents"))
        return {
          rows: [{ record: durable, previous_owner: durable.assignedTo }],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    });
    const repository = new IncidentRepository({
      isEnabled: () => true,
      query,
      connect: async () => ({ query, release() {} }),
    } as never);
    const audit = new AuditNotificationService();
    const incident = new IncidentService(audit, repository);
    const service = new DriverSosService(audit, incident);
    const sos = await submit(service);
    const durable: IncidentRecord = {
      ...incident.getIncident(sos.receipt.incidentId),
      assignedTo: "ops-real-owner",
      status: "investigating",
    };
    const result = await service.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      identity("ops-attempt", "ops"),
    );
    expect(result.wonAcknowledgement).toBe(false);
    expect(result.dutyAcknowledgement.acknowledgedByActorId).toBe(
      "ops-real-owner",
    );
    expect(incident.getIncident(sos.receipt.incidentId).assignedTo).toBe(
      "ops-real-owner",
    );
    expect(
      result.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(1);
    const readback = await service.getOwnEventForDriver(
      sos.event.sosEventId,
      identity("driver-owner", "driver"),
    );
    expect(readback.event.status).toBe("investigating");
    expect(readback.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      "ops-real-owner",
    );
  });

  it("distinguishes delivered render from acknowledged duty and never downgrades ACK on delayed rendering or replay", async () => {
    const audit = new AuditNotificationService();
    const service = new DriverSosService(audit, new IncidentService(audit));
    const sos = await submit(service);
    const id = sos.event.sosEventId;
    const actor = identity("ops-render", "ops");
    expect(outbox(service, id).status).toBe("pending");
    const render = await service.recordOpsAlertsRendered(
      {
        incidentIds: [sos.receipt.incidentId],
        renderedAt: new Date().toISOString(),
      },
      actor,
    );
    expect(render.observations[0]!.duplicate).toBe(false);
    expect(outbox(service, id).status).toBe("delivered");
    const deliveredAt = outbox(service, id).deliveredAt;
    expect(
      (
        await service.getOwnEventForDriver(
          id,
          identity("driver-owner", "driver"),
        )
      ).event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();
    const ack = await service.acknowledgeDuty(id, {}, actor);
    expect(ack.wonAcknowledgement).toBe(true);
    expect(outbox(service, id).status).toBe("acknowledged");
    await service.recordOpsAlertsRendered(
      {
        incidentIds: [sos.receipt.incidentId],
        renderedAt: new Date().toISOString(),
      },
      actor,
    );
    const replay = await service.acknowledgeDuty(id, {}, actor);
    expect(
      replay.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(1);
    expect(outbox(service, id).status).toBe("acknowledged");
    expect(outbox(service, id).deliveredAt).toBe(deliveredAt);
  });

  it("ACK before rendering does not manufacture a render receipt or delivered timestamp", async () => {
    const audit = new AuditNotificationService();
    const service = new DriverSosService(audit, new IncidentService(audit));
    const sos = await submit(service);
    await service.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      identity("ops-early", "ops"),
    );
    expect(outbox(service, sos.event.sosEventId).status).toBe("acknowledged");
    expect(outbox(service, sos.event.sosEventId).deliveredAt).toBeNull();
    expect(outbox(service, sos.event.sosEventId).opsAlertRenderedAt).toBeNull();
    await service.recordOpsAlertsRendered(
      {
        incidentIds: [sos.receipt.incidentId],
        renderedAt: new Date().toISOString(),
      },
      identity("ops-early", "ops"),
    );
    expect(outbox(service, sos.event.sosEventId).status).toBe("acknowledged");
    expect(outbox(service, sos.event.sosEventId).deliveredAt).not.toBeNull();
  });

  it("does not clear a possibly committed duty owner when the real repository loses its COMMIT acknowledgment", async () => {
    let dutySnapshot: {
      acknowledgedByActorId: string | null;
      acknowledgedAt: string | null;
    } = {
      acknowledgedByActorId: null,
      acknowledgedAt: null,
    };
    let loseCommit = true;
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SELECT duty_ack_snapshot"))
        return {
          rows: [
            {
              duty_ack_snapshot: { ...dutySnapshot },
              status: dutySnapshot.acknowledgedByActorId
                ? "acknowledged"
                : "submitted",
            },
          ],
          rowCount: 1,
        };
      if (sql.includes("SELECT assigned_to"))
        return { rows: [{ assigned_to: "ops-unknown" }], rowCount: 1 };
      if (sql.includes("UPDATE safety.driver_sos_events")) {
        if (dutySnapshot.acknowledgedByActorId)
          return { rows: [], rowCount: 0 };
        dutySnapshot = JSON.parse(values![2] as string);
        return {
          rows: [{ duty_ack_snapshot: dutySnapshot, status: "acknowledged" }],
          rowCount: 1,
        };
      }
      if (sql === "COMMIT" && loseCommit) {
        loseCommit = false;
        throw new Error("lost COMMIT ACK");
      }
      return { rows: [], rowCount: 1 };
    });
    const verification = new DriverSosVerificationRepository({
      isEnabled: () => true,
      connect: async () => ({ query, release() {} }),
    } as never);
    const audit = new AuditNotificationService();
    const incident = new IncidentService(audit);
    const service = new DriverSosService(
      audit,
      incident,
      undefined,
      verification,
    );
    const sos = await submit(service);
    await expect(
      service.acknowledgeDuty(
        sos.event.sosEventId,
        {},
        identity("ops-unknown", "ops"),
      ),
    ).rejects.toMatchObject({ dutyCommitOutcome: "unknown" });
    expect(incident.getIncident(sos.receipt.incidentId).assignedTo).toBe(
      "ops-unknown",
    );
    expect(outbox(service, sos.event.sosEventId).status).toBe("pending");
    const retry = await service.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      identity("ops-unknown", "ops"),
    );
    expect(retry.event.sosEventId).toBe(sos.event.sosEventId);
    expect(retry.dutyAcknowledgement.acknowledgedByActorId).toBe("ops-unknown");
    expect(outbox(service, sos.event.sosEventId).status).toBe("acknowledged");
  });
});

it("does not let a rejected same-actor attempt clear an already committed canonical duty ACK", async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SELECT duty_ack_snapshot"))
      return { rows: [{ owner: "same-actor" }], rowCount: 1 };
    return { rows: [{ was_still_owner: true }], rowCount: 1 };
  });
  const repository = new IncidentRepository({
    isEnabled: () => true,
    query,
    connect: async () => ({ query, release() {} }),
  } as never);
  expect(
    await repository.revertAssignedToIfStillOwner(
      "same-incident",
      "same-actor",
      null,
      new Date().toISOString(),
      "same-sos-event",
    ),
  ).toBe(false);
  expect(
    query.mock.calls.some(([sql]) =>
      sql.includes("UPDATE ops.phase1_incidents"),
    ),
  ).toBe(false);
  expect(query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE"))).toBe(
    true,
  );
});
