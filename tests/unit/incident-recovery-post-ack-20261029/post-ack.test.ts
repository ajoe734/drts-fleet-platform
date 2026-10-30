import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { QueryResult, QueryResultRow } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import type { OpsDispatchStreamEventEnvelope } from "../../../packages/contracts/src";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import {
  deferred,
  SqlTransport,
} from "../incident-suppression-canonical-dispatch-flow-20261015/sql-transport";

// Use the API's installed real event bus and actual publisher without its
// optional external PG bridge. No listener/server or outbound contact starts.
const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { EventEmitter2 } = apiRequire("@nestjs/event-emitter") as {
  EventEmitter2: new () => ConstructorParameters<
    typeof OpsDispatchEventsService
  >[0];
};
const observations: unknown[] = [];
afterAll(() => {
  if (process.env.C046_ACK_OBSERVATIONS) {
    writeFileSync(
      process.env.C046_ACK_OBSERVATIONS,
      JSON.stringify(observations, null, 2) + "\n",
    );
  }
});

// External SQL IO SIM only. Delegate SQL, transaction snapshots and committed
// visibility to the original accepted transport; control only one write's IO.
class WriteControlledSqlTransport extends SqlTransport {
  writeControl: {
    entered: ReturnType<typeof deferred>;
    release: ReturnType<typeof deferred>;
    reject: boolean;
  } | null = null;
  controlledWrites: { connection: number; rejected: boolean }[] = [];

  override async execute<T extends QueryResultRow>(
    rows: SqlTransport["rows"],
    text: string,
    values: readonly unknown[],
    connection: number,
  ): Promise<QueryResult<T>> {
    if (
      text.includes("INSERT INTO ops.phase1_incidents") &&
      this.writeControl
    ) {
      const control = this.writeControl;
      this.writeControl = null;
      this.controlledWrites.push({ connection, rejected: control.reject });
      control.entered.resolve();
      await control.release.promise;
      if (control.reject)
        throw new Error("SIM canonical recovery incident write rejected");
    }
    return super.execute<T>(rows, text, values, connection);
  }
}

async function replica(sql?: WriteControlledSqlTransport) {
  const repository = sql ? new IncidentRepository(sql.database()) : undefined;
  const audit = new AuditNotificationService();
  const bus = new EventEmitter2();
  const events: OpsDispatchStreamEventEnvelope[] = [];
  bus.on("ops.dispatch", (event: OpsDispatchStreamEventEnvelope) =>
    events.push(event),
  );
  const publisher = new OpsDispatchEventsService(bus);
  const service = new IncidentService(audit, repository, publisher);
  await service.onModuleInit();
  const controller = new IncidentController(service, {} as never);
  return { repository, service, controller, audit, events };
}

type Replica = Awaited<ReturnType<typeof replica>>;
const command = {
  actionType: "passenger_recontact" as const,
  note: "SIM text task record only; no actual recontact performed.",
  actor: "SIM-C046-ops",
};
async function create(a: Replica) {
  return (
    await a.controller.createIncident({
      category: "vehicle_damage",
      severity: "medium",
      title: "SIM recovery persistence ACK qualification",
      description: "No real accident or outbound communication.",
      reportedBy: "SIM-C046-ops",
    })
  ).data;
}
async function setup() {
  const sql = new WriteControlledSqlTransport();
  const a = await replica(sql);
  const incident = await create(a);
  const b = await replica(sql);
  return { sql, a, b, incidentId: incident.incidentId };
}
function published(a: Replica, incidentId: string) {
  return {
    localActionIds: a.service
      .getServiceRecoveryActions(incidentId)
      .map((item) => item.actionId),
    localTimelineActions: a.service
      .getTimeline(incidentId)
      .map((item) => item.action),
    recoveryAudits: a.audit
      .getAuditLogsSnapshot()
      .filter(
        (item) =>
          item.resourceId === incidentId &&
          item.actionName === "record_service_recovery_action",
      ).length,
    updateEvents: a.events.filter(
      (item) =>
        item.subjectId === incidentId && item.eventType === "incident_updated",
    ).length,
  };
}
function errorOutcome(error: unknown) {
  return {
    ok: false as const,
    message: error instanceof Error ? error.message : String(error),
    ...(error && typeof error === "object" && "code" in error
      ? { code: error.code }
      : {}),
    ...(error &&
    typeof error === "object" &&
    "getStatus" in error &&
    typeof error.getStatus === "function"
      ? { status: error.getStatus() as number }
      : {}),
  };
}
async function outcome(a: Replica, incidentId: string, body = command) {
  return Promise.resolve()
    .then(() => a.controller.recordServiceRecoveryAction(incidentId, body))
    .then((envelope) => ({ ok: true as const, envelope }), errorOutcome);
}
async function canonicalAfter(
  a: Replica,
  incidentId: string,
  actionId: string,
) {
  let canonical = await a.repository!.loadIncident(incidentId);
  for (
    let i = 0;
    i < 20 &&
    !canonical?.serviceRecoveryActions.some(
      (item) => item.actionId === actionId,
    );
    i++
  ) {
    await Promise.resolve();
    canonical = await a.repository!.loadIncident(incidentId);
  }
  return canonical;
}

