import {
  IdempotencyService,
  IdempotencyRepository,
} from "../../../apps/api/src/common/idempotency";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { RocOperationsService } from "../../../apps/api/src/modules/roc-operations/roc-operations.service";
import { RocOperationsController } from "../../../apps/api/src/modules/roc-operations/roc-operations.controller";
import { SafetyOperatorService } from "../../../apps/api/src/modules/safety-operator/safety-operator.service";
import { VehicleEvidenceService } from "../../../apps/api/src/modules/vehicle-evidence/vehicle-evidence.service";
import { buildMockRecorderFixture } from "../../../packages/shared-test-fixtures/src";
import { DriverSosService } from "../../../apps/api/src/modules/driver-sos/driver-sos.service";
import { DriverSosRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos.repository";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter2 } from "../../../apps/api/node_modules/eventemitter2";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { EligibilityContextResolver } from "../../../apps/api/src/modules/vehicle-eligibility/eligibility-context-resolver.service";
import { RuntimeEligibilityEvaluator } from "../../../apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";

function lastIndexWhere<T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
) {
  for (let i = items.length - 1; i >= 0; i--)
    if (predicate(items[i]!)) return i;
  return -1;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const command = {
  title: "Canonical driver incident",
  description: "Actual Incident producer controlled external SQL transport",
  category: "safety" as const,
  severity: "high" as const,
  reportedBy: "ops-one",
  relatedDriverId: "safety-op-001",
};

import { SqlTransport } from "./sql-transport";
function setup(db = new SqlTransport()) {
  const audit = new AuditNotificationService();
  const events = new OpsDispatchEventsService(new EventEmitter2());
  const incident = new IncidentService(
    audit,
    new IncidentRepository(db.database()),
    events,
  );
  const controller = new IncidentController(incident, undefined!);
  const registry = new RegulatoryRegistryService(
    events,
    audit,
    new DriverProfileService(audit),
    new RegulatoryRegistryRepository(db.database()),
  );
  return { db, audit, events, incident, controller, registry };
}

describe("canonical Incident actual producer", () => {
  it("does not publish ordinary create or success audit/event until coherent persistence ACK", async () => {
    const { db, controller, incident, audit, events } = setup();
    let eventCount = 0;
    vi.spyOn(events, "publishIncidentCreated").mockImplementation(async () => {
      eventCount++;
    });
    db.gate = deferred();
    let completed = false;
    const pending = Promise.resolve(controller.createIncident(command)).then(
      (value) => {
        completed = true;
        return value;
      },
    );
    try {
      await db.entered.promise;
      await Promise.resolve();
      expect(incident.listIncidents()).toEqual([]);
      expect(completed).toBe(false);
      expect(
        audit.listAuditLogs().filter((x) => x.moduleName === "incident"),
      ).toEqual([]);
      expect(eventCount).toBe(0);
    } finally {
      db.gate.resolve();
      await pending;
    }
  });
  it("actual same-driver Registry availability stops after another instance commits a hold", async () => {
    const { db, controller, registry } = setup();
    expect(
      registry.getDriverAvailability("safety-op-001", "business_dispatch"),
    ).toBe(true);
    await controller.createIncident(command);
    // Existing targeted fresh-read seam will be supplied by the canonical reader.
    const refresh = (
      registry as unknown as {
        prepareMatchingSuppressions?: (driverId?: string) => Promise<void>;
      }
    ).prepareMatchingSuppressions;
    if (refresh) await refresh.call(registry, "safety-op-001");
    expect(
      registry.getDriverAvailability("safety-op-001", "business_dispatch"),
    ).toBe(false);
    expect(
      db.calls.some((x) =>
        x.text.includes("ops.phase1_driver_matching_suppressions"),
      ),
    ).toBe(true);
  });
});

describe("ordinary required ACK, restore and original TTL", () => {
  it("rolls back an actual partial timeline failure and permits a normal create retry", async () => {
    const { db, controller, incident, audit } = setup();
    db.failTimeline = true;
    await expect(
      Promise.resolve().then(() => controller.createIncident(command)),
    ).rejects.toThrow("SIM rejected timeline");
    expect(db.rows.incidents.size).toBe(0);
    expect(db.rows.suppressions.size).toBe(0);
    expect(incident.listIncidents()).toEqual([]);
    expect(
      audit.listAuditLogs().filter((x) => x.moduleName === "incident"),
    ).toEqual([]);
    db.failTimeline = false;
    const result = await controller.createIncident(command);
    expect(result.data.relatedDriverId).toBe(command.relatedDriverId);
    expect(db.rows.incidents.size).toBe(1);
    expect(db.rows.suppressions.size).toBe(1);
    const writes = db.calls.filter((x) =>
      /INSERT INTO ops.phase1_(incidents|incident_timelines|driver_matching_suppressions)/.test(
        x.text,
      ),
    );
    expect(new Set(writes.slice(-3).map((x) => x.connection)).size).toBe(1);
    expect(writes.every((x) => x.connection > 0)).toBe(true);
  });
  it.each(["resolved", "closed"] as const)(
    "does not publish %s or lift until COMMIT and preserves prior state on reject",
    async (status) => {
      const { db, controller, incident, registry } = setup();
      const created = (await controller.createIncident(command)).data;
      db.gate = deferred();
      db.entered = deferred();
      db.reject = true;
      const promise = Promise.resolve(
        controller.updateIncident(created.incidentId, {
          status,
          resolutionNote: "investigation completed",
        }),
      );
      const rejection = expect(promise).rejects.toThrow("SIM rejected COMMIT");
      await db.entered.promise;
      expect(incident.getIncident(created.incidentId).status).toBe("open");
      await registry.prepareMatchingSuppressions(command.relatedDriverId);
      expect(
        registry.getDriverAvailability(
          command.relatedDriverId,
          "business_dispatch",
        ),
      ).toBe(false);
      db.gate.resolve();
      await rejection;
      expect(db.rows.incidents.get(created.incidentId)?.status).toBe("open");
      expect(
        db.rows.suppressions.get(created.incidentId)?.suppression.active,
      ).toBe(true);
      db.gate = null;
      db.reject = false;
      await controller.updateIncident(created.incidentId, { status });
      await registry.prepareMatchingSuppressions(command.relatedDriverId);
      expect(
        registry.getDriverAvailability(
          command.relatedDriverId,
          "business_dispatch",
        ),
      ).toBe(true);
      expect(
        db.rows.suppressions.get(created.incidentId)?.suppression.liftedAt,
      ).not.toBeNull();
    },
  );
  it("fresh instance/current holds respect overlap, 24h expiry, manager extension and other qualifications", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const { db, controller, incident } = setup();
    const first = (await controller.createIncident(command)).data;
    const second = (
      await controller.createIncident({
        ...command,
        title: "Second active incident",
      })
    ).data;
    expect(
      Date.parse(first.matchingSuppression!.expiresAt) -
        Date.parse(first.createdAt),
    ).toBe(24 * 3600000);
    const replica = setup(db);
    await replica.incident.onModuleInit();
    await replica.registry.prepareMatchingSuppressions(command.relatedDriverId);
    expect(
      replica.registry.getDriverAvailability(
        command.relatedDriverId,
        "business_dispatch",
      ),
    ).toBe(false);
    await controller.updateIncident(first.incidentId, { status: "resolved" });
    await replica.registry.prepareMatchingSuppressions(command.relatedDriverId);
    expect(
      replica.registry.getDriverAvailability(
        command.relatedDriverId,
        "business_dispatch",
      ),
    ).toBe(false);
    await expect(
      Promise.resolve().then(() =>
        controller.extendMatchingSuppression(
          second.incidentId,
          { extendByHours: 1, reason: "investigation" },
          undefined,
          null,
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const manager = {
      actorType: "ops_user",
      actorId: "ops-manager",
      realm: "ops",
      roles: ["ops_manager"],
      roleFamilies: ["ops"],
      scopes: ["incidents:write"],
      tenantId: null,
      authMode: "bootstrap_headers",
    } as const;
    const identity =
      manager as unknown as import("../../../apps/api/src/common/auth").BootstrapRequestIdentity;
    await expect(
      Promise.resolve().then(() =>
        controller.extendMatchingSuppression(
          second.incidentId,
          { extendByHours: 1, reason: "" },
          undefined,
          identity,
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
    db.reject = true;
    await expect(
      Promise.resolve().then(() =>
        controller.extendMatchingSuppression(
          second.incidentId,
          { extendByHours: 1, reason: "investigation" },
          undefined,
          identity,
        ),
      ),
    ).rejects.toThrow("SIM rejected COMMIT");
    expect(
      incident.getIncident(second.incidentId).matchingSuppression?.expiresAt,
    ).toBe(second.matchingSuppression?.expiresAt);
    db.reject = false;
    const extended = (
      await controller.extendMatchingSuppression(
        second.incidentId,
        { extendByHours: 1, reason: "investigation" },
        undefined,
        identity,
      )
    ).data;
    expect(
      Date.parse(extended.matchingSuppression!.expiresAt) -
        Date.parse(second.matchingSuppression!.expiresAt),
    ).toBe(3600000);
    vi.setSystemTime(new Date(second.matchingSuppression!.expiresAt));
    await replica.registry.prepareMatchingSuppressions(command.relatedDriverId);
    expect(
      replica.registry.getDriverAvailability(
        command.relatedDriverId,
        "business_dispatch",
      ),
    ).toBe(false);
    vi.setSystemTime(new Date(extended.matchingSuppression!.expiresAt));
    await replica.registry.prepareMatchingSuppressions(command.relatedDriverId);
    expect(
      replica.registry.getDriverAvailability(
        command.relatedDriverId,
        "business_dispatch",
      ),
    ).toBe(true);
    replica.registry.updateDriverWorkState(command.relatedDriverId, {
      workState: "paused",
    });
    expect(
      replica.registry.getDriverAvailability(
        command.relatedDriverId,
        "business_dispatch",
      ),
    ).toBe(false);
  });
  it("configured missing suppression authority fails honestly rather than returning zero holds", async () => {
    const { db, registry } = setup();
    db.failRead = true;
    await expect(
      registry.prepareMatchingSuppressions(command.relatedDriverId),
    ).rejects.toThrow("SIM suppression authority unavailable");
    await expect(
      registry.assertCurrentMatchingSuppressionClear(command.relatedDriverId),
    ).rejects.toThrow("SIM suppression authority unavailable");
  });
  it("a committed hold is read under the actual assignment executor/driver lock, and clearing the last hold restores", async () => {
    const { db, controller, registry } = setup();
    const tx = await db.connect();
    await tx.query("BEGIN");
    await registry.assertCurrentMatchingSuppressionClear(
      command.relatedDriverId,
      tx,
    );
    await tx.query("ROLLBACK");
    const created = (await controller.createIncident(command)).data;
    const current = await db.connect();
    await current.query("BEGIN");
    await expect(
      registry.assertCurrentMatchingSuppressionClear(
        command.relatedDriverId,
        current,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await current.query("ROLLBACK");
    const lock = lastIndexWhere(
      db.calls,
      (x) =>
        x.text.includes("reg.phase1_registry_drivers") &&
        x.text.includes("FOR UPDATE"),
    );
    const holdRead = db.calls.findIndex(
      (x, i) =>
        i > lock && x.text.includes("ops.phase1_driver_matching_suppressions"),
    );
    expect(holdRead).toBeGreaterThan(lock);
    expect(db.calls[holdRead]?.connection).toBe(db.calls[lock]?.connection);
    await controller.updateIncident(created.incidentId, { status: "closed" });
    await registry.assertCurrentMatchingSuppressionClear(
      command.relatedDriverId,
    );
    expect(
      registry.getDriverAvailability(
        command.relatedDriverId,
        "business_dispatch",
      ),
    ).toBe(true);
  });
});

describe("actual healthy candidate and offered assignment boundary", () => {
  it("excludes only the committed incident driver from actual runtime eligibility and candidate reads", async () => {
    const { audit, registry, controller } = setup();
    const product = new ServiceProductService(audit);
    const vehicles = new VehicleEligibilityService(
      registry,
      audit,
      undefined,
      product,
    );
    const resolver = new EligibilityContextResolver(
      registry,
      product,
      vehicles,
    );
    const evaluator = new RuntimeEligibilityEvaluator(resolver, audit);
    const request = {
      orderId: "healthy-order",
      dispatchJobId: "healthy-job",
      driverId: "safety-op-001",
      vehicleId: "veh-av-demo-001",
      serviceProductCode: "enterprise_dispatch" as const,
      currentLocation: {
        driverId: "safety-op-001",
        vehicleId: "veh-av-demo-001",
        lat: 24.15,
        lng: 120.67,
        recordedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accuracyM: 5,
      },
    };
    const before = await evaluator.evaluate(request);
    expect(before.hardReasonCodes).toEqual([]);
    const candidateBefore = registry.getEligibleCandidates("business_dispatch");
    expect(
      candidateBefore.some((c) => c.driverId === command.relatedDriverId),
    ).toBe(true);
    const context = resolver.resolve(request);
    await controller.createIncident(command);
    const blocked = await evaluator.evaluate({
      ...request,
      resolvedContext: context,
    });
    expect(blocked.decision).toBe("ineligible");
    expect(blocked.hardReasonCodes).toContain("INCIDENT_MATCHING_SUPPRESSION");
    expect(
      registry.listDrivers().find((d) => d.driverId === command.relatedDriverId)
        ?.eligibilityBlockedReasons,
    ).toContain("incident_matching_suppression");
    expect(
      registry.listDrivers().find((d) => d.driverId === command.relatedDriverId)
        ?.workState,
    ).toBe("available");
    expect(
      registry
        .getEligibleCandidates("business_dispatch")
        .some((c) => c.driverId === command.relatedDriverId),
    ).toBe(false);
  });
  it("actual manual assignment rejects a driver offered before the canonical hold without deleting history", async () => {
    const { audit, registry, controller, db } = setup();
    const owned = new OwnedMobilityService(
      registry,
      audit,
      new CallcenterService(audit),
      new OwnedMobilityTaskEventsService(new EventEmitter2()),
    );
    const booking = await owned.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: new Date(Date.now() + 3600000).toISOString(),
        reservationWindowEnd: new Date(Date.now() + 7200000).toISOString(),
        pickup: { address: "台中市西屯區台灣大道1號" },
        dropoff: { address: "台中市南屯區公益路2號" },
        passenger: { name: "測試乘客", phone: "0911222333" },
      },
      "tenant-demo-001",
    );
    const job = await owned.dispatchOrder(booking.orderId, { mode: "auto" });
    const candidates = await owned.listDispatchCandidates(job.dispatchJobId);
    expect(candidates.some((c) => c.driverId === command.relatedDriverId)).toBe(
      true,
    );
    const history = owned.getDispatchAssignmentsForOrder(booking.orderId);
    await controller.createIncident(command);
    await expect(
      Promise.resolve().then(() =>
        owned.assignDispatch({
          dispatchJobId: job.dispatchJobId,
          vehicleId: "veh-av-demo-001",
          driverId: command.relatedDriverId,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toEqual(
      history,
    );
    expect(
      (await owned.listDispatchCandidates(job.dispatchJobId)).some(
        (c) => c.driverId === command.relatedDriverId,
      ),
    ).toBe(false);
    expect(
      db.calls.some(
        (q) =>
          q.text.includes("ops.phase1_driver_matching_suppressions") &&
          q.values[0] === command.relatedDriverId,
      ),
    ).toBe(true);
  });
});

async function enabledAssignment() {
  const context = setup();
  const { audit, registry, db } = context;
  const fixture = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
  );
  const booking = await fixture.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: new Date(Date.now() + 3600000).toISOString(),
      reservationWindowEnd: new Date(Date.now() + 7200000).toISOString(),
      pickup: { address: "台中市西屯區台灣大道1號" },
      dropoff: { address: "台中市南屯區公益路2號" },
      passenger: { name: "測試乘客", phone: "0911222333" },
    },
    "tenant-demo-001",
  );
  const job = await fixture.dispatchOrder(booking.orderId, { mode: "auto" });
  expect(
    (await fixture.listDispatchCandidates(job.dispatchJobId)).some(
      (c) => c.driverId === command.relatedDriverId,
    ),
  ).toBe(true);
  db.tables.set("ops.phase1_owned_orders", [fixture.getOrder(booking.orderId)]);
  db.tables.set("ops.phase1_dispatch_jobs", [
    fixture.getDispatchJob(job.dispatchJobId),
  ]);
  const owned = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
    undefined,
    new OwnedMobilityRepository(db.database()),
  );
  try {
    await new OwnedMobilityRepository(db.database()).loadState();
  } catch (error) {
    throw new Error(`fixture load ${String((error as Error).stack)}`);
  }
  await owned.onModuleInit();
  expect(owned.getDispatchJob(job.dispatchJobId)).not.toBeNull();
  return { ...context, owned, fixture, booking, job };
}

it("actual enabled assignment transaction rechecks committed suppression on its driver-lock executor", async () => {
  const { controller, db, owned, booking, job } = await enabledAssignment();
  await controller.createIncident(command);
  const start = db.calls.length;
  await expect(
    Promise.resolve().then(() =>
      owned.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "veh-av-demo-001",
        driverId: command.relatedDriverId,
      }),
    ),
  ).rejects.toMatchObject({ status: 409 });
  const queries = db.calls.slice(start);
  const lock = queries.find(
    (q) =>
      q.text.includes("reg.phase1_registry_drivers") &&
      q.text.includes("FOR UPDATE"),
  );
  expect(lock?.connection).toBeGreaterThan(0);
  expect(
    queries.some(
      (q) =>
        q.connection === lock!.connection &&
        q.text.includes("ops.phase1_driver_matching_suppressions"),
    ),
  ).toBe(true);
  expect(queries.some((q) => q.text === "ROLLBACK")).toBe(true);
  expect(
    queries.some((q) =>
      q.text.includes("INSERT INTO ops.phase1_dispatch_assignments"),
    ),
  ).toBe(false);
  expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toEqual([]);
});

it("the same actual enabled assignment path commits for the healthy driver with no hold", async () => {
  const { db, owned, booking, job } = await enabledAssignment();
  await owned.assignDispatch({
    dispatchJobId: job.dispatchJobId,
    vehicleId: "veh-av-demo-001",
    driverId: command.relatedDriverId,
  });
  expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toHaveLength(1);
  expect(db.rows.raw.get("ops.phase1_dispatch_assignments")).toHaveLength(1);
  expect(db.rows.raw.get("ops.dispatch_resource_reservations")).toHaveLength(2);
  expect(db.heldLocks).toBe(0);
  const commit = lastIndexWhere(db.calls, (q) => q.text === "COMMIT");
  const writes = db.calls.filter((q) =>
    q.text.includes("INSERT INTO ops.phase1_dispatch_assignments"),
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]!.connection).toBe(db.calls[commit]!.connection);
});

function sosProducer(context: ReturnType<typeof setup>) {
  const service = new DriverSosService(
    context.audit,
    context.incident,
    new DriverSosRepository(context.db.database()),
  );
  const identity = {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: command.relatedDriverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write", "incident:write"],
  } as import("../../../apps/api/src/common/auth").BootstrapRequestIdentity;
  const payload = {
    clientEventId: "11111111-1111-4111-8111-111111111111",
    driverId: "spoofed-driver",
    vehicleId: "veh-av-demo-001",
    eventType: "security_incident" as const,
    severity: "major" as const,
    description: "Actual atomic SOS",
    originalTriggeredAt: new Date().toISOString(),
    offlineAtTrigger: true,
  };
  return {
    service,
    identity,
    payload,
    submit: () => service.submitSosEvent(payload, identity),
  };
}

it("actual SOS publishes only its coherent atomic submission ACK and restores durable dedup/correlation", async () => {
  const context = setup();
  const { db, incident, registry } = context;
  const sos = sosProducer(context);
  db.gate = deferred();
  let completed = false;
  const pending = sos.submit().then((result) => {
    completed = true;
    return result;
  });
  await db.commitEntered.promise;
  expect(completed).toBe(false);
  expect(incident.listIncidents()).toEqual([]);
  expect(db.rows.raw.get("safety.driver_sos_events")).toBeUndefined();
  expect(db.rows.suppressions.size).toBe(0);
  db.gate.resolve();
  const first = await pending;
  db.gate = null;
  expect(first.event.driverId).toBe(command.relatedDriverId);
  expect(first.receipt.duplicate).toBe(false);
  expect(
    incident.getIncident(first.receipt.incidentId).matchingSuppression?.active,
  ).toBe(true);
  expect(db.rows.raw.get("safety.driver_sos_events")).toHaveLength(1);
  expect(
    db.rows.raw.get("safety.driver_sos_urgent_alert_outbox")?.[0]?.incident_id,
  ).toBe(first.receipt.incidentId);
  const writes = db.calls.filter((q) => q.text.includes("INSERT INTO"));
  expect(new Set(writes.map((q) => q.connection)).size).toBe(1);
  expect(writes[0]!.connection).toBeGreaterThan(0);
  const driverLock = db.calls.findIndex(
    (q) =>
      q.text.includes("reg.phase1_registry_drivers") &&
      q.text.includes("FOR UPDATE"),
  );
  const incidentWrite = db.calls.findIndex((q) =>
    q.text.includes("INSERT INTO ops.phase1_incidents"),
  );
  expect(driverLock).toBeLessThan(incidentWrite);
  const replica = setup(db);
  await replica.incident.onModuleInit();
  const restored = sosProducer(replica);
  const replay = await restored.submit();
  expect(replay.receipt.duplicate).toBe(true);
  expect(replay.receipt.incidentId).toBe(first.receipt.incidentId);
  expect(replay.event.sosEventId).toBe(first.event.sosEventId);
  expect(db.rows.incidents.size).toBe(1);
  expect(db.rows.raw.get("safety.driver_sos_urgent_alert_outbox")).toHaveLength(
    1,
  );
  await registry.prepareMatchingSuppressions(command.relatedDriverId);
  expect(
    registry.getDriverAvailability(
      command.relatedDriverId,
      "business_dispatch",
    ),
  ).toBe(false);
  expect(db.heldLocks).toBe(0);
});

it("actual SOS partial write rejection preserves atomicity and retry rather than publishing a partial hold", async () => {
  const context = setup();
  const sos = sosProducer(context);
  context.db.failTimeline = true;
  await expect(sos.submit()).rejects.toThrow("SIM rejected timeline");
  expect(context.db.rows.incidents.size).toBe(0);
  expect(context.incident.listIncidents()).toEqual([]);
  expect(context.db.rows.raw.size).toBe(0);
  expect(context.db.heldLocks).toBe(0);
  context.db.failTimeline = false;
  const retried = await sos.submit();
  expect(retried.receipt.duplicate).toBe(false);
  expect(context.db.rows.incidents.size).toBe(1);
  expect(context.db.rows.raw.get("safety.driver_sos_events")).toHaveLength(1);
});

it.each(["ordinary", "SOS"] as const)(
  "%s hold wins its driver row lock: actual offered assignment waits, rechecks, and rejects after the hold ACK",
  async (kind) => {
    const context = await enabledAssignment();
    const { db, controller, owned, booking, job } = context;
    db.gate = deferred();
    const hold =
      kind === "ordinary"
        ? Promise.resolve(controller.createIncident(command))
        : sosProducer(context).submit();
    await db.commitEntered.promise;
    db.lockRequested = deferred();
    let settled = false;
    const assignment = Promise.resolve(
      owned.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "veh-av-demo-001",
        driverId: command.relatedDriverId,
      }),
    ).then(
      (result) => {
        settled = true;
        return result;
      },
      (error) => {
        settled = true;
        return error;
      },
    );
    await db.lockRequested.promise;
    expect(settled).toBe(false);
    expect(
      db.calls.some((q) =>
        q.text.includes("INSERT INTO ops.phase1_dispatch_assignments"),
      ),
    ).toBe(false);
    db.gate.resolve();
    await hold;
    expect(await assignment).toMatchObject({ status: 409 });
    expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toEqual([]);
    expect(db.rows.raw.get("ops.phase1_dispatch_assignments")).toBeUndefined();
    expect(db.heldLocks).toBe(0);
  },
);

it("assignment wins the same driver lock: hold waits until committed offer and never terminates that assignment", async () => {
  const { db, controller, owned, booking, job, registry } =
    await enabledAssignment();
  db.gate = deferred();
  const assignment = Promise.resolve(
    owned.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      driverId: command.relatedDriverId,
    }),
  );
  await db.commitEntered.promise;
  db.lockRequested = deferred();
  let holdSettled = false;
  const hold = Promise.resolve(controller.createIncident(command)).then(
    (value) => {
      holdSettled = true;
      return value;
    },
  );
  await db.lockRequested.promise;
  expect(holdSettled).toBe(false);
  expect(db.rows.incidents.size).toBe(0);
  db.gate.resolve();
  await assignment;
  await hold;
  expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toHaveLength(1);
  expect(owned.getDispatchAssignmentsForOrder(booking.orderId)[0]?.status).toBe(
    "assigned",
  );
  expect(db.rows.raw.get("ops.phase1_dispatch_assignments")).toHaveLength(1);
  await registry.prepareMatchingSuppressions(command.relatedDriverId);
  expect(
    registry.getDriverAvailability(
      command.relatedDriverId,
      "business_dispatch",
    ),
  ).toBe(false);
  expect(db.heldLocks).toBe(0);
});

