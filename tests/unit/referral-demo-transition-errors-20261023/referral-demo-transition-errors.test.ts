// REFERRAL-DEMO-TRANSITION-ERROR-PROPAGATION-20261023 (PR2952-F1): the demo
// trip's `advanceTo` must not swallow a genuine persistence/audit/outbox
// failure as a tolerable race. These cases drive the *real* public
// `ReferralDemoTripService.arrive`/`board` entry points through the *real*
// `OwnedMobilityService` driver-task transitions (accept/depart/arrive/
// start), with only the external repository/audit/event ports replaced --
// the production transition logic itself (including `assertDriverTaskTransition`
// and the lock-checked accept path) is never mocked or re-implemented here.
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

function orderFixture(status: string) {
  return {
    orderId: "probe-order",
    status,
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
    proofRequirements: { minPhotoCount: 1 },
    approvalRequestIds: [],
    complianceFlags: [],
    tags: [],
    referralPassengerLifecycle: {
      quote: { pricingAt: "2026-10-21T02:00:00.000Z" },
    },
  };
}

function taskFixture(status: string) {
  return {
    taskId: "probe-task",
    assignmentId: "probe-assignment",
    orderId: "probe-order",
    driverId: "referral-demo-driver-1",
    vehicleId: "referral-demo-vehicle-1",
    status,
    proof: { photos: [], expenseItems: [] },
  };
}

type ExternalFailure = "persist" | "audit" | "event" | undefined;

/**
 * Wires the real `OwnedMobilityService` + `ReferralDemoTripService` with a
 * minimal in-memory repository port, so every transition (including
 * `assertDriverTaskTransition` and the accept path's row-lock re-check) runs
 * as in production. `failAt` makes exactly one external boundary -- the
 * repository write, the audit log, or the outbox/event publish -- reject
 * after the driver command has already mutated its local state, mirroring
 * PR2952-F1's concrete reproduction.
 */
function buildServices(options: {
  initialStatus: string;
  failAt?: ExternalFailure;
  onSecondReload?: () => Promise<void>;
}) {
  const error = new Error(`EXTERNAL_${options.failAt ?? "none"}_FAILURE`);
  let persistCalls = 0;
  let auditCalls = 0;
  let eventCalls = 0;
  let reloads = 0;
  let secondReloadStarted = false;

  const order = orderFixture(options.initialStatus);
  const task = taskFixture(options.initialStatus);
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
        status: "assigned",
        driverId: task.driverId,
        vehicleId: task.vehicleId,
      },
    ],
    dispatchTraceLogs: [] as unknown[],
    passengerDisclosureSnapshots: [] as unknown[],
  };

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
    ) => {
      persistCalls++;
      for (const key of Object.keys(changes))
        (persisted as Record<string, unknown[]>)[key] = structuredClone(
          changes[key]!,
        );
    },
    occupyDispatchResourceReservations: async () => undefined,
    loadOrderActionContext: async () => {
      reloads++;
      if (options.onSecondReload && reloads === 2 && !secondReloadStarted) {
        secondReloadStarted = true;
        await options.onSecondReload();
      }
      return structuredClone(persisted);
    },
    persistChanges: async (changes: Record<string, unknown[]>) => {
      persistCalls++;
      if (options.failAt === "persist") throw error;
      for (const key of Object.keys(changes))
        (persisted as Record<string, unknown[]>)[key] = structuredClone(
          changes[key]!,
        );
    },
    reportPersistenceFailure: () => undefined,
  };
  const registry = {
    prepareDispatchSupply: async () => undefined,
    listVehicles: () => [],
    recordDriverLocationBatch: async () => {
      return { items: [] };
    },
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
      service as unknown as {
        partnerUserIdentityLinkRepository: unknown;
      }
    ).partnerUserIdentityLinkRepository = {
      findByDrtsPassengerId: async () => ({ status: "active" }),
    };
    return service;
  };
  const owned = makeOwned();
  const winner = makeOwned();
  const demo = new ReferralDemoTripService(
    owned,
    registry as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    demo,
    owned,
    winner,
    error,
    persisted,
    counts: () => ({ persistCalls, auditCalls, eventCalls, reloads }),
  };
}

