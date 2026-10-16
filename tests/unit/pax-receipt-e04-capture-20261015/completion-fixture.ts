import { EventEmitter } from "node:events";
import { vi } from "vitest";
import type { DriverCompleteTaskCommand } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";

type Row = Record<string, unknown>;
export const command: DriverCompleteTaskCommand = {
  completedAt: "2026-04-10T09:45:00Z",
  actualDistanceKm: 22.4,
  actualDurationSec: 2100,
  fare: { currency: "NTD", amountMinor: 10000 },
  proof: { photos: [] },
  actualFareBreakdown: {
    startMinor: 3500,
    distanceMinor: 4500,
    delayMinor: 1000,
    nightMinor: 1000,
  },
};

// Only SQL/event transports are fixtures. Profile/repositories/registry,
// completion, reconciliation, proof, replay, event and outbox code are real.
function sqlTransport(initial: Record<string, Row[]> = {}) {
  const primaryKeys: Record<string, string> = {
    "ops.phase1_owned_orders": "orderId",
    "ops.phase1_dispatch_jobs": "dispatchJobId",
    "ops.phase1_dispatch_assignments": "assignmentId",
    "ops.phase1_driver_tasks": "taskId",
    "ops.phase1_driver_profiles": "driverId",
  };
  let records = new Map<string, Map<string, Row>>(
    Object.entries(initial).map(([table, rows]) => [
      table,
      new Map(
        rows.map((row) => [
          String(row[primaryKeys[table]!]),
          structuredClone(row),
        ]),
      ),
    ]),
  );
  let staged: typeof records | null = null;
  let rejectCommit = false;
  let pauseWrite: (() => Promise<void>) | null = null;
  const outbox: Row[] = [];
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    queries.push({ sql, values: structuredClone(values) });
    if (sql === "BEGIN") {
      staged = structuredClone(records);
      return { rows: [], rowCount: 0 };
    }
    if (sql === "COMMIT") {
      if (rejectCommit) throw new Error("fixture COMMIT rejected");
      if (staged) records = staged;
      staged = null;
      return { rows: [], rowCount: 0 };
    }
    if (sql === "ROLLBACK") {
      staged = null;
      outbox.length = 0;
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("SET LOCAL ")) return { rows: [], rowCount: 0 };
    const data = staged ?? records;
    if (
      sql.startsWith("SELECT EXISTS") &&
      sql.includes("phase1_dispatch_trace_logs")
    ) {
      const matched = [
        ...(data.get("ops.phase1_dispatch_trace_logs")?.values() ?? []),
      ].some((row) => {
        const details = row.details as Row;
        return (
          row.orderId === values[0] &&
          row.eventType === values[1] &&
          details.taskId === values[2] &&
          details.requestId === values[3]
        );
      });
      return { rows: [{ matched }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT record")) {
      const table = /FROM ([\w.]+)/.exec(sql)?.[1];
      if (!table) throw new Error(`Unexpected fixture SELECT: ${sql}`);
      let id = values[0];
      if (
        table === "ops.phase1_dispatch_assignments" &&
        sql.includes("SELECT assignment_id")
      ) {
        id = data.get("ops.phase1_driver_tasks")?.get(String(id))?.assignmentId;
      }
      const rows = values.length
        ? [data.get(table)?.get(String(id))].filter((row): row is Row => !!row)
        : [...(data.get(table)?.values() ?? [])];
      return {
        rows: rows.map((record) => ({ record: structuredClone(record) })),
        rowCount: rows.length,
      };
    }
    if (sql.startsWith("INSERT INTO ")) {
      const table = /INSERT INTO ([\w.]+)/.exec(sql)![1]!;
      if (table === "ops.phase1_owned_orders" && pauseWrite) {
        const hook = pauseWrite;
        pauseWrite = null;
        await hook();
      }
      const json = values.find(
        (value) => typeof value === "string" && value.startsWith("{"),
      );
      if (typeof json !== "string")
        throw new Error(`Missing actual repository JSON in ${sql}`);
      const record = JSON.parse(json) as Row;
      if (!data.has(table)) data.set(table, new Map());
      data.get(table)!.set(String(values[0]), record);
      if (table === "ops.driver_completion_outbox") {
        outbox.push({
          outboxId: values[0],
          taskId: values[1],
          orderId: values[2],
          effectType: values[3],
          requestId: values[4],
          payload: record,
        });
      }
      return {
        rows:
          table === "ops.consumer_notification_outbox"
            ? [{ outbox_id: values[0] }]
            : [],
        rowCount: 1,
      };
    }
    if (
      sql.startsWith("UPDATE mobility.phase1_partner_notification_sequences")
    ) {
      // This fixture order has no partner route; production sequence allocator
      // sees the genuine SQL transport's no-row result, not a fabricated route.
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("UPDATE ops.dispatch_resource_reservations"))
      return { rows: [], rowCount: 1 };
    if (
      sql.startsWith("WITH candidate AS") &&
      sql.includes("ops.driver_completion_outbox")
    ) {
      // Hosted lease/recovery is NOT claimed. Tests execute the actual persisted
      // effects explicitly, without simulating a lease or delivery success.
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unsupported SQL transport fixture: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  return {
    database: { isEnabled: () => true, query, connect: async () => client },
    queries,
    outbox,
    row: (table: string, id: string) =>
      structuredClone(records.get(table)?.get(id)),
    rejectCommit: () => {
      rejectCommit = true;
    },
    pauseNextOrderWrite: (hook: () => Promise<void>) => {
      pauseWrite = hook;
    },
  };
}

export async function setup(
  database = false,
  certificate = true,
  minPhotoCount = 0,
) {
  const audit = new AuditNotificationService();
  const profileSql = sqlTransport();
  const profileRepository = new DriverProfileRepository(
    profileSql.database as never,
  );
  const profiles = new DriverProfileService(audit, profileRepository);
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    profiles,
  );
  const service = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    new OpsDispatchEventsService(new EventEmitter() as never),
  );
  const order = service.createPassengerOrder({
    pickup: { address: "台中市梧棲區中二路一段9號" },
    dropoff: { address: "台中市大安區興安路378號" },
    passenger: { name: "Unit transport fixture", phone: "0911222333" },
  });
  const job = service.dispatchOrder(order.orderId, { mode: "auto" });
  const candidate = (
    await service.listDispatchCandidates(job.dispatchJobId)
  )[0]!;
  const assignment = await service.assignDispatch({
    dispatchJobId: job.dispatchJobId,
    vehicleId: candidate.vehicleId,
    driverId: candidate.driverId,
  });
  service.acceptDriverTask(assignment.taskId, {
    acceptedAt: "2026-04-10T09:02:00Z",
  });
  service.departDriverTask(assignment.taskId, {
    departedAt: "2026-04-10T09:03:00Z",
    currentLocation: { lat: 24.266, lng: 120.522 },
  });
  service.arrivedPickup(assignment.taskId, {
    arrivedAt: "2026-04-10T09:08:00Z",
  });
  await service.startDriverTask(assignment.taskId, {
    startedAt: "2026-04-10T09:10:00Z",
  });
  // Select unit runtime/proof contexts only; not a real regulated trip or PSP.
  const storedOrder = (Reflect.get(service, "orders") as Row[]).find(
    (row) => row.orderId === order.orderId,
  )!;
  if (certificate) storedOrder.runtimeProfileCode = "multi_taxi_direct";
  (storedOrder.proofRequirements as Row).minPhotoCount = minPhotoCount;
  const reporting = service.getReportingSnapshot();
  const taskSql = sqlTransport({
    "ops.phase1_owned_orders": [storedOrder],
    "ops.phase1_dispatch_jobs": reporting.dispatchJobs as unknown as Row[],
    "ops.phase1_dispatch_assignments":
      reporting.dispatchAssignments as unknown as Row[],
    "ops.phase1_driver_tasks": [
      service.getDriverTask(assignment.taskId) as unknown as Row,
    ],
  });
  if (database)
    Reflect.set(
      service,
      "ownedMobilityRepository",
      new OwnedMobilityRepository(taskSql.database as never),
    );
  const events: Row[] = [];
  const emitter = new EventEmitter();
  emitter.on(OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT, (event: Row) =>
    events.push(event),
  );
  Reflect.set(service, "eventEmitter", {
    listenerCount: (name: string) => emitter.listenerCount(name),
    emitAsync: async (name: string, event: Row) => [emitter.emit(name, event)],
  });
  const setSurname = async (
    driverSurname: string,
    driverId = candidate.driverId,
  ) =>
    profiles.upsertAdminProfile(driverId, {
      name: "Full name stays unchanged",
      driverSurname,
    });
  const event = () =>
    database
      ? ((
          taskSql.outbox.find(
            (row) => row.effectType === "multi_taxi_certificate",
          )?.payload as Row
        )?.event as Row)
      : events[0]!;
  return {
    service,
    profiles,
    profileRepository,
    profileSql,
    registry,
    taskId: assignment.taskId,
    driverId: candidate.driverId,
    storedOrder,
    taskSql,
    events,
    setSurname,
    event,
  };
}