it("actual Callcenter wrapper waits for incident ACK before transfer receipt/audit and preserves call/order/agent", async () => {
  const { db, audit, incident } = setup();
  const calls = new CallcenterService(audit);
  const complaints = new ComplaintService(audit);
  const controller = new CallcenterController(
    calls,
    complaints,
    incident,
    undefined!,
  );
  const call = calls.openCallSession({
    callType: "booking",
    callerPhone: "0911222333",
    agentId: "call-agent",
  });
  calls.linkOrderToExistingSession(call.callId, { orderId: "original-order" });
  db.gate = deferred();
  db.reject = true;
  const pending = controller.transferCallToIncident(call.callId, command);
  const rejected = expect(pending).rejects.toThrow("SIM rejected COMMIT");
  await db.commitEntered.promise;
  expect(calls.getCallSession(call.callId).flags).not.toContain(
    "incident_transferred",
  );
  expect(
    audit
      .listAuditLogs()
      .filter((a) => a.actionName === "transfer_call_to_incident"),
  ).toHaveLength(0);
  db.gate.resolve();
  await rejected;
  expect(calls.getCallSession(call.callId).flags).not.toContain(
    "incident_transferred",
  );
  db.gate = null;
  db.reject = false;
  const result = await controller.transferCallToIncident(call.callId, command);
  expect(result.data.session.callId).toBe(call.callId);
  expect(result.data.incident.relatedOrderId).toBe("original-order");
  expect(result.data.incident.assignedTo).toBe("call-agent");
  expect(result.data.session.flags).toContain("incident_transferred");
  expect(
    db.rows.incidents.get(result.data.incident.incidentId)?.assignedTo,
  ).toBe("call-agent");
});

