import { describe, expect, it } from "vitest";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import { DriverSosService } from "../../../apps/api/src/modules/driver-sos/driver-sos.service";
import {
  OpsDriverSosController,
  DriverSosController,
} from "../../../apps/api/src/modules/driver-sos/driver-sos.controller";
import { DriverSosVerificationRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos-verification.repository";

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
    requestId: actorId,
  };
}
const driver = identity("driver-warm-replica", "driver");
const ops = identity("ops-warm-replica", "ops");
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
// Only persistence ports are controlled. Actual submit, service caches,
// normalization and all HTTP controller methods run. These cases prove discovery
// and read consumers, not SQL arbitration; the separate hosted test uses the
// production repositories and official PostgreSQL schema.
async function harness() {
  let stored: any = null;
  const clone = <T>(value: T): T => structuredClone(value);
  const incidentPort = {
    isEnabled: () => true,
    loadState: async () => ({
      incidents: stored ? [clone(stored.incident)] : [],
      timelines: stored ? clone(stored.incidentTimelines) : [],
      suppressions: [],
    }),
    loadIncidents: async () => (stored ? [clone(stored.incident)] : []),
    loadIncident: async (id: string) =>
      stored?.incident.incidentId === id ? clone(stored.incident) : null,
    loadTimeline: async (id: string) =>
      stored?.incident.incidentId === id ? clone(stored.incidentTimelines) : [],
    persistChanges: async (changes: any) => {
      for (const row of changes.incidents ?? []) stored.incident = clone(row);
      stored.incidentTimelines.push(...clone(changes.timelines ?? []));
      return {
        incidents: clone(changes.incidents ?? []),
        newClaims: (changes.incidents ?? []).map((row: any) => row.incidentId),
      };
    },
    reportPersistenceFailure: (error: unknown) => {
      throw error;
    },
  };
  const sosPort = {
    isEnabled: () => true,
    loadState: async () => ({
      events: stored ? [clone(stored.event)] : [],
      timelines: stored ? clone(stored.sosTimelines) : [],
      urgentAlertOutbox: stored ? [clone(stored.urgentAlertOutbox)] : [],
    }),
    persistSubmission: async (submission: any) => {
      stored = clone(submission);
      return { ...clone(submission), duplicate: false };
    },
    findEventIdByIncidentId: async (id: string) =>
      stored?.incident.incidentId === id ? stored.event.sosEventId : null,
    reloadEventState: async (id: string) =>
      stored?.event.sosEventId === id
        ? {
            event: clone(stored.event),
            timelines: clone(stored.sosTimelines),
            outbox: clone(stored.urgentAlertOutbox),
          }
        : null,
    reportPersistenceFailure: (error: unknown) => {
      throw error;
    },
  };
  async function replica() {
    const audit = new AuditNotificationService();
    const incident = new IncidentService(audit, incidentPort as never);
    const sos = new DriverSosService(
      audit,
      incident,
      sosPort as never,
      new DriverSosVerificationRepository(),
    );
    await incident.onModuleInit();
    await sos.onModuleInit();
    return {
      incident,
      sos,
      incidents: new IncidentController(incident, null as never),
      ops: new OpsDriverSosController(sos),
      driver: new DriverSosController(sos),
    };
  }
  const a = await replica();
  const b = await replica(); // Both modules are warm BEFORE the event exists.
  const submitted = await a.sos.submitSosEvent(
    {
      clientEventId: "d5911111-1111-4111-8111-111111111111",
      eventType: "traffic_accident",
      severity: "major",
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: false,
    },
    driver,
  );
  return { a, b, submitted, incidentPort, sosPort };
}

