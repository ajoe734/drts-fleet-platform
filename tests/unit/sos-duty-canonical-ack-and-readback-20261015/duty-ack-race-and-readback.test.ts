import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverSosService } from "../../../apps/api/src/modules/driver-sos/driver-sos.service";
import type { DriverSosRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos.repository";
import type { DriverSosVerificationRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos-verification.repository";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import type { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";

function buildDriverIdentity(driverId = "drv-race-01"): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write", "incident:write"],
    requestId: `req-${driverId}`,
  };
}

function buildOpsIdentity(actorId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId,
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_dispatcher"],
    scopes: ["incident:read", "incident:write"],
    requestId: `req-${actorId}`,
  };
}

/** Deferred promise so a test can hold a repository call open and release
 * it at a precisely chosen point, instead of relying on microtask timing
 * luck to reproduce an overlap window. */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setupService(verificationRepository?: DriverSosVerificationRepository) {
  const auditService = new AuditNotificationService();
  const incidentService = new IncidentService(auditService);
  const driverSosService = new DriverSosService(
    auditService,
    incidentService,
    undefined,
    verificationRepository,
  );
  return { auditService, incidentService, driverSosService };
}

async function submitSos(
  driverSosService: DriverSosService,
  clientEventId: string,
) {
  const driverIdentity = buildDriverIdentity(`drv-${clientEventId.slice(0, 8)}`);
  return driverSosService.submitSosEvent(
    {
      clientEventId,
      eventType: "traffic_accident",
      severity: "major",
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: false,
    },
    driverIdentity,
  );
}

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015: genuinely concurrent duty acknowledgment", () => {
  it("serializes two truly overlapping acknowledgeDuty calls so only one duty_acknowledged timeline entry is ever recorded", async () => {
    const { driverSosService } = setupService();
    const sos = await submitSos(
      driverSosService,
      "aaaaaaaa-1111-4111-8111-111111111111",
    );

    const actorA = buildOpsIdentity("ops-race-a");
    const actorB = buildOpsIdentity("ops-race-b");

    // Both calls are started before either has had a chance to observe the
    // other's effect -- this is the exact overlap window the old
    // implementation mishandled (both read dutyAcknowledgement === null and
    // both proceeded to persist).
    const [first, second] = await Promise.all([
      driverSosService.acknowledgeDuty(sos.event.sosEventId, {}, actorA),
      driverSosService.acknowledgeDuty(sos.event.sosEventId, {}, actorB),
    ]);

    const winners = [first, second].filter((r) => r.wonAcknowledgement);
    const losers = [first, second].filter((r) => !r.wonAcknowledgement);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const winnerOwner = winners[0]!.dutyAcknowledgement.acknowledgedByActorId;
    expect([actorA.actorId, actorB.actorId]).toContain(winnerOwner);
    expect(losers[0]!.dutyAcknowledgement.acknowledgedByActorId).toBe(
      winnerOwner,
    );

    expect(
      first.timeline.filter((entry) => entry.eventType === "duty_acknowledged"),
    ).toHaveLength(1);
    expect(
      second.timeline.filter((entry) => entry.eventType === "duty_acknowledged"),
    ).toHaveLength(1);
  });

  it("holds a deferred repository write open across a second overlapping call without producing a duplicate timeline entry or losing the first writer", async () => {
    const deferred = createDeferred<{
      accepted: boolean;
      acknowledgedByActorId: string;
      acknowledgedAt: string;
    }>();
    let callCount = 0;
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async (event: { dutyAcknowledgement: { acknowledgedByActorId: string | null; acknowledgedAt: string | null } }) => {
        callCount += 1;
        // Only the first call is held open; this proves the second call
        // never even attempts its own persistence while the first is
        // in flight, because the lock makes it wait instead.
        if (callCount === 1) {
          return deferred.promise;
        }
        return {
          accepted: true,
          acknowledgedByActorId: event.dutyAcknowledgement.acknowledgedByActorId!,
          acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
        };
      },
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService } = setupService(mockVerificationRepository);
    const sos = await submitSos(
      driverSosService,
      "bbbbbbbb-2222-4222-8222-222222222222",
    );

    const actorA = buildOpsIdentity("ops-deferred-a");
    const actorB = buildOpsIdentity("ops-deferred-b");

    const firstCall = driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      actorA,
    );
    // Give the first call a chance to reach (and block inside) its await on
    // persistDutyAcknowledgement before starting the second.
    await Promise.resolve();
    await Promise.resolve();
    const secondCall = driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      actorB,
    );

    // Only once both calls are queued do we release the held write.
    deferred.resolve({
      accepted: true,
      acknowledgedByActorId: actorA.actorId as string,
      acknowledgedAt: new Date().toISOString(),
    });

    const [first, second] = await Promise.all([firstCall, secondCall]);

    expect(callCount).toBe(1); // the second call never raced its own write in
    expect(first.wonAcknowledgement).toBe(true);
    expect(second.wonAcknowledgement).toBe(false);
    expect(second.dutyAcknowledgement.acknowledgedByActorId).toBe(
      actorA.actorId,
    );
    expect(
      second.timeline.filter((entry) => entry.eventType === "duty_acknowledged"),
    ).toHaveLength(1);
  });

  it("does not leave the Incident falsely assigned when the repository rejects, and a subsequent retry still succeeds honestly", async () => {
    let shouldFail = true;
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async (event: { dutyAcknowledgement: { acknowledgedByActorId: string | null; acknowledgedAt: string | null } }) => {
        if (shouldFail) {
          throw new Error("simulated database failure");
        }
        return {
          accepted: true,
          acknowledgedByActorId: event.dutyAcknowledgement.acknowledgedByActorId!,
          acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
        };
      },
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService, incidentService } = setupService(
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "cccccccc-3333-4333-8333-333333333333",
    );
    const opsIdentity = buildOpsIdentity("ops-db-fail-01");

    await expect(
      driverSosService.acknowledgeDuty(sos.event.sosEventId, {}, opsIdentity),
    ).rejects.toThrow("simulated database failure");

    // The failed write must not have left the Incident re-assigned while the
    // SOS event itself still honestly reports no owner.
    const incidentAfterFailure = incidentService.getIncident(
      sos.receipt.incidentId,
    );
    expect(incidentAfterFailure.assignedTo).toBeNull();
    const eventAfterFailure = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(
      eventAfterFailure.event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();
    expect(
      eventAfterFailure.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(0);

    shouldFail = false;
    const retried = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );
    expect(retried.wonAcknowledgement).toBe(true);
    expect(retried.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsIdentity.actorId,
    );
    expect(
      retried.timeline.filter((entry) => entry.eventType === "duty_acknowledged"),
    ).toHaveLength(1);
    const incidentAfterRetry = incidentService.getIncident(
      sos.receipt.incidentId,
    );
    expect(incidentAfterRetry.assignedTo).toBe(opsIdentity.actorId);
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015: cross-app honest readback beyond acknowledgment", () => {
  it("reconciles investigating/resolved/closed Incident progression onto the SOS event and timeline exactly once per transition", async () => {
    const { driverSosService, incidentService } = setupService();
    const sos = await submitSos(
      driverSosService,
      "dddddddd-4444-4444-8444-444444444444",
    );
    const opsIdentity = buildOpsIdentity("ops-progress-01");
    await driverSosService.acknowledgeDuty(sos.event.sosEventId, {}, opsIdentity);

    incidentService.updateIncident(
      sos.receipt.incidentId,
      { status: "investigating" },
      undefined,
      opsIdentity,
    );

    const afterInvestigating = await driverSosService.getOwnEventForDriver(
      sos.event.sosEventId,
      buildDriverIdentity(sos.event.driverId),
    );
    expect(afterInvestigating.event.status).toBe("investigating");
    expect(
      afterInvestigating.timeline.filter(
        (entry) => entry.eventType === "investigation_started",
      ),
    ).toHaveLength(1);

    // A second readback before any further Incident change must not
    // duplicate the timeline entry.
    const secondReadOfSameState = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(
      secondReadOfSameState.timeline.filter(
        (entry) => entry.eventType === "investigation_started",
      ),
    ).toHaveLength(1);

    incidentService.updateIncident(
      sos.receipt.incidentId,
      { status: "resolved" },
      undefined,
      opsIdentity,
    );
    const afterResolved = await driverSosService.getEventByIncidentIdForOps(
      sos.receipt.incidentId,
      opsIdentity,
    );
    expect(afterResolved.event.status).toBe("resolved");
    expect(
      afterResolved.timeline.filter((entry) => entry.eventType === "resolved"),
    ).toHaveLength(1);

    incidentService.updateIncident(
      sos.receipt.incidentId,
      { status: "closed" },
      undefined,
      opsIdentity,
    );
    const afterClosed = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(afterClosed.event.status).toBe("closed");
    expect(
      afterClosed.timeline.filter((entry) => entry.eventType === "closed"),
    ).toHaveLength(1);
  });

  it("honestly transitions an unacknowledged event to duty_alerted (not acknowledged) when Ops actually renders the alert, before any duty acknowledgment", async () => {
    const { driverSosService } = setupService();
    const sos = await submitSos(
      driverSosService,
      "eeeeeeee-5555-4555-8555-555555555555",
    );
    const opsIdentity = buildOpsIdentity("ops-render-01");

    const renderedAt = new Date(
      Date.parse(sos.receipt.fleetReportConfirmedAt) + 1_000,
    ).toISOString();
    await driverSosService.recordOpsAlertsRendered(
      { incidentIds: [sos.receipt.incidentId], renderedAt },
      opsIdentity,
    );

    const readback = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(readback.event.status).toBe("duty_alerted");
    expect(readback.event.dutyAcknowledgement.acknowledgedByActorId).toBeNull();
    expect(
      readback.timeline.filter(
        (entry) => entry.eventType === "duty_alert_dispatched",
      ),
    ).toHaveLength(1);

    // Rendering again (duplicate) must not re-fire the transition or the
    // timeline entry.
    await driverSosService.recordOpsAlertsRendered(
      { incidentIds: [sos.receipt.incidentId], renderedAt },
      opsIdentity,
    );
    const afterDuplicateRender = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(
      afterDuplicateRender.timeline.filter(
        (entry) => entry.eventType === "duty_alert_dispatched",
      ),
    ).toHaveLength(1);

    // Duty acknowledgment still proceeds correctly from duty_alerted.
    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );
    expect(ack.wonAcknowledgement).toBe(true);
    expect(ack.event.status).toBe("acknowledged");
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R4 reopen: F1 Incident/SOS owner agreement", () => {
  it("F1: does not report a successful duty claim when the Incident is already assigned to a different owner by a direct caller", async () => {
    const { driverSosService, incidentService } = setupService();
    const sos = await submitSos(
      driverSosService,
      "ffffffff-6666-4666-8666-666666666666",
    );
    const existingOps = buildOpsIdentity("ops-existing");
    const newOps = buildOpsIdentity("ops-new");

    // The real reachable caller: PATCH /api/incidents/:id can assign the
    // correlated Incident directly, before (or during) the canonical SOS
    // duty-ack flow ever runs.
    incidentService.updateIncident(
      sos.receipt.incidentId,
      { assignedTo: existingOps.actorId as string },
      undefined,
      existingOps,
    );

    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      newOps,
    );

    // The caller must never be told it won while the Incident already
    // disagrees -- both sides must converge on the same single owner.
    expect(ack.wonAcknowledgement).toBe(false);
    expect(ack.dutyAcknowledgement.acknowledgedByActorId).toBe(
      existingOps.actorId,
    );
    expect(ack.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      existingOps.actorId,
    );
    const incidentAfter = incidentService.getIncident(sos.receipt.incidentId);
    expect(incidentAfter.assignedTo).toBe(existingOps.actorId);

    // Authoritative readback for either realm must report the same
    // single current owner, not the caller's own (losing) claim.
    const readback = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      newOps,
    );
    expect(readback.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      existingOps.actorId,
    );
    expect(
      readback.timeline.filter((entry) => entry.eventType === "duty_acknowledged"),
    ).toHaveLength(1);
  });

  it("F1: a failed SOS-side CAS write never leaves the Incident reassigned, even once the Incident is checked first", async () => {
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async () => {
        throw new Error("simulated database failure");
      },
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService, incidentService } = setupService(
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "11111111-7777-4777-8777-777777777777",
    );
    const opsIdentity = buildOpsIdentity("ops-db-fail-02");

    await expect(
      driverSosService.acknowledgeDuty(sos.event.sosEventId, {}, opsIdentity),
    ).rejects.toThrow("simulated database failure");

    const incidentAfterFailure = incidentService.getIncident(
      sos.receipt.incidentId,
    );
    expect(incidentAfterFailure.assignedTo).toBeNull();
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R4 reopen: F2 concurrent readback does not duplicate progression", () => {
  it("F2: two concurrent authoritative readbacks across both realms never both append the same forward-progression timeline entry", async () => {
    const { driverSosService, incidentService } = setupService();
    const sos = await submitSos(
      driverSosService,
      "22222222-8888-4888-8888-888888888888",
    );
    const opsIdentity = buildOpsIdentity("ops-concurrent-01");
    await driverSosService.acknowledgeDuty(sos.event.sosEventId, {}, opsIdentity);

    incidentService.updateIncident(
      sos.receipt.incidentId,
      { status: "investigating" },
      undefined,
      opsIdentity,
    );

    const [driverReadback, opsReadback] = await Promise.all([
      driverSosService.getOwnEventForDriver(
        sos.event.sosEventId,
        buildDriverIdentity(sos.event.driverId),
      ),
      driverSosService.getEventForOps(sos.event.sosEventId, opsIdentity),
    ]);

    expect(driverReadback.event.status).toBe("investigating");
    expect(opsReadback.event.status).toBe("investigating");
    expect(
      driverReadback.timeline.filter(
        (entry) => entry.eventType === "investigation_started",
      ),
    ).toHaveLength(1);
    expect(
      opsReadback.timeline.filter(
        (entry) => entry.eventType === "investigation_started",
      ),
    ).toHaveLength(1);
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R4 reopen: F4 losing ACK reloads the winner's authoritative state", () => {
  it("F4: a losing duty-ack CAS result hydrates this process's cache from the authoritative store instead of returning zero timeline entries", async () => {
    const winnerAcknowledgedAt = "2026-10-16T00:00:00.000Z";
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async () => ({
        accepted: false,
        acknowledgedByActorId: "ops-other-process",
        acknowledgedAt: winnerAcknowledgedAt,
      }),
    } as unknown as DriverSosVerificationRepository;

    let reloadCallCount = 0;
    const winnerTimelineEntry = {
      timelineId: "tl-winner-1",
      sosEventId: "", // filled in once the real sosEventId is known
      eventType: "duty_acknowledged" as const,
      actorType: "ops" as const,
      actorId: "ops-other-process",
      occurredAt: winnerAcknowledgedAt,
      recordedAt: winnerAcknowledgedAt,
      payload: { note: "handled by the other process" },
    };
    const mockRepository = {
      // Submission goes through the normal in-memory path (isEnabled false)
      // -- only the authoritative single-event reload used by a losing ACK
      // is exercised by this test.
      isEnabled: () => false,
      reloadEventState: async (sosEventId: string) => {
        reloadCallCount += 1;
        return {
          event: {
            sosEventId,
            status: "acknowledged" as const,
            dutyAcknowledgement: {
              acknowledgedAt: winnerAcknowledgedAt,
              acknowledgedByActorId: "ops-other-process",
            },
          },
          timelines: [{ ...winnerTimelineEntry, sosEventId }],
          outbox: null,
        };
      },
    } as unknown as DriverSosRepository;

    const auditService = new AuditNotificationService();
    const incidentService = new IncidentService(auditService);
    const driverSosService = new DriverSosService(
      auditService,
      incidentService,
      mockRepository,
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "33333333-9999-4999-8999-999999999999",
    );
    const loserOps = buildOpsIdentity("ops-local-loser");

    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      loserOps,
    );

    expect(reloadCallCount).toBeGreaterThan(0);
    expect(ack.dutyAcknowledgement.acknowledgedByActorId).toBe(
      "ops-other-process",
    );
    expect(
      ack.timeline.filter((entry) => entry.eventType === "duty_acknowledged"),
    ).toHaveLength(1);

    const readback = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      loserOps,
    );
    expect(
      readback.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(1);
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R5 repair: F1 Incident claim closes the real overlap window", () => {
  it("F1: a genuinely overlapping direct Incident assignment cannot land underneath an in-flight acknowledgment and go unnoticed", async () => {
    const deferred = createDeferred<{
      accepted: boolean;
      acknowledgedByActorId: string;
      acknowledgedAt: string;
    }>();
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async (event: {
        dutyAcknowledgement: {
          acknowledgedByActorId: string | null;
          acknowledgedAt: string | null;
        };
      }) =>
        deferred.promise.then(() => ({
          accepted: true,
          acknowledgedByActorId: event.dutyAcknowledgement.acknowledgedByActorId!,
          acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
        })),
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService, incidentService } = setupService(
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const opsAck = buildOpsIdentity("ops-overlap-ack");
    const opsDirect = buildOpsIdentity("ops-overlap-direct");

    const ackCall = driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsAck,
    );
    // Give the ack call a chance to reach (and block inside) its await on
    // the held-open SOS-side CAS write. The Incident claim is this call's
    // real first write and happens synchronously before that await, so by
    // this point the Incident is already durably claimed.
    await Promise.resolve();
    await Promise.resolve();

    // The real reachable caller: a direct PATCH /incidents/:id arriving
    // "during" the still-in-flight SOS write. With the old read-only
    // pre-check this silently won and left the two subsystems disagreeing;
    // now it sees the already-committed claim and gets a truthful conflict.
    let directAssignError: unknown;
    try {
      incidentService.updateIncident(
        sos.receipt.incidentId,
        { assignedTo: opsDirect.actorId as string },
        undefined,
        opsDirect,
      );
    } catch (error) {
      directAssignError = error;
    }
    expect((directAssignError as { code?: string })?.code).toBe(
      "INCIDENT_ASSIGNMENT_CONFLICT",
    );

    deferred.resolve({
      accepted: true,
      acknowledgedByActorId: opsAck.actorId as string,
      acknowledgedAt: new Date().toISOString(),
    });
    const ack = await ackCall;

    expect(ack.wonAcknowledgement).toBe(true);
    expect(ack.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsAck.actorId,
    );
    const incidentAfter = incidentService.getIncident(sos.receipt.incidentId);
    expect(incidentAfter.assignedTo).toBe(opsAck.actorId);
  });

  it("F1: a failed durable Incident handover write makes acknowledgeDuty fail honestly instead of reporting success", async () => {
    const mockIncidentRepository = {
      isEnabled: () => true,
      persistChanges: async () => {
        throw new Error("simulated incident persistence failure");
      },
      reportPersistenceFailure: () => {},
    } as unknown as IncidentRepository;

    const auditService = new AuditNotificationService();
    const incidentService = new IncidentService(
      auditService,
      mockIncidentRepository,
    );
    const driverSosService = new DriverSosService(auditService, incidentService);
    const sos = await submitSos(
      driverSosService,
      "55555555-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    const opsIdentity = buildOpsIdentity("ops-incident-db-fail");

    let ackError: unknown;
    try {
      await driverSosService.acknowledgeDuty(
        sos.event.sosEventId,
        {},
        opsIdentity,
      );
    } catch (error) {
      ackError = error;
    }
    expect((ackError as { code?: string })?.code).toBe(
      "INCIDENT_HANDOVER_UNAVAILABLE",
    );

    const incidentAfter = incidentService.getIncident(sos.receipt.incidentId);
    expect(incidentAfter.assignedTo).toBeNull();
    const eventAfter = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(
      eventAfter.event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R5 repair: F2 the unified per-event lock serializes ack against reconcile", () => {
  it("F2: a concurrent authoritative reconcile can never overwrite an in-flight (or just-completed) acknowledgment with a stale pre-ack snapshot", async () => {
    const persistStatusDeferred = createDeferred<void>();
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async (event: {
        dutyAcknowledgement: {
          acknowledgedByActorId: string | null;
          acknowledgedAt: string | null;
        };
      }) => ({
        accepted: true,
        acknowledgedByActorId: event.dutyAcknowledgement.acknowledgedByActorId!,
        acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
      }),
      persistStatusTransition: async () => persistStatusDeferred.promise,
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService, incidentService } = setupService(
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "66666666-cccc-4ccc-8ccc-cccccccccccc",
    );
    const opsIdentity = buildOpsIdentity("ops-f2-race");

    incidentService.updateIncident(
      sos.receipt.incidentId,
      { status: "investigating" },
      undefined,
      opsIdentity,
    );

    // Start a readback that reconciles "investigating" onto the SOS event
    // and holds its own persistence open -- the exact overlap window the
    // old two-separate-locks implementation let a concurrent acknowledgment
    // race underneath, overwriting it with a stale pre-ack snapshot.
    const readbackCall = driverSosService.getOwnEventForDriver(
      sos.event.sosEventId,
      buildDriverIdentity(sos.event.driverId),
    );
    await Promise.resolve();
    await Promise.resolve();

    const ackCall = driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );

    persistStatusDeferred.resolve();
    const [, ack] = await Promise.all([readbackCall, ackCall]);

    expect(ack.wonAcknowledgement).toBe(true);
    expect(ack.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsIdentity.actorId,
    );

    // The unified per-event lock means the ack could not even start until
    // the reconcile fully settled, so this later readback must still see
    // the ack's owner -- never silently lost or reverted.
    const afterAck = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(afterAck.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsIdentity.actorId,
    );
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R5 repair: F4 authoritative readback does not stop at the first known owner", () => {
  it("F4: an authoritative later status without a known owner still propagates on readback instead of staying stuck at the cached status", async () => {
    let reloadCallCount = 0;
    const mockRepository = {
      isEnabled: () => false,
      reloadEventState: async (sosEventId: string) => {
        reloadCallCount += 1;
        return {
          event: {
            sosEventId,
            status: "duty_alerted" as const,
            dutyAcknowledgement: {
              acknowledgedAt: null,
              acknowledgedByActorId: null,
            },
          },
          timelines: [],
          outbox: null,
        };
      },
    } as unknown as DriverSosRepository;

    const auditService = new AuditNotificationService();
    const incidentService = new IncidentService(auditService);
    const driverSosService = new DriverSosService(
      auditService,
      incidentService,
      mockRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "77777777-dddd-4ddd-8ddd-dddddddddddd",
    );
    const opsIdentity = buildOpsIdentity("ops-f4-no-owner");

    const readback = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(reloadCallCount).toBeGreaterThan(0);
    expect(readback.event.status).toBe("duty_alerted");
    expect(
      readback.event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();
  });

  it("F4: an authoritative closed status propagates on readback even once this process already knows a duty owner", async () => {
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async (event: {
        dutyAcknowledgement: {
          acknowledgedByActorId: string | null;
          acknowledgedAt: string | null;
        };
      }) => ({
        accepted: true,
        acknowledgedByActorId: event.dutyAcknowledgement.acknowledgedByActorId!,
        acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
      }),
    } as unknown as DriverSosVerificationRepository;

    let reloadCallCount = 0;
    const mockRepository = {
      isEnabled: () => false,
      reloadEventState: async (sosEventId: string) => {
        reloadCallCount += 1;
        return {
          event: {
            sosEventId,
            status: "closed" as const,
            dutyAcknowledgement: {
              acknowledgedAt: "2026-10-16T00:00:00.000Z",
              acknowledgedByActorId: "ops-f4-owner",
            },
          },
          timelines: [],
          outbox: null,
        };
      },
    } as unknown as DriverSosRepository;

    const auditService = new AuditNotificationService();
    const incidentService = new IncidentService(auditService);
    const driverSosService = new DriverSosService(
      auditService,
      incidentService,
      mockRepository,
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "88888888-eeee-4eee-8eee-eeeeeeeeeeee",
    );
    const opsIdentity = buildOpsIdentity("ops-f4-owner");

    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );
    expect(ack.wonAcknowledgement).toBe(true);

    reloadCallCount = 0;
    const readback = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(reloadCallCount).toBeGreaterThan(0);
    expect(readback.event.status).toBe("closed");
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R6 repair: F1 durable confirmation of an already-equal owner", () => {
  it("F1: acknowledgeDuty fails honestly instead of claiming a win when the Incident's existing in-memory ownership was never durably confirmed", async () => {
    let persistCallCount = 0;
    const mockIncidentRepository = {
      isEnabled: () => true,
      persistChanges: async () => {
        persistCallCount += 1;
        throw new Error("simulated incident persistence failure");
      },
      reportPersistenceFailure: () => {},
    } as unknown as IncidentRepository;

    const auditService = new AuditNotificationService();
    const incidentService = new IncidentService(
      auditService,
      mockIncidentRepository,
    );
    const driverSosService = new DriverSosService(auditService, incidentService);
    const sos = await submitSos(
      driverSosService,
      "99999999-ffff-4fff-8fff-ffffffffffff",
    );
    const opsDirect = buildOpsIdentity("ops-direct");

    // The real reachable generic caller: PATCH /api/incidents/:id ->
    // updateIncident, whose own persistence is fire-and-forget and has
    // already failed asynchronously by the time acknowledgeDuty runs for
    // the same actor -- the in-memory assignedTo is set, but was never
    // durably confirmed.
    incidentService.updateIncident(
      sos.receipt.incidentId,
      { assignedTo: opsDirect.actorId as string },
      undefined,
      opsDirect,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(persistCallCount).toBeGreaterThan(0);

    let ackError: unknown;
    try {
      await driverSosService.acknowledgeDuty(
        sos.event.sosEventId,
        {},
        opsDirect,
      );
    } catch (error) {
      ackError = error;
    }
    expect((ackError as { code?: string })?.code).toBe(
      "INCIDENT_HANDOVER_UNAVAILABLE",
    );

    const eventAfter = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsDirect,
    );
    expect(
      eventAfter.event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R6 repair: F5 rejected claim preserves a concurrent unrelated Incident update", () => {
  it("F5: rolling back a rejected fresh Incident claim does not erase a status change that landed on the Incident while the claim write was in flight", async () => {
    const persistDeferred = createDeferred<void>();
    let persistCallCount = 0;
    const mockIncidentRepository = {
      isEnabled: () => true,
      persistChanges: async () => {
        persistCallCount += 1;
        if (persistCallCount === 1) {
          await persistDeferred.promise;
          throw new Error("simulated incident persistence failure");
        }
        return undefined;
      },
      reportPersistenceFailure: () => {},
    } as unknown as IncidentRepository;

    const auditService = new AuditNotificationService();
    const incidentService = new IncidentService(
      auditService,
      mockIncidentRepository,
    );
    const driverSosService = new DriverSosService(auditService, incidentService);
    const sos = await submitSos(
      driverSosService,
      "aaaaaaaa-0000-4000-8000-000000000001",
    );
    const opsIdentity = buildOpsIdentity("ops-f5-claim");

    const ackCall = driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );
    // Let the ack call reach (and block inside) its await on the held-open
    // fresh Incident claim write -- the claim itself already committed
    // synchronously before this point.
    await Promise.resolve();
    await Promise.resolve();

    // An unrelated concurrent status update lands on the Incident while
    // the claim's durability confirmation is still in flight.
    incidentService.updateIncident(
      sos.receipt.incidentId,
      { status: "investigating" },
      undefined,
      opsIdentity,
    );
    expect(
      incidentService.getIncident(sos.receipt.incidentId).status,
    ).toBe("investigating");

    persistDeferred.resolve();
    await expect(ackCall).rejects.toThrow();

    const incidentAfter = incidentService.getIncident(sos.receipt.incidentId);
    // The rejected claim's own assignedTo write must be rolled back...
    expect(incidentAfter.assignedTo).toBeNull();
    // ...but the concurrent status change must survive, not be clobbered
    // by restoring the entire pre-claim snapshot captured before this
    // method's first await.
    expect(incidentAfter.status).toBe("investigating");
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R6 repair: F1 competing-instance convergence releases a losing fresh claim", () => {
  it("F1 competing-instance: a losing SOS-side CAS result releases this call's own fresh Incident claim so the real winner can durably converge", async () => {
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async () => ({
        accepted: false,
        acknowledgedByActorId: "ops-db-winner",
        acknowledgedAt: "2026-10-16T00:00:00.000Z",
      }),
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService, incidentService } = setupService(
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "bbbbbbbb-0000-4000-8000-000000000002",
    );
    const localOps = buildOpsIdentity("ops-local-claim");

    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      localOps,
    );

    expect(ack.wonAcknowledgement).toBe(false);
    expect(ack.dutyAcknowledgement.acknowledgedByActorId).toBe(
      "ops-db-winner",
    );

    // Before this fix, the just-created local claim ("ops-local-claim")
    // was never released, so repairIncidentHandover's attempt to assign
    // the real winner was discarded as a conflict and the Incident stayed
    // durably assigned to a loser that never actually won the SOS CAS.
    const incidentAfter = incidentService.getIncident(sos.receipt.incidentId);
    expect(incidentAfter.assignedTo).toBe("ops-db-winner");
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R6 repair: F2 render application never clobbers a concurrent acknowledgment", () => {
  it("F2: a render observation that resolves after a concurrent acknowledgment completes does not erase the ack or duplicate its timeline on replay", async () => {
    const renderDeferred = createDeferred<{
      sosEventId: string;
      incidentId: string;
      eventNo: string;
      fleetReportConfirmedAt: string;
      opsAlertRenderedAt: string;
      opsAlertReceiptRecordedAt: string;
      alertToOpsLatencyMs: number;
      duplicate: boolean;
      dutyAlertApplied: boolean;
    }>();
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistAlertObservation: async () => renderDeferred.promise,
      persistDutyAcknowledgement: async (event: {
        dutyAcknowledgement: {
          acknowledgedByActorId: string | null;
          acknowledgedAt: string | null;
        };
      }) => ({
        accepted: true,
        acknowledgedByActorId: event.dutyAcknowledgement.acknowledgedByActorId!,
        acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
      }),
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService } = setupService(mockVerificationRepository);
    const sos = await submitSos(
      driverSosService,
      "cccccccc-0000-4000-8000-000000000003",
    );
    const opsIdentity = buildOpsIdentity("ops-render-race");

    const renderedAt = new Date(
      Date.parse(sos.receipt.fleetReportConfirmedAt) + 1_000,
    ).toISOString();
    const renderCall = driverSosService.recordOpsAlertsRendered(
      { incidentIds: [sos.receipt.incidentId], renderedAt },
      opsIdentity,
    );
    // Let the render call reach (and block inside) its await on the
    // held-open external persistence completion.
    await Promise.resolve();
    await Promise.resolve();

    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );
    expect(ack.wonAcknowledgement).toBe(true);

    // The render's delayed response now resolves, after the ack already
    // committed -- a legitimate ordering since the render's commit can
    // precede the ack while its own response completes after it.
    renderDeferred.resolve({
      sosEventId: sos.event.sosEventId,
      incidentId: sos.receipt.incidentId,
      eventNo: sos.event.eventNo,
      fleetReportConfirmedAt: sos.receipt.fleetReportConfirmedAt,
      opsAlertRenderedAt: renderedAt,
      opsAlertReceiptRecordedAt: new Date().toISOString(),
      alertToOpsLatencyMs: 1000,
      duplicate: false,
      dutyAlertApplied: true,
    });
    await renderCall;

    const readback = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(readback.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsIdentity.actorId,
    );
    expect(readback.event.status).toBe("acknowledged");
    expect(
      readback.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(1);

    // A replay must not create a second local duty timeline either.
    const replay = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );
    expect(replay.wonAcknowledgement).toBe(true);
    expect(
      replay.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(1);
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R6 repair: F2 progression never regresses on duty acknowledgment", () => {
  it("F2 progression: acknowledging duty after the Incident has already progressed to investigating does not move the SOS event's status backward", async () => {
    const { driverSosService, incidentService } = setupService();
    const sos = await submitSos(
      driverSosService,
      "dddddddd-0000-4000-8000-000000000004",
    );
    const opsIdentity = buildOpsIdentity("ops-progress-regression");

    incidentService.updateIncident(
      sos.receipt.incidentId,
      { status: "investigating" },
      undefined,
      opsIdentity,
    );
    // Reconcile the Incident's progression onto the SOS event before duty
    // acknowledgment ever happens -- the real reachable order a late/slow
    // Ops caller can hit.
    const beforeAck = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(beforeAck.event.status).toBe("investigating");

    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsIdentity,
    );
    expect(ack.wonAcknowledgement).toBe(true);
    expect(ack.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsIdentity.actorId,
    );
    expect(ack.event.status).toBe("investigating");

    const afterAck = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsIdentity,
    );
    expect(afterAck.event.status).toBe("investigating");
    expect(afterAck.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsIdentity.actorId,
    );
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R7 repair: F1 durable confirmation of a foreign (different-actor) owner", () => {
  it("F1: a different Ops actor's acknowledgeDuty fails honestly instead of winning under an unconfirmed foreign Incident owner, and the original actor's replay also fails until durability is confirmed", async () => {
    let persistCallCount = 0;
    const mockIncidentRepository = {
      isEnabled: () => true,
      persistChanges: async () => {
        persistCallCount += 1;
        throw new Error("simulated incident persistence failure");
      },
      reportPersistenceFailure: () => {},
    } as unknown as IncidentRepository;

    const auditService = new AuditNotificationService();
    const incidentService = new IncidentService(
      auditService,
      mockIncidentRepository,
    );
    const driverSosService = new DriverSosService(auditService, incidentService);
    const sos = await submitSos(
      driverSosService,
      "eeeeeeee-0000-4000-8000-000000000005",
    );
    const opsUnconfirmed = buildOpsIdentity("ops-unconfirmed");
    const opsOther = buildOpsIdentity("ops-other");

    // The real reachable generic caller: PATCH /api/incidents/:id ->
    // updateIncident sets assignedTo in memory synchronously; its own
    // fire-and-forget persistence then fails asynchronously. Nothing
    // durably confirmed this ownership.
    incidentService.updateIncident(
      sos.receipt.incidentId,
      { assignedTo: opsUnconfirmed.actorId as string },
      undefined,
      opsUnconfirmed,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(persistCallCount).toBeGreaterThan(0);

    // A different Ops actor tries to acknowledge duty. Before this fix,
    // assignIncidentOwnerDurable's foreign-owner branch returned the
    // unconfirmed in-memory value directly as a trusted "currentOwner",
    // and acknowledgeDuty committed a duty_acknowledged timeline under
    // that unconfirmed actor.
    let firstError: unknown;
    try {
      await driverSosService.acknowledgeDuty(sos.event.sosEventId, {}, opsOther);
    } catch (error) {
      firstError = error;
    }
    expect((firstError as { code?: string })?.code).toBe(
      "INCIDENT_HANDOVER_UNAVAILABLE",
    );

    const afterFirstAttempt = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsOther,
    );
    expect(
      afterFirstAttempt.event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();
    expect(afterFirstAttempt.event.status).toBe("submitted");

    // The originally-assigned (but never durably confirmed) actor's own
    // replay must also fail honestly, not silently succeed.
    let replayError: unknown;
    try {
      await driverSosService.acknowledgeDuty(
        sos.event.sosEventId,
        {},
        opsUnconfirmed,
      );
    } catch (error) {
      replayError = error;
    }
    expect((replayError as { code?: string })?.code).toBe(
      "INCIDENT_HANDOVER_UNAVAILABLE",
    );

    const afterReplay = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsOther,
    );
    expect(
      afterReplay.event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();

    // Once the database recovers, the same actor's acknowledgment durably
    // succeeds and the SOS event honestly reflects the real confirmed
    // owner on authoritative readback.
    persistCallCount = 0;
    (mockIncidentRepository as unknown as { persistChanges: () => Promise<void> }).persistChanges =
      async () => undefined;
    const recovered = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      opsUnconfirmed,
    );
    expect(recovered.wonAcknowledgement).toBe(true);
    expect(recovered.dutyAcknowledgement.acknowledgedByActorId).toBe(
      opsUnconfirmed.actorId,
    );

    const afterRecovery = await driverSosService.getEventForOps(
      sos.event.sosEventId,
      opsOther,
    );
    expect(
      afterRecovery.event.dutyAcknowledgement.acknowledgedByActorId,
    ).toBe(opsUnconfirmed.actorId);
  });
});

describe("SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015 R7 repair: F1 competing-instance convergence without a fresh claim", () => {
  it("F1 competing-instance: a non-fresh (already-assigned) Incident owner still durably converges to the real SOS-side CAS winner", async () => {
    const mockVerificationRepository = {
      isEnabled: () => true,
      persistDutyAcknowledgement: async () => ({
        accepted: false,
        acknowledgedByActorId: "ops-db-winner",
        acknowledgedAt: "2026-10-16T00:00:00.000Z",
      }),
    } as unknown as DriverSosVerificationRepository;

    const { driverSosService, incidentService } = setupService(
      mockVerificationRepository,
    );
    const sos = await submitSos(
      driverSosService,
      "ffffffff-0000-4000-8000-000000000006",
    );
    const localLoser = buildOpsIdentity("ops-local-loser");

    // Simulate a separate service instance's already-durable direct
    // assignment -- the Incident is assigned to `localLoser` BEFORE
    // acknowledgeDuty runs, not via a fresh claim made inside this call.
    incidentService.updateIncident(
      sos.receipt.incidentId,
      { assignedTo: localLoser.actorId as string },
      undefined,
      localLoser,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(
      incidentService.getIncident(sos.receipt.incidentId).assignedTo,
    ).toBe("ops-local-loser");

    const ack = await driverSosService.acknowledgeDuty(
      sos.event.sosEventId,
      {},
      localLoser,
    );

    expect(ack.wonAcknowledgement).toBe(false);
    expect(ack.dutyAcknowledgement.acknowledgedByActorId).toBe(
      "ops-db-winner",
    );

    // Before this fix, this call's Incident claim was NOT a fresh claim
    // (wasNewClaim: false, since the Incident was already durably assigned
    // to localLoser), so the losing-claim release path never ran and
    // repairIncidentHandover's attempt to converge onto the real winner
    // was discarded as a conflict by assignIncidentOwnerDurable's
    // first-owner-wins arbitration. The Incident stayed durably assigned
    // to a loser that never actually won the SOS CAS, with no replay able
    // to converge it.
    const incidentAfter = incidentService.getIncident(sos.receipt.incidentId);
    expect(incidentAfter.assignedTo).toBe("ops-db-winner");
  });
});