it("actual Complaint escalation preserves its operation identity on incident rejection, then returns the committed case/incident link", async () => {
  const { db, audit, incident } = setup();
  const complaints = new ComplaintService(
    audit,
    new ComplaintRepository(db.database()),
  );
  const controller = new ComplaintController(
    complaints,
    incident,
    new IdempotencyService(new IdempotencyRepository()),
  );
  const complaint = await complaints.createComplaintCase({
    caseSource: "ops",
    category: "safety_concern",
    severity: "high",
    description: "Canonical complaint escalation",
  });
  const payload = {
    title: "Escalated safety complaint",
    severity: "high" as const,
    reason: "Requires investigation",
  };
  db.rejectIncident = true;
  await expect(
    controller.escalateToIncident(
      complaint.caseNo,
      payload,
      "request-one",
      "same-operation",
    ),
  ).rejects.toThrow("SIM rejected COMMIT");
  expect(incident.listIncidents()).toEqual([]);
  expect(db.rows.incidents.size).toBe(0);
  const preparedId = complaints.getComplaintCase(
    complaint.caseNo,
  ).relatedIncidentId;
  expect(preparedId).toBeTruthy();
  db.rejectIncident = false;
  const result = await controller.escalateToIncident(
    complaint.caseNo,
    payload,
    "request-retry",
    "same-operation",
  );
  expect(result.data.incident.incidentId).toBe(preparedId);
  expect(result.data.complaintCase.relatedIncidentId).toBe(preparedId);
  expect(result.data.incident.relatedComplaintCaseNo).toBe(complaint.caseNo);
  expect(db.rows.incidents.get(preparedId!)?.relatedComplaintCaseNo).toBe(
    complaint.caseNo,
  );
  expect(db.rows.incidents.size).toBe(1);
});

