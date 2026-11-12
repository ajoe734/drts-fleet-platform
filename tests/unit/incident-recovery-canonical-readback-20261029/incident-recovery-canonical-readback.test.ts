import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import {
  deferred,
  SqlTransport,
} from "../incident-suppression-canonical-dispatch-flow-20261015/sql-transport";

// External SQL transport is SIM. All incident producers, read facades, repository
// SQL, controller envelopes and domain decisions below are the frozen products.
const observations: unknown[] = [];
afterAll(() => {
  if (!process.env.C046_OBSERVATION_FILE) return;
  writeFileSync(
    process.env.C046_OBSERVATION_FILE,
    JSON.stringify(observations, null, 2) + "\n",
  );
});

// These controls affect only the external SQL boundary. No fake Incident
// service/repository/cache or domain producer is used.
class ReadControlledSqlTransport extends SqlTransport {
  rejectIncidentRead = false;
  heldRead: {
    entered: ReturnType<typeof deferred>;
    release: ReturnType<typeof deferred>;
  } | null = null;

  override async query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const incidentRead = text.startsWith(
      "SELECT record FROM ops.phase1_incidents WHERE incident_id = $1",
    );
    if (incidentRead && this.rejectIncidentRead) {
      throw new Error("SIM canonical incident SQL read unavailable");
    }
    const result = await super.query<T>(text, values);
    const held = incidentRead ? this.heldRead : null;
    if (held) {
      this.heldRead = null;
      held.entered.resolve();
      await held.release.promise;
    }
    return result;
  }
}

