import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { IncidentRecord } from "@drts/contracts";
import { DatabaseService } from "../../../apps/api/src/common/db";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import {
  DriverSosController,
  OpsDriverSosController,
} from "../../../apps/api/src/modules/driver-sos/driver-sos.controller";
import { DriverSosRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos.repository";
import { DriverSosService } from "../../../apps/api/src/modules/driver-sos/driver-sos.service";
import { DriverSosVerificationRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos-verification.repository";

// The existing mandatory ci-integ unit shards migrate the official schema.
// This guard is deliberately hosted-only: never open PostgreSQL on the VM.
const hosted =
  process.env.GITHUB_ACTIONS === "true" && Boolean(process.env.DATABASE_URL);
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
    roles: [realm === "driver" ? "driver_user" : "ops_dispatcher"],
    roleFamilies: [realm],
    scopes: ["incident:read", "incident:write", "driver:read", "driver:write"],
    requestId: `req-${actorId}`,
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function baseline(): IncidentRecord {
  const service = new IncidentService(new AuditNotificationService());
  return {
    ...service.createIncident({
      title: "SOS ownership race",
      reportedBy: "system.sos-pg-fixture",
      description: "Official-schema isolated ownership fixture",
      category: "safety",
      severity: "high",
    }),
    incidentId: `SOS-PG-${randomUUID()}`,
  };
}
async function cleanup(database: DatabaseService, incidentId: string) {
  await database.query(
    "DELETE FROM ops.phase1_incident_timelines WHERE incident_id = $1",
    [incidentId],
  );
  await database.query(
    "DELETE FROM ops.phase1_driver_matching_suppressions WHERE source_incident_id = $1",
    [incidentId],
  );
  await database.query(
    "DELETE FROM ops.phase1_incidents WHERE incident_id = $1",
    [incidentId],
  );
}

describe.skipIf(!hosted)(
  "SOS official-schema production repository races (hosted only)",
  () => {
    it("preserves null ownership across equal-time carrying writes in both orders and accepts a legitimate same-time claim", async () => {
      const database = new DatabaseService();
      const repository = new IncidentRepository(database);
      const original = baseline();
      const carrying = {
        ...original,
        assignedTo: "rejected",
        status: "investigating" as const,
      };
      try {
        await repository.persistChanges({ incidents: [original] });
        await repository.revertAssignedToIfStillOwner(
          original.incidentId,
          "rejected",
          null,
          original.updatedAt,
        );
        await repository.persistChanges({ incidents: [carrying] });
        let actual = await repository.loadIncident(original.incidentId);
        expect(actual?.assignedTo).toBeNull();
        expect(actual?.status).toBe("investigating");
        await repository.persistChanges({ incidents: [carrying] });
        await repository.revertAssignedToIfStillOwner(
          original.incidentId,
          "rejected",
          null,
          original.updatedAt,
        );
        actual = await repository.loadIncident(original.incidentId);
        expect(actual?.assignedTo).toBeNull();
        expect(actual?.status).toBe("investigating");
        const service = new IncidentService(
          new AuditNotificationService(),
          repository,
        );
        service.registerPersistedIncident(original, []);
        const claim = await service.assignIncidentOwnerDurable(
          original.incidentId,
          "legitimate",
          "pg-claim",
          identity("legitimate", "ops"),
        );
        expect(claim).toMatchObject({
          accepted: true,
          currentOwner: "legitimate",
          wasNewClaim: true,
        });
        actual = await repository.loadIncident(original.incidentId);
        expect(actual?.assignedTo).toBe("legitimate");
        expect(actual?.status).toBe("investigating"); // narrow claim does not overwrite independent status
        await repository.persistChanges({ incidents: [carrying] });
        actual = await repository.loadIncident(original.incidentId);
        expect(actual?.assignedTo).toBe("legitimate");
        expect(actual?.status).toBe("investigating");
      } finally {
        await cleanup(database, original.incidentId);
        await database.onModuleDestroy();
      }
    });

    it("rechecks the locked current row after a legitimate newer owner commits while compensation is waiting", async () => {
      const database = new DatabaseService();
      const repository = new IncidentRepository(database);
      const original = {
        ...baseline(),
        assignedTo: "owner-A",
        updatedAt: "2026-10-18T01:00:00.000Z",
      };
      const writerAt = "2026-10-18T01:00:02.000Z";
      const compensationAt = "2026-10-18T01:00:01.000Z";
      const writerReady = deferred();
      const releaseWriter = deferred();
      const realConnect = database.connect.bind(database);
      let writer: Promise<unknown> | undefined;
      let compensation: Promise<boolean> | undefined;
      const compensationClient = await realConnect();
      const pid = (
        await compensationClient.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        )
      ).rows[0]!.pid;
      const blockedRepository = new IncidentRepository({
        isEnabled: () => true,
        query: compensationClient.query.bind(compensationClient),
      } as never);
      const writerDatabase = {
        isEnabled: () => true,
        connect: async () => {
          const client = await realConnect();
          const query = client.query.bind(client);
          return new Proxy(client, {
            get(target, key) {
              if (key === "query")
                return async (sql: string, values?: unknown[]) => {
                  if (sql === "COMMIT") {
                    writerReady.resolve();
                    await releaseWriter.promise;
                  }
                  return query(sql, values);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      };
      try {
        await repository.persistChanges({ incidents: [original] });
        const newer = {
          ...original,
          assignedTo: "owner-B",
          status: "investigating" as const,
          updatedAt: writerAt,
        };
        writer = new IncidentRepository(writerDatabase as never).persistChanges(
          { incidents: [newer] },
          {
            assignIntentIncidentIds: [original.incidentId],
            forceAssignmentIncidentIds: [original.incidentId],
            assignmentOnlyIncidentIds: [original.incidentId],
          },
        );
        await Promise.race([
          writerReady.promise,
          writer.then(() => {
            throw new Error(
              "Writer completed without its expected COMMIT boundary",
            );
          }),
        ]); // actual production UPDATE holds its row lock, before COMMIT
        compensation = blockedRepository.revertAssignedToIfStillOwner(
          original.incidentId,
          "owner-A",
          null,
          compensationAt,
        );
        // Observe the actual waiter, not a sleep-based guess about scheduling.
        const deadline = Date.now() + 3000;
        let waiting = false;
        while (!waiting && Date.now() < deadline) {
          const state = await database.query<{ waiting: boolean }>(
            "SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = $1",
            [pid],
          );
          waiting = state.rows[0]?.waiting === true;
          if (!waiting) await new Promise((done) => setTimeout(done, 10));
        }
        expect(waiting).toBe(true);
        releaseWriter.resolve();
        await writer;
        expect(await compensation).toBe(false);
        const actual = await repository.loadIncident(original.incidentId);
        expect(actual?.assignedTo).toBe("owner-B");
        expect(Date.parse(actual!.updatedAt)).toBeGreaterThanOrEqual(
          Date.parse(writerAt),
        );
        expect(
          await repository.revertAssignedToIfStillOwner(
            original.incidentId,
            "owner-B",
            null,
            writerAt,
          ),
        ).toBe(true);
        expect(
          (await repository.loadIncident(original.incidentId))?.assignedTo,
        ).toBeNull();
      } finally {
        releaseWriter.resolve();
        await writer?.catch(() => undefined);
        await compensation?.catch(() => undefined);
        compensationClient.release();
        await cleanup(database, original.incidentId);
        await database.onModuleDestroy();
      }
    }, 15000);

    it("keeps one real duty ACK/outbox/current owner across instances, COMMIT-ACK loss, replay and restart", async () => {
      const database = new DatabaseService();
      const incidentRepository = new IncidentRepository(database);
      const repository = new DriverSosRepository(database);
      let loseCommitAck = true;
      const realConnect = database.connect.bind(database);
      const verification = new DriverSosVerificationRepository({
        isEnabled: () => true,
        connect: async () => {
          const client = await realConnect();
          const query = client.query.bind(client);
          return new Proxy(client, {
            get(target, key) {
              if (key === "query")
                return async (sql: string, values?: unknown[]) => {
                  const result = await query(sql, values);
                  if (sql === "COMMIT" && loseCommitAck) {
                    loseCommitAck = false;
                    throw new Error("injected lost duty COMMIT ACK");
                  }
                  return result;
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        },
      } as never);
      const audit = new AuditNotificationService();
      const incident = new IncidentService(audit, incidentRepository);
      const service = new DriverSosService(
        audit,
        incident,
        repository,
        verification,
      );
      const driver = identity(`driver-pg-${randomUUID()}`, "driver");
      const actor = identity(`ops-pg-${randomUUID()}`, "ops");
      let eventId: string | undefined;
      let incidentId: string | undefined;
      try {
        await incident.onModuleInit();
        await service.onModuleInit();
        const submitted = await service.submitSosEvent(
          {
            clientEventId: randomUUID(),
            eventType: "traffic_accident",
            severity: "major",
            originalTriggeredAt: new Date().toISOString(),
            offlineAtTrigger: false,
          },
          driver,
        );
        eventId = submitted.event.sosEventId;
        incidentId = submitted.receipt.incidentId;
        await expect(
          service.acknowledgeDuty(eventId, {}, actor),
        ).rejects.toMatchObject({ dutyCommitOutcome: "unknown" });
        expect(
          (await incidentRepository.loadIncident(incidentId))?.assignedTo,
        ).toBe(actor.actorId);
        const durable = await repository.reloadEventState(eventId);
        expect(durable?.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
          actor.actorId,
        );
        expect(durable?.outbox?.status).toBe("acknowledged");
        expect(durable?.outbox?.deliveredAt).toBeNull();
        const otherIncident = new IncidentService(audit, incidentRepository);
        const restarted = new DriverSosService(
          audit,
          otherIncident,
          repository,
          new DriverSosVerificationRepository(database),
        );
        await otherIncident.onModuleInit();
        await restarted.onModuleInit();
        const [sameOwner, competitor] = await Promise.all([
          restarted.acknowledgeDuty(eventId, {}, actor),
          service.acknowledgeDuty(
            eventId,
            {},
            identity("ops-pg-competitor", "ops"),
          ),
        ]);
        expect(sameOwner.wonAcknowledgement).toBe(true);
        expect(competitor.wonAcknowledgement).toBe(false);
        expect(competitor.dutyAcknowledgement.acknowledgedByActorId).toBe(
          actor.actorId,
        );
        await restarted.recordOpsAlertsRendered(
          { incidentIds: [incidentId], renderedAt: new Date().toISOString() },
          actor,
        );
        const readback = await restarted.getOwnEventForDriver(eventId, driver);
        expect(readback.event.sosEventId).toBe(eventId);
        expect(readback.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
          actor.actorId,
        );
        expect(
          readback.timeline.filter(
            (entry) => entry.eventType === "duty_acknowledged",
          ),
        ).toHaveLength(1);
        // A late known-rejected attempt by the SAME actor must not clear
        // the other instance's actual committed ACK/current owner.
        await incident.releaseIncidentOwnerClaim(
          incidentId,
          actor.actorId!,
          "late-same-owner-release",
          actor,
          eventId,
        );
        const final = await repository.reloadEventState(eventId);
        expect(final?.outbox?.status).toBe("acknowledged");
        expect(final?.outbox?.opsAlertRenderedAt).not.toBeNull();
        expect(
          (await incidentRepository.loadIncident(incidentId))?.assignedTo,
        ).toBe(actor.actorId);
      } finally {
        if (eventId)
          await database.query(
            "DELETE FROM safety.driver_sos_events WHERE sos_event_id = $1",
            [eventId],
          );
        if (incidentId) await cleanup(database, incidentId);
        await database.onModuleDestroy();
      }
    }, 15000);

    it("discovers a later submission on seven already-running replicas through the actual first GET and ACK controllers", async () => {
      const database = new DatabaseService();
      const incidentRepository = new IncidentRepository(database);
      const repository = new DriverSosRepository(database);
      const audit = new AuditNotificationService();
      async function replica() {
        const incident = new IncidentService(audit, incidentRepository);
        const sos = new DriverSosService(
          audit,
          incident,
          repository,
          new DriverSosVerificationRepository(database),
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
      const driver = identity(`driver-warm-pg-${randomUUID()}`, "driver");
      const actor = identity(`ops-warm-pg-${randomUUID()}`, "ops");
      let eventId: string | undefined;
      let incidentId: string | undefined;
      try {
        const a = await replica();
        const warm = await Promise.all(
          Array.from({ length: 7 }, () => replica()),
        );
        const submitted = await a.sos.submitSosEvent(
          {
            clientEventId: randomUUID(),
            eventType: "traffic_accident",
            severity: "major",
            originalTriggeredAt: new Date().toISOString(),
            offlineAtTrigger: false,
          },
          driver,
        );
        eventId = submitted.event.sosEventId;
        incidentId = submitted.receipt.incidentId;
        expect(
          (await warm[0]!.incidents.listIncidents("warm-pg-list", actor)).data
            .items,
        ).toContainEqual(expect.objectContaining({ incidentId }));
        expect(
          (
            await warm[1]!.incidents.getIncident(
              incidentId,
              "warm-pg-detail",
              actor,
            )
          ).data.item.incidentId,
        ).toBe(incidentId);
        expect(
          (await warm[2]!.incidents.getTimeline(incidentId, "warm-pg-timeline"))
            .data.items,
        ).toContainEqual(
          expect.objectContaining({ incidentId, action: "incident_created" }),
        );
        expect(
          (await warm[3]!.ops.getSosEvent(eventId, actor)).data.event
            .sosEventId,
        ).toBe(eventId);
        expect(
          (await warm[4]!.ops.getSosEventByIncidentId(incidentId, actor)).data
            .event.sosEventId,
        ).toBe(eventId);
        expect(
          (await warm[5]!.driver.getOwnSosEvent(eventId, driver)).data.event
            .dutyAcknowledgement.acknowledgedByActorId,
        ).toBeNull();
        const ack = (await warm[6]!.ops.acknowledgeDuty(eventId, {}, actor))
          .data;
        expect(ack.wonAcknowledgement).toBe(true);
        expect(ack.event.incidentId).toBe(incidentId);
        const readback = (await warm[5]!.driver.getOwnSosEvent(eventId, driver))
          .data;
        expect(readback.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
          actor.actorId,
        );
        expect(
          readback.timeline.filter(
            (entry) => entry.eventType === "duty_acknowledged",
          ),
        ).toHaveLength(1);
        expect(
          (await warm[1]!.incidents.getIncident(incidentId, "after-ack", actor))
            .data.item.assignedTo,
        ).toBe(actor.actorId);
        expect(
          (await repository.reloadEventState(eventId))?.outbox?.status,
        ).toBe("acknowledged");
        await expect(
          warm[0]!.driver.getOwnSosEvent(
            eventId,
            identity("wrong-warm-driver", "driver"),
          ),
        ).rejects.toMatchObject({ code: "DRIVER_SOS_EVENT_NOT_FOUND" });
      } finally {
        if (eventId)
          await database.query(
            "DELETE FROM safety.driver_sos_events WHERE sos_event_id = $1",
            [eventId],
          );
        if (incidentId) await cleanup(database, incidentId);
        await database.onModuleDestroy();
      }
    }, 15000);
  },
);