it("actual ROC controller publishes linked cache/receipt only after ordinary Incident ACK", async () => {
  const { db, audit, incident } = setup();
  const evidence = new VehicleEvidenceService();
  const recorder = buildMockRecorderFixture({
    recorderId: "rec-incident-ack",
    vehicleId: "veh-incident-ack",
  });
  evidence.registerRecorder(recorder);
  evidence.updateRecorderHealth(recorder.recorderId, {
    overall: "unhealthy",
    clockDriftMs: 20000,
    uploadQueueState: "error",
    uploadPendingCount: 2,
    storageState: "error",
  });
  const service = new RocOperationsService(
    new SafetyOperatorService(audit),
    incident,
    evidence,
  );
  const controller = new RocOperationsController(service);
  const identity = {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId: "roc-manager",
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["roc_operator", "ops_manager", "safety_officer"],
    scopes: ["dispatch:read", "dispatch:write", "incident:write"],
  } as import("../../../apps/api/src/common/auth").BootstrapRequestIdentity;
  const alert = service
    .listAlerts(identity)
    .find((a) => a.vehicleId === "veh-incident-ack")!;
  expect(alert).toBeDefined();
  db.gate = deferred();
  db.reject = true;
  const pending = controller.openIncident(
    alert.alertId,
    { reason: "Recorder unavailable" },
    undefined,
    identity,
  );
  const rejected = expect(pending).rejects.toThrow("SIM rejected COMMIT");
  await db.commitEntered.promise;
  expect(
    service.listAlerts(identity).find((a) => a.alertId === alert.alertId)
      ?.linkedIncidentId,
  ).toBeNull();
  db.gate.resolve();
  await rejected;
  expect(
    service.listAlerts(identity).find((a) => a.alertId === alert.alertId)
      ?.linkedIncidentId,
  ).toBeNull();
  db.gate = null;
  db.reject = false;
  const result = await controller.openIncident(
    alert.alertId,
    { reason: "Recorder unavailable" },
    undefined,
    identity,
  );
  expect(result.data.status).toBe("completed");
  const linked = service
    .listAlerts(identity)
    .find((a) => a.alertId === alert.alertId)?.linkedIncidentId;
  expect(linked).toBeTruthy();
  expect(db.rows.incidents.has(linked!)).toBe(true);
});

