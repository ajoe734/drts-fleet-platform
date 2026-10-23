// REFERRAL-DEMO-CROSS-INSTANCE-COMPLETION-20261023: the demo trip's manual
// `complete()` tap and the destination `heartbeat()` auto-completion can
// both race to finish the SAME task from two separate service instances,
// each with its own local task cache. These cases drive the *real* public
// `ReferralDemoTripService.complete`/`heartbeat` entry points through two
// independent `OwnedMobilityService` instances that share one persisted
// store, so the production completion path (including
// `finalizeDriverTaskCompletionInTransaction`'s own
// `TASK_ALREADY_COMPLETED` check) is never mocked or re-implemented here --
// only the external repository/registry/audit/event/tariff/route ports are
// replaced.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { ReferralDemoTripService } from "../../../apps/api/src/modules/owned-mobility/referral-demo-trip.service";

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.REFERRAL_DEMO_TRIP_ENABLED = "true";
  process.env.DRTS_ENV = "test";
});
afterEach(() => {
  process.env = { ...savedEnv };
});

const identity = {
  realm: "partner",
  actorType: "referral_passenger",
  actorId: "synthetic-passenger",
  drtsPassengerId: "synthetic-passenger",
  tenantId: "synthetic-tenant",
  partnerId: "synthetic-partner",
  partnerProgramId: "synthetic-program",
  partnerEntrySlug: "synthetic-entry",
  scopes: ["partner:book"],
} as unknown as BootstrapRequestIdentity;

const tariff = {
  sourceReference: "synthetic test tariff",
  version: "synthetic-fare-v1",
  effectiveAt: "2023-04-01T00:00:00+08:00",
  effectiveUntil: null,
  baseFare: 85,
  baseDistanceMeters: 1250,
  distanceRate: 5,
  distanceIncrementMeters: 200,
  delayRate: 5,
  delayIncrementSeconds: 60,
  nightSurchargeAmount: 20,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  nightApplication: "pickup",
  additionalFees: {},
  distanceRounding: "ceil",
  delayRounding: "ceil",
  totalRounding: "nearest",
  totalIncrement: 5,
};

type ExternalFailure = "persist" | "audit" | "event" | undefined;
type DemoMethod = "complete" | "heartbeat";

/**
 * Wires the real `OwnedMobilityService` + `ReferralDemoTripService` twice --
 * once as the "loser" instance under test and once as a "winner" instance --
 * sharing a single in-memory persisted store through the repository port,
 * exactly as two separate service processes would share one database. When
 * `race` is set, the loser's own completion transaction triggers the
 * winner's real completion of the SAME task at the point a real repository
 * read would observe it (`loadDriverTaskCompletionBundleForUpdate`), so the
 * loser's `completeDriverTask` call raises the task's own real
 * `TASK_ALREADY_COMPLETED` conflict, not a simulated one. `failAt` instead
 * makes the loser's own write/audit/event boundary reject, to prove a
 * genuine failure still propagates.
 */