describe("ReferralDemoTripService arrive/board: real transition, external-boundary failures", () => {
  it("propagates a real repository write rejection for arrive", async () => {
    const { demo, error } = buildServices({
      initialStatus: "enroute_pickup",
      failAt: "persist",
    });
    await expect(demo.arrive("probe-order", identity, "req-1")).rejects.toBe(
      error,
    );
  });

  it("propagates a real audit-log failure after arrive already persisted", async () => {
    const { demo, error, persisted } = buildServices({
      initialStatus: "enroute_pickup",
      failAt: "audit",
    });
    await expect(demo.arrive("probe-order", identity, "req-1")).rejects.toBe(
      error,
    );
    // The write genuinely committed before the audit step failed.
    expect(persisted.driverTasks[0]!.status).toBe("arrived_pickup");
  });

  it("propagates a real outbox/event failure after arrive already persisted", async () => {
    const { demo, error, persisted } = buildServices({
      initialStatus: "enroute_pickup",
      failAt: "event",
    });
    await expect(demo.arrive("probe-order", identity, "req-1")).rejects.toBe(
      error,
    );
    expect(persisted.driverTasks[0]!.status).toBe("arrived_pickup");
  });

  it("still resolves a normal arrive with no external failure", async () => {
    const { demo } = buildServices({ initialStatus: "enroute_pickup" });
    await expect(
      demo.arrive("probe-order", identity, "req-1"),
    ).resolves.toMatchObject({ status: "arrived_pickup" });
  });

  it("propagates a real repository write rejection for board", async () => {
    const { demo, error } = buildServices({
      initialStatus: "arrived_pickup",
      failAt: "persist",
    });
    await expect(demo.board("probe-order", identity, "req-1")).rejects.toBe(
      error,
    );
  });

  it("propagates a real audit-log failure after board already persisted", async () => {
    const { demo, error, persisted } = buildServices({
      initialStatus: "arrived_pickup",
      failAt: "audit",
    });
    await expect(demo.board("probe-order", identity, "req-1")).rejects.toBe(
      error,
    );
    expect(persisted.driverTasks[0]!.status).toBe("on_trip");
  });

  it("propagates a real outbox/event failure after board already persisted", async () => {
    const { demo, error, persisted } = buildServices({
      initialStatus: "arrived_pickup",
      failAt: "event",
    });
    await expect(demo.board("probe-order", identity, "req-1")).rejects.toBe(
      error,
    );
    expect(persisted.driverTasks[0]!.status).toBe("on_trip");
  });

  it("still resolves a normal board with no external failure", async () => {
    const { demo } = buildServices({ initialStatus: "arrived_pickup" });
    await expect(
      demo.board("probe-order", identity, "req-1"),
    ).resolves.toMatchObject({ status: "on_trip" });
  });

  it("carries on from a real concurrent board that genuinely finished the step first", async () => {
    const { demo, winner } = buildServices({
      initialStatus: "arrived_pickup",
      onSecondReload: async () => {
        await winner.prepareOrderAction({ taskId: "probe-task" });
        await winner.startDriverTask(
          "probe-task",
          { startedAt: new Date().toISOString() },
          "winner-request",
        );
      },
    });
    await expect(
      demo.board("probe-order", identity, "req-1"),
    ).resolves.toMatchObject({ status: "on_trip" });
  });

  it("carries on from a real concurrent accept that genuinely closed the assignment first", async () => {
    const { demo, winner } = buildServices({
      initialStatus: "pending_acceptance",
      onSecondReload: async () => {
        await winner.prepareOrderAction({ taskId: "probe-task" });
        await winner.acceptDriverTask(
          "probe-task",
          { acceptedAt: new Date().toISOString() },
          "winner-request",
        );
      },
    });
    await expect(
      demo.arrive("probe-order", identity, "req-1"),
    ).resolves.toMatchObject({ status: "arrived_pickup" });
  });
});