it.each([false, true])(
  "actual autonomous offer uses current incident authority (hold=%s)",
  async (held) => {
    const { fixture, registry, controller, booking } =
      await enabledAssignment();
    const excluded = registry
      .listDrivers()
      .filter((d) => d.driverId !== command.relatedDriverId)
      .map((d) => d.driverId);
    expect(
      (
        await fixture.listEligibleDispatchCandidatesForOrder(booking.orderId)
      ).some((c) => c.driverId === command.relatedDriverId),
    ).toBe(true);
    if (held) await controller.createIncident(command);
    const result = await fixture
      .getAutonomousDispatchExecutor()
      .executeOfferRound(booking.orderId, { excludedDriverIds: excluded });
    expect(result.status).toBe(held ? "no_supply" : "offered");
    if (held)
      expect(fixture.getDispatchAssignmentsForOrder(booking.orderId)).toEqual(
        [],
      );
    else {
      expect(result.driverId).toBe(command.relatedDriverId);
      expect(
        fixture.getDispatchAssignmentsForOrder(booking.orderId),
      ).toHaveLength(1);
    }
  },
);

it("the same canonical assignment resumes after the last overlapping hold lifts and remaining readiness gates pass", async () => {
  const { controller, registry, owned, booking, job, db } =
    await enabledAssignment();
  const first = (await controller.createIncident(command)).data;
  const second = (
    await controller.createIncident({
      ...command,
      title: "Overlapping independent investigation",
    })
  ).data;
  const assign = () =>
    owned.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      driverId: command.relatedDriverId,
    });
  await controller.updateIncident(first.incidentId, { status: "resolved" });
  await expect(assign()).rejects.toMatchObject({ status: 409 });
  expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toEqual([]);
  await controller.updateIncident(second.incidentId, { status: "closed" });
  registry.updateDriverWorkState(command.relatedDriverId, {
    workState: "paused",
  });
  await expect(assign()).rejects.toMatchObject({ status: 409 });
  expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toEqual([]);
  registry.updateDriverWorkState(command.relatedDriverId, {
    workState: "available",
  });
  await assign();
  expect(owned.getDispatchAssignmentsForOrder(booking.orderId)).toHaveLength(1);
  expect(db.rows.raw.get("ops.phase1_dispatch_assignments")).toHaveLength(1);
  expect(db.heldLocks).toBe(0);
});