function buildServices(options: {
  failAt?: ExternalFailure;
  race?: { loserMethod: DemoMethod; winnerMethod: DemoMethod };
}) {
  const error = new Error(`EXTERNAL_${options.failAt ?? "none"}_FAILURE`);
  let persistCalls = 0;
  let auditCalls = 0;
  let eventCalls = 0;
  let completionOutbox = 0;
  let offlineCalls = 0;
  let raceStarted = false;

  const order = {
    orderId: "probe-order",
    status: "on_trip",
    tenantId: identity.tenantId,
    partnerId: identity.partnerId,
    partnerProgramId: identity.partnerProgramId,
    partnerEntrySlug: identity.partnerEntrySlug,
    serviceBucket: "business_dispatch",
    serviceProductCode: "enterprise_dispatch",
    passenger: {
      passengerId: identity.actorId,
      name: "synthetic",
      phone: "0900000000",
    },
    pickup: { lat: 25.01, lng: 121.46, address: "synthetic" },
    dropoff: { lat: 25.04, lng: 121.56, address: "synthetic" },
    businessDispatchSubtype: "enterprise_dispatch",
    proofRequirements: {
      minPhotoCount: 1,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalRequestIds: [],
    complianceFlags: [],
    tags: [],
    referralPassengerLifecycle: {
      quote: { pricingAt: "2026-10-21T02:00:00.000Z" },
    },
  };
  const task = {
    taskId: "probe-task",
    assignmentId: "probe-assignment",
    orderId: "probe-order",
    driverId: "referral-demo-driver-1",
    vehicleId: "referral-demo-vehicle-1",
    status: "on_trip",
    // Past the 3-minute ride fallback used when the quote has no route
    // time, so the destination heartbeat auto-completes without waiting.
    startedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    proof: { photos: [], expenseItems: [] },
  };
  const persisted = {
    orders: [structuredClone(order)],
    driverTasks: [structuredClone(task)],
    dispatchJobs: [] as unknown[],
    dispatchAttempts: [] as unknown[],
    dispatchAssignments: [
      {
        assignmentId: "probe-assignment",
        orderId: order.orderId,
        taskId: task.taskId,
        // Reconciliation requires `assigned` only while the task is still
        // `pending_acceptance`; this demo task starts `on_trip`.
        status: "accepted",
        driverId: task.driverId,
        vehicleId: task.vehicleId,
      },
    ],
    dispatchTraceLogs: [] as unknown[],
    passengerDisclosureSnapshots: [] as unknown[],
  };

  const commit = (changes: Record<string, unknown[]>) => {
    persistCalls++;
    if (options.failAt === "persist") throw error;
    for (const key of Object.keys(changes))
      (persisted as Record<string, unknown[]>)[key] = structuredClone(
        changes[key]!,
      );
  };

  // Replaced once both demo instances exist, below -- the winner's call
  // runs from inside the loser's own transaction, at the point a real
  // repository read would observe the other instance's commit.
  let runWinner: () => Promise<unknown> = async () => undefined;

  const repository = {
    isEnabled: () => true,
    findOrderById: async () => structuredClone(persisted.orders[0]),
    withTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({}),
    lockDispatchAssignmentForUpdate: async () =>
      structuredClone(persisted.dispatchAssignments[0]),
    lockDriverTaskForUpdate: async () =>
      structuredClone(persisted.driverTasks[0]),
    persistOrderWorkflow: async (
      _tx: unknown,
      changes: Record<string, unknown[]>,
    ) => commit(changes),
    occupyDispatchResourceReservations: async () => undefined,
    loadOrderActionContext: async () => structuredClone(persisted),
    persistChanges: async (changes: Record<string, unknown[]>) =>
      commit(changes),
    reportPersistenceFailure: () => undefined,
    releaseDispatchResourceReservations: async () => undefined,
    persistDriverCompletionOutbox: async (_tx: unknown, records: unknown[]) => {
      completionOutbox += records.length;
    },
    // Matches the concrete production repository: present, but an empty
    // claim delivers no background effect for this unit boundary.
    claimNextRecoverableDriverCompletionOutbox: async () => null,
    hasDriverTaskTraceRequestId: async () => false,
    loadDriverTaskCompletionBundleForUpdate: async () => {
      if (options.race && !raceStarted) {
        raceStarted = true;
        await runWinner();
      }
      return structuredClone({
        order: persisted.orders[0],
        task: persisted.driverTasks[0],
        assignment: persisted.dispatchAssignments[0],
        dispatchJob: {
          dispatchJobId: "probe-job",
          orderId: order.orderId,
          status: "assigned",
        },
      });
    },
  };
  const registry = {
    updateDriverWorkStateFromPersistence: async () => {
      offlineCalls++;
    },
    prepareDispatchSupply: async () => undefined,
    listVehicles: () => [],
    recordDriverLocationBatch: async () => ({ items: [] }),
  };
  const tenantPartner = {
    getPartnerEntry: async () => ({
      status: "active",
      activeFlag: true,
      partnerType: "referral_channel",
      businessDispatchSubtype: "enterprise_dispatch",
      tenantId: identity.tenantId,
      partnerId: identity.partnerId,
      programId: identity.partnerProgramId,
    }),
    getLatestReferralEmbedConsent: async () => ({ accepted: true }),
  };
  const audit = {
    recordAuditLogAsync: async () => {
      auditCalls++;
      if (options.failAt === "audit") throw error;
    },
  };
  const events = {
    publishTaskUpdated: async () => {
      eventCalls++;
      if (options.failAt === "event") throw error;
    },
  };

  const makeOwned = () => {
    const service = new OwnedMobilityService(
      registry as never,
      audit as never,
      {} as never,
      events as never,
      undefined,
      repository as never,
      tenantPartner as never,
    );
    (
      service as unknown as { partnerUserIdentityLinkRepository: unknown }
    ).partnerUserIdentityLinkRepository = {
      findByDrtsPassengerId: async () => ({ status: "active" }),
    };
    return service;
  };
  const makeDemo = (owned: OwnedMobilityService) =>
    new ReferralDemoTripService(
      owned,
      registry as never,
      {} as never,
      {} as never,
      { publishedTariff: async () => tariff } as never,
      {
        route: async () => ({ distanceMeters: 5250, durationSeconds: 900 }),
      } as never,
      {} as never,
    );

  const loserDemo = makeDemo(makeOwned());
  const winnerDemo = makeDemo(makeOwned());
  if (options.race) {
    const { winnerMethod } = options.race;
    runWinner = () =>
      winnerDemo[winnerMethod](order.orderId, identity, "winner-request");
  }

  return {
    loserDemo,
    winnerDemo,
    error,
    persisted,
    counts: () => ({
      persistCalls,
      auditCalls,
      eventCalls,
      completionOutbox,
      offlineCalls,
    }),
  };
}

describe("ReferralDemoTripService completion: real cross-instance tap/heartbeat race", () => {
  it("lets a losing tap tolerate a winning destination heartbeat from a separate instance, exactly once", async () => {
    const { loserDemo, persisted, counts } = buildServices({
      race: { loserMethod: "complete", winnerMethod: "heartbeat" },
    });
    const result = await loserDemo.complete(
      "probe-order",
      identity,
      "loser-request",
    );
    expect(result).toMatchObject({
      orderId: "probe-order",
      status: "completed",
    });
    expect(persisted.driverTasks[0]!.status).toBe("completed");
    expect(persisted.orders[0]!.status).toBe("completed");
    expect(counts()).toMatchObject({
      persistCalls: 1,
      completionOutbox: 5,
      offlineCalls: 1,
    });
  });

  it("lets a losing destination heartbeat tolerate a winning tap from a separate instance, exactly once", async () => {
    const { loserDemo, persisted, counts } = buildServices({
      race: { loserMethod: "heartbeat", winnerMethod: "complete" },
    });
    const result = await loserDemo.heartbeat(
      "probe-order",
      identity,
      "loser-request",
    );
    expect(result).toMatchObject({
      orderId: "probe-order",
      status: "completed",
    });
    expect(persisted.driverTasks[0]!.status).toBe("completed");
    expect(persisted.orders[0]!.status).toBe("completed");
    expect(counts()).toMatchObject({
      persistCalls: 1,
      completionOutbox: 5,
      offlineCalls: 1,
    });
  });
});

describe("ReferralDemoTripService completion: real stage/error regressions", () => {
  it("propagates a real repository write rejection instead of swallowing it as a completed race", async () => {
    const { loserDemo, error, persisted, counts } = buildServices({
      failAt: "persist",
    });
    await expect(
      loserDemo.complete("probe-order", identity, "req-1"),
    ).rejects.toBe(error);
    expect(persisted.driverTasks[0]!.status).toBe("on_trip");
    expect(counts()).toMatchObject({
      persistCalls: 1,
      completionOutbox: 0,
      offlineCalls: 0,
    });
  });

  it("still resolves a normal completion with no race or external failure", async () => {
    const { loserDemo, persisted, counts } = buildServices({});
    const result = await loserDemo.complete("probe-order", identity, "req-1");
    expect(result).toMatchObject({ status: "completed" });
    expect(persisted.driverTasks[0]!.status).toBe("completed");
    expect(counts()).toMatchObject({
      persistCalls: 1,
      completionOutbox: 5,
      offlineCalls: 1,
    });
  });
});