function errorOutcome(error: unknown) {
  return {
    ok: false as const,
    name: error instanceof Error ? error.name : String(error),
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

async function replica(sql: SqlTransport) {
  const repository = new IncidentRepository(sql.database());
  const service = new IncidentService(
    new AuditNotificationService(),
    repository,
  );
  await service.onModuleInit();
  const controller = new IncidentController(service, {} as never);
  return { repository, service, controller };
}

async function create(controller: IncidentController) {
  const envelope = await controller.createIncident({
    category: "vehicle_damage",
    severity: "medium",
    title: "SIM C046 recovery readback",
    description:
      "Socket-free qualification; no real accident or outbound call.",
    reportedBy: "SIM-C046-ops",
  });
  return envelope.data;
}

async function recordAndWait(
  owner: Awaited<ReturnType<typeof replica>>,
  incidentId: string,
) {
  const action = (
    await owner.controller.recordServiceRecoveryAction(incidentId, {
      actionType: "passenger_recontact",
      note: "SIM recorded recontact task; no actual outbound communication.",
      actor: "SIM-C046-ops",
    })
  ).data;
  // Await the normal POST envelope before reading its action. Keep the separate
  // canonical readback below as the fixture's committed-visibility check.
  for (let attempt = 0; attempt < 30; attempt++) {
    const committed = await owner.repository.loadIncident(incidentId);
    if (
      committed?.serviceRecoveryActions?.some(
        (item) => item.actionId === action.actionId,
      )
    ) {
      return { action, committed };
    }
    await Promise.resolve();
  }
  throw new Error(
    "SIM setup failed: normal recovery action not canonically visible",
  );
}

describe("normal Ops incident canonical readback across warm replicas", () => {
  it("preserves canonical normal list, detail and timeline after A commits an update", async () => {
    const sql = new SqlTransport();
    const a = await replica(sql);
    const incident = await create(a.controller);
    const b = await replica(sql);
    const empty = await b.controller.getServiceRecoveryActions(
      incident.incidentId,
      "SIM-C046-empty",
    );
    expect(empty.data.items).toEqual([]);
    await a.controller.updateIncident(incident.incidentId, {
      status: "investigating",
    });

    const list = await b.controller.listIncidents();
    const detail = await b.controller.getIncident(incident.incidentId);
    const timeline = await b.controller.getTimeline(incident.incidentId);
    observations.push({
      case: "existing-primary-readfacades",
      localStatus: b.service.getIncident(incident.incidentId).status,
      canonicalListStatus: list.data.items.find(
        (item) => item.incidentId === incident.incidentId,
      )?.status,
      canonicalDetailStatus: detail.data.item.status,
      canonicalTimelineActions: timeline.data.items.map((item) => item.action),
    });
    expect(
      list.data.items.find((item) => item.incidentId === incident.incidentId)
        ?.status,
    ).toBe("investigating");
    expect(detail.data.item.status).toBe("investigating");
    expect(
      timeline.data.items.some((entry) => entry.action === "status_changed"),
    ).toBe(true);
  });

  it("returns committed recovery records on the normal GET when B already knew the incident", async () => {
    const sql = new SqlTransport();
    const a = await replica(sql);
    const incident = await create(a.controller);
    const b = await replica(sql);
    const { action, committed } = await recordAndWait(a, incident.incidentId);

    // This is the normal Ops detail page request order. Its detached canonical
    // primary read intentionally does not overwrite B's existing command cache.
    const detail = await b.controller.getIncident(incident.incidentId);
    const timeline = await b.controller.getTimeline(incident.incidentId);
    const recovery = await b.controller.getServiceRecoveryActions(
      incident.incidentId,
      "SIM-C046-recovery",
    );
    observations.push({
      case: "known-warm-replica-recovery",
      committedActionIds: committed.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      canonicalDetailActionIds: detail.data.item.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      canonicalTimelineActions: timeline.data.items.map((item) => item.action),
      normalRecoveryActionIds: recovery.data.items.map((item) => item.actionId),
    });
    expect(detail.data.item.serviceRecoveryActions).toEqual([action]);
    expect(
      timeline.data.items.some(
        (entry) => entry.action === "service_recovery_action",
      ),
    ).toBe(true);
    expect(recovery.data.items).toEqual([action]);
    expect(recovery.meta.requestId).toBe("SIM-C046-recovery");
    expect(recovery.data.items[0]).toMatchObject({
      actor: "SIM-C046-ops",
      actionType: "passenger_recontact",
      incidentId: incident.incidentId,
    });
    recovery.data.items[0]!.note =
      "SIM caller mutation must not alter stored or command state";
    const reread = await b.controller.getServiceRecoveryActions(
      incident.incidentId,
    );
    expect(reread.data.items).toEqual([action]);
    expect(
      (await b.repository.loadIncident(incident.incidentId))
        ?.serviceRecoveryActions,
    ).toEqual([action]);
    expect(b.service.getServiceRecoveryActions(incident.incidentId)).toEqual(
      [],
    );
  });

  it("discovers an incident committed after B initialized through the normal recovery GET", async () => {
    const sql = new SqlTransport();
    const a = await replica(sql);
    const b = await replica(sql);
    const incident = await create(a.controller);
    const { action, committed } = await recordAndWait(a, incident.incidentId);
    const unrelated = await create(a.controller);
    await recordAndWait(a, unrelated.incidentId);

    const outcome = await Promise.resolve()
      .then(() => b.controller.getServiceRecoveryActions(incident.incidentId))
      .then(
        (envelope) => ({ ok: true as const, items: envelope.data.items }),
        errorOutcome,
      );
    observations.push({
      case: "unknown-warm-replica-recovery",
      committedIncidentId: committed.incidentId,
      committedActionIds: committed.serviceRecoveryActions.map(
        (item) => item.actionId,
      ),
      normalRecoveryOutcome: outcome,
    });
    expect(outcome).toEqual({ ok: true, items: [action] });
  });

  it("preserves the normal 404 when the canonical incident does not exist", async () => {
    const b = await replica(new SqlTransport());
    const outcome = await Promise.resolve()
      .then(() =>
        b.controller.getServiceRecoveryActions("SIM-C046-never-created"),
      )
      .then(() => ({ ok: true as const }), errorOutcome);
    observations.push({ case: "canonical-missing", outcome });
    expect(outcome).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("propagates a canonical SQL read failure instead of returning empty success", async () => {
    const sql = new ReadControlledSqlTransport();
    const a = await replica(sql);
    const incident = await create(a.controller);
    const b = await replica(sql);
    sql.rejectIncidentRead = true;
    const outcome = await Promise.resolve()
      .then(() => b.controller.getServiceRecoveryActions(incident.incidentId))
      .then(() => ({ ok: true as const }), errorOutcome);
    observations.push({ case: "canonical-read-error", outcome });
    expect(outcome).toMatchObject({
      ok: false,
      message: "SIM canonical incident SQL read unavailable",
    });
  });

  it("preserves synchronous noDB reads, original payload, copies and missing behavior", () => {
    const service = new IncidentService(new AuditNotificationService());
    const controller = new IncidentController(service, {} as never);
    const created = controller.createIncident({
      category: "vehicle_damage",
      severity: "medium",
      title: "SIM noDB recovery",
      description: "No external call or real accident",
      reportedBy: "SIM-C046-noDB",
    });
    expect(created).not.toBeInstanceOf(Promise);
    if (created instanceof Promise)
      throw new Error("Unexpected noDB async create");
    const incidentId = created.data.incidentId;
    const actionEnvelope = controller.recordServiceRecoveryAction(incidentId, {
      actionType: "passenger_recontact",
      note: "SIM task note only",
      actor: "SIM-C046-noDB",
    });
    if (actionEnvelope instanceof Promise)
      throw new Error("Unexpected noDB async recovery action");
    const action = actionEnvelope.data;
    const recovery = controller.getServiceRecoveryActions(incidentId);
    expect(recovery).not.toBeInstanceOf(Promise);
    if (recovery instanceof Promise)
      throw new Error("Unexpected noDB async recovery");
    expect(recovery.data.items).toEqual([action]);
    recovery.data.items[0]!.note = "SIM caller mutation";
    expect(service.getServiceRecoveryActions(incidentId)).toEqual([action]);
    expect(() =>
      controller.getServiceRecoveryActions("SIM-C046-noDB-missing"),
    ).toThrow();
    observations.push({
      case: "noDB-sync-preserved",
      actionType: action.actionType,
      actor: action.actor,
      synchronous: true,
    });
  });

  it("keeps a delayed detached read from replacing a newer normal local recovery write", async () => {
    const sql = new ReadControlledSqlTransport();
    const a = await replica(sql);
    const incident = await create(a.controller);
    const b = await replica(sql);
    const held = { entered: deferred(), release: deferred() };
    sql.heldRead = held;
    const pending = Promise.resolve(
      b.controller.getServiceRecoveryActions(incident.incidentId),
    );
    const first = await Promise.race([
      held.entered.promise.then(() => "canonical-read-held"),
      pending.then(() => "completed-without-canonical-read"),
    ]);
    expect(first).toBe("canonical-read-held");
    const { action } = await recordAndWait(b, incident.incidentId);
    held.release.resolve();
    const earlierSnapshot = await pending;
    expect(earlierSnapshot.data.items).toEqual([]);
    expect(b.service.getServiceRecoveryActions(incident.incidentId)).toEqual([
      action,
    ]);
    const latest = await b.controller.getServiceRecoveryActions(
      incident.incidentId,
    );
    expect(latest.data.items).toEqual([action]);
    observations.push({
      case: "delayed-read-no-cache-publication",
      priorReadCount: earlierSnapshot.data.items.length,
      preservedLocalActionId: action.actionId,
      latestActionIds: latest.data.items.map((item) => item.actionId),
    });
  });
});
