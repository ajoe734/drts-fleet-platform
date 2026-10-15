import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverSosService } from "../../../apps/api/src/modules/driver-sos/driver-sos.service";
import type { DriverSosVerificationRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos-verification.repository";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

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
      acknowledgedByActorId: actorA.actorId,
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