describe("normal service-recovery POST canonical commit before completion", () => {
  it("withholds ACK and local audit/event publication while the actual canonical write is held", async () => {
    const { sql, a, b, incidentId } = await setup();
    const control = { entered: deferred(), release: deferred(), reject: false };
    sql.writeControl = control;
    let acknowledged: { ok: boolean; actionId: string } | null = null;
    const request = Promise.resolve()
      .then(() =>
        a.controller.recordServiceRecoveryAction(
          incidentId,
          command,
          "SIM-C046-held",
        ),
      )
      .then((envelope) => {
        acknowledged = { ok: true, actionId: envelope.data.actionId };
        return envelope;
      });
    let whileHeld: unknown;
    let readerActionIds: string[] = [];
    let publicationWhileHeld: ReturnType<typeof published> | undefined;
    try {
      await control.entered.promise;
      await Promise.resolve();
      await Promise.resolve();
      whileHeld = acknowledged;
      publicationWhileHeld = published(a, incidentId);
      readerActionIds = (
        await b.controller.getServiceRecoveryActions(incidentId)
      ).data.items.map((item) => item.actionId);
    } finally {
      control.release.resolve();
    }
    const response = await request;
    const canonical = await canonicalAfter(
      a,
      incidentId,
      response.data.actionId,
    );
    const afterRelease =
      await b.controller.getServiceRecoveryActions(incidentId);
    observations.push({
      case: "canonical-write-held",
      acknowledgementWhileHeld: whileHeld,
      publicationWhileHeld,
      readerActionIdsWhileHeld: readerActionIds,
      postResponse: response,
      canonicalActionIds: canonical?.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      afterCommitPublication: published(a, incidentId),
      controlledWrites: sql.controlledWrites,
    });
    expect(readerActionIds).toEqual([]);
    expect(afterRelease.data.items).toEqual([response.data]);
    expect(whileHeld).toBeNull();
    expect(publicationWhileHeld).toEqual({
      localActionIds: [],
      localTimelineActions: ["incident_created"],
      recoveryAudits: 0,
      updateEvents: 0,
    });
    expect(published(a, incidentId)).toMatchObject({
      localActionIds: [response.data.actionId],
      recoveryAudits: 1,
      updateEvents: 1,
    });
    expect(response.meta.requestId).toBe("SIM-C046-held");
  });

  it("propagates rejected incident SQL with no optimistic local, audit or event publication", async () => {
    const { sql, a, b, incidentId } = await setup();
    const control = { entered: deferred(), release: deferred(), reject: true };
    sql.writeControl = control;
    control.release.resolve();
    const result = await outcome(a, incidentId);
    await control.entered.promise;
    const canonical = await a.repository!.loadIncident(incidentId);
    const reader = await b.controller.getServiceRecoveryActions(incidentId);
    observations.push({
      case: "canonical-write-rejected",
      result,
      canonicalActionIds: canonical?.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      readerActionIds: reader.data.items.map((item) => item.actionId),
      publication: published(a, incidentId),
      controlledWrites: sql.controlledWrites,
    });
    expect(result.ok).toBe(false);
    expect(reader.data.items).toEqual([]);
    expect(canonical?.serviceRecoveryActions).toEqual([]);
    expect(published(a, incidentId)).toEqual({
      localActionIds: [],
      localTimelineActions: ["incident_created"],
      recoveryAudits: 0,
      updateEvents: 0,
    });
  });

  it("preserves canonical and local state when the original transaction COMMIT is rejected", async () => {
    const { sql, a, b, incidentId } = await setup();
    const callStart = sql.calls.length;
    sql.rejectIncident = true; // Original transport rejects only COMMIT for an incident change.
    const result = await outcome(a, incidentId);
    const canonical = await a.repository!.loadIncident(incidentId);
    const reader = await b.controller.getServiceRecoveryActions(incidentId);
    const timeline = await b.controller.getTimeline(incidentId);
    observations.push({
      case: "COMMIT-rejected",
      result,
      publication: published(a, incidentId),
      canonicalActionIds: canonical?.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      readerActionIds: reader.data.items.map((item) => item.actionId),
      canonicalTimelineActions: timeline.data.items.map((item) => item.action),
      transactionCommands: sql.calls
        .slice(callStart)
        .filter((item) => ["BEGIN", "COMMIT", "ROLLBACK"].includes(item.text))
        .map((item) => item.text),
    });
    expect(result.ok).toBe(false);
    expect(canonical?.serviceRecoveryActions).toEqual([]);
    expect(reader.data.items).toEqual([]);
    expect(timeline.data.items.map((item) => item.action)).toEqual([
      "incident_created",
    ]);
    expect(published(a, incidentId)).toEqual({
      localActionIds: [],
      localTimelineActions: ["incident_created"],
      recoveryAudits: 0,
      updateEvents: 0,
    });
    expect(
      sql.calls.slice(callStart).some((item) => item.text === "ROLLBACK"),
    ).toBe(true);
  });

  it("appends to the locked canonical row despite an existing older local action map", async () => {
    const sql = new WriteControlledSqlTransport();
    const a = await replica(sql);
    const incidentId = (await create(a)).incidentId;
    const first = await a.controller.recordServiceRecoveryAction(incidentId, {
      ...command,
      note: "SIM first recorded task",
    });
    await canonicalAfter(a, incidentId, first.data.actionId);
    const b = await replica(sql); // B's actual map contains the first action.
    await a.controller.updateIncident(incidentId, { status: "investigating" });
    const second = await a.controller.recordServiceRecoveryAction(incidentId, {
      ...command,
      note: "SIM second recorded task",
    });
    await canonicalAfter(a, incidentId, second.data.actionId);
    expect(b.service.getServiceRecoveryActions(incidentId)).toEqual([
      first.data,
    ]);
    const third = await b.controller.recordServiceRecoveryAction(incidentId, {
      ...command,
      note: "SIM third recorded task",
    });
    const canonical = await canonicalAfter(b, incidentId, third.data.actionId);
    const reader = await a.controller.getServiceRecoveryActions(incidentId);
    observations.push({
      case: "stale-local-map-canonical-append",
      originalBLocalActionIds: [first.data.actionId],
      expectedActionIds: [
        first.data.actionId,
        second.data.actionId,
        third.data.actionId,
      ],
      canonicalActionIds: canonical?.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      canonicalStatus: canonical?.status,
      readerActionIds: reader.data.items.map((item) => item.actionId),
    });
    expect(canonical?.serviceRecoveryActions).toEqual([
      first.data,
      second.data,
      third.data,
    ]);
    expect(canonical?.status).toBe("investigating");
    expect(reader.data.items).toEqual([first.data, second.data, third.data]);
    expect(b.service.getServiceRecoveryActions(incidentId)).toEqual([
      first.data,
      second.data,
      third.data,
    ]);
  });

  it("uses canonical existence for an unknown local incident and preserves true missing404", async () => {
    const sql = new WriteControlledSqlTransport();
    const a = await replica(sql);
    const b = await replica(sql);
    const incidentId = (await create(a)).incidentId;
    const present = await outcome(b, incidentId);
    const missing = await outcome(b, "SIM-C046-never-created");
    const canonical = await b.repository!.loadIncident(incidentId);
    observations.push({
      case: "canonical-existence-not-local-cache",
      present,
      missing,
      canonicalActionIds: canonical?.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      localPublication: present.ok ? published(b, incidentId) : null,
    });
    expect(missing).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      status: 404,
    });
    expect(present.ok).toBe(true);
    if (!present.ok)
      throw new Error("Canonical incident POST was incorrectly rejected");
    expect(canonical?.serviceRecoveryActions).toEqual([present.envelope.data]);
    expect(published(b, incidentId)).toMatchObject({
      localActionIds: [present.envelope.data.actionId],
      recoveryAudits: 1,
      updateEvents: 1,
    });
    expect(
      b.audit
        .getAuditLogsSnapshot()
        .filter(
          (item) =>
            item.resourceId === "SIM-C046-never-created" &&
            item.actionName === "record_service_recovery_action",
        ),
    ).toEqual([]);
    expect(await b.repository!.loadIncidents()).toHaveLength(1);
  });

  it("preserves original validation, payload and defensive read copies", async () => {
    const { a, b, incidentId } = await setup();
    for (const invalid of [
      { ...command, actionType: "SIM-unsupported" },
      { ...command, note: " " },
      { ...command, actor: " " },
      { ...command, actionType: " " },
    ]) {
      const result = await Promise.resolve()
        .then(() =>
          a.controller.recordServiceRecoveryAction(
            incidentId,
            invalid as never,
          ),
        )
        .then(() => ({ ok: true }), errorOutcome);
      expect(result).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
        status: 400,
      });
    }
    const body = {
      actionType: "other" as const,
      actor: " SIM original actor ",
      note: " SIM original note ",
    };
    const response = await a.controller.recordServiceRecoveryAction(
      incidentId,
      body,
    );
    await canonicalAfter(a, incidentId, response.data.actionId);
    const read = await b.controller.getServiceRecoveryActions(incidentId);
    expect(response.data).toMatchObject({ ...body, incidentId });
    expect(read.data.items).toEqual([response.data]);
    read.data.items[0]!.note = "SIM caller mutation";
    expect(
      (await b.controller.getServiceRecoveryActions(incidentId)).data.items,
    ).toEqual([response.data]);
    observations.push({
      case: "original-validation-and-payload",
      invalidInputsRejected: 4,
      originalPayload: response.data,
    });
  });

  it("keeps the original noDB producer, POST envelope and reads synchronous", async () => {
    const a = await replica();
    const incidentId = (await create(a)).incidentId;
    const direct = a.service.recordServiceRecoveryAction(incidentId, command);
    expect(direct).not.toBeInstanceOf(Promise);
    const response = a.controller.recordServiceRecoveryAction(incidentId, {
      ...command,
      note: "SIM noDB second task",
    });
    expect(response).not.toBeInstanceOf(Promise);
    if (response instanceof Promise)
      throw new Error("Unexpected asynchronous noDB POST");
    const read = a.controller.getServiceRecoveryActions(incidentId);
    expect(read).not.toBeInstanceOf(Promise);
    if (read instanceof Promise)
      throw new Error("Unexpected asynchronous noDB GET");
    expect(read.data.items).toEqual([direct, response.data]);
    read.data.items[0]!.note = "SIM caller mutation";
    expect(a.service.getServiceRecoveryActions(incidentId)).toEqual([
      direct,
      response.data,
    ]);
    observations.push({
      case: "noDB-original-sync",
      directSync: true,
      controllerPostSync: true,
      controllerReadSync: true,
      publication: published(a, incidentId),
    });
  });
});