describe("new durable SOS on an already-running replica", () => {
  it.each([
    "list",
    "detail",
    "timeline",
    "ops-id",
    "ops-incident",
    "driver",
    "ack",
  ] as const)(
    "first warm request %s discovers the actual submission through its real controller",
    async (path) => {
      const { b, submitted } = await harness();
      const { sosEventId } = submitted.event;
      const { incidentId } = submitted.receipt;
      if (path === "list") {
        const result = await b.incidents.listIncidents("warm-list", ops);
        expect(result.data.items).toEqual([
          expect.objectContaining({ incidentId }),
        ]);
      } else if (path === "detail") {
        const result = await b.incidents.getIncident(
          incidentId,
          "warm-detail",
          ops,
        );
        expect(result.data.item.incidentId).toBe(incidentId);
      } else if (path === "timeline") {
        const result = await b.incidents.getTimeline(
          incidentId,
          "warm-timeline",
        );
        expect(result.data.items).toContainEqual(
          expect.objectContaining({ incidentId, action: "incident_created" }),
        );
      } else if (path === "ack") {
        const result = await b.ops.acknowledgeDuty(sosEventId, {}, ops);
        expect(result.data.wonAcknowledgement).toBe(true);
        expect(result.data.event.incidentId).toBe(incidentId);
        expect(result.data.dutyAcknowledgement.acknowledgedByActorId).toBe(
          ops.actorId,
        );
        expect(
          result.data.timeline.filter(
            (entry) => entry.eventType === "duty_acknowledged",
          ),
        ).toHaveLength(1);
      } else {
        const result =
          path === "ops-id"
            ? await b.ops.getSosEvent(sosEventId, ops)
            : path === "ops-incident"
              ? await b.ops.getSosEventByIncidentId(incidentId, ops)
              : await b.driver.getOwnSosEvent(sosEventId, driver);
        expect(result.data.event.sosEventId).toBe(sosEventId);
        expect(result.data.event.incidentId).toBe(incidentId);
        expect(
          result.data.event.dutyAcknowledgement.acknowledgedByActorId,
        ).toBeNull();
      }
    },
  );

  it("keeps wrong-driver misses private and does not invent unknown events", async () => {
    const { b, submitted } = await harness();
    await expect(
      b.driver.getOwnSosEvent(
        submitted.event.sosEventId,
        identity("driver-someone-else", "driver"),
      ),
    ).rejects.toMatchObject({ code: "DRIVER_SOS_EVENT_NOT_FOUND" });
    await expect(b.ops.getSosEvent("unknown-id", ops)).rejects.toMatchObject({
      code: "DRIVER_SOS_EVENT_NOT_FOUND",
    });
    expect(
      (await b.driver.getOwnSosEvent(submitted.event.sosEventId, driver)).data
        .event.sosEventId,
    ).toBe(submitted.event.sosEventId);
  });

  it("does not overwrite an in-flight local record or timeline with an older GET snapshot", async () => {
    const { b, submitted, incidentPort } = await harness();
    const id = submitted.receipt.incidentId;
    await b.incidents.getIncident(id, "discover", ops);
    await b.incidents.getTimeline(id);
    const rows = await incidentPort.loadIncidents();
    const entries = await incidentPort.loadTimeline(id);
    const recordsRead = deferred<typeof rows>();
    const timelineRead = deferred<typeof entries>();
    incidentPort.loadIncidents = () => recordsRead.promise;
    incidentPort.loadTimeline = () => timelineRead.promise;
    const list = b.incidents.listIncidents("in-flight", ops);
    const timeline = b.incidents.getTimeline(id);
    b.incident.updateIncident(
      id,
      { status: "investigating" },
      "local-mutation",
      ops,
    );
    recordsRead.resolve(rows);
    timelineRead.resolve(entries);
    await Promise.all([list, timeline]);
    expect(b.incident.getIncident(id).status).toBe("investigating");
    expect(b.incident.getTimeline(id)).toContainEqual(
      expect.objectContaining({ action: "status_changed" }),
    );
    expect(
      (await b.sos.getEventForOps(submitted.event.sosEventId, ops)).event
        .status,
    ).toBe("investigating");
  });

  it("keeps a pending same-instance ownership reservation while a GET sees its older durable owner", async () => {
    const { b, submitted, incidentPort } = await harness();
    const id = submitted.receipt.incidentId;
    await b.incidents.getIncident(id, "discover", ops);
    const completion = deferred<any>();
    let attempted: any;
    incidentPort.persistChanges = async (changes: any) => {
      attempted = changes.incidents[0];
      return completion.promise;
    };
    const claim = b.incident.assignIncidentOwnerDurable(
      id,
      ops.actorId!,
      "pending-owner",
      ops,
    );
    expect(b.incident.getIncident(id).assignedTo).toBe(ops.actorId);
    const read = await b.incidents.listIncidents("older-durable-read", ops);
    expect(read.data.items[0]!.assignedTo).toBeNull();
    expect(b.incident.getIncident(id).assignedTo).toBe(ops.actorId);
    completion.resolve({ incidents: [attempted], newClaims: [id] });
    expect((await claim).accepted).toBe(true);
  });

  it("propagates durable read failures instead of reporting an empty list or a successful cache fallback", async () => {
    const { b, incidentPort, sosPort, submitted } = await harness();
    incidentPort.loadIncidents = async () => {
      throw new Error("database read unavailable");
    };
    sosPort.reloadEventState = async () => {
      throw new Error("database read unavailable");
    };
    await expect(b.incidents.listIncidents("failed-read", ops)).rejects.toThrow(
      "database read unavailable",
    );
    await expect(
      b.ops.getSosEvent(submitted.event.sosEventId, ops),
    ).rejects.toThrow("database read unavailable");
  });
});
