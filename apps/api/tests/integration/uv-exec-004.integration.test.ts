import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { OwnedOrderRecord } from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import {
  OwnedMobilityRepository,
  OwnedOrderDuplicateVoiceLinkError,
  OwnedOrderVersionConflictError,
} from "../../src/modules/owned-mobility/owned-mobility.repository";

// UV-EXEC-004: SD §7.1/§7.5 -- pure-prepare + shared PoolClient UoW +
// aggregateVersion/CAS on the real runtime table `ops.phase1_owned_orders`
// (infra/migrations/V0089). This suite assumes migrations have already been
// applied to DATABASE_URL (operations/database/db-apply.sh), exactly like
// the other `*.integration.test.ts` suites in this repo -- it is not itself
// a migration runner.
//
// What this suite is evidence for (UV-EXEC-004 required_acceptance:
// postgres_cas_rollback_evidence):
//   1. `insertVoiceOrder` is CAS-versioned from creation (aggregate_version
//      starts at 1, generated from `record.aggregateVersion`) and rejects a
//      colliding voice_intent_id/call_id instead of silently overwriting
//      another writer's order (SD §7.2 UNIQUE(voice_intent_id), §7.5
//      UNIQUE(call_id) on the real runtime table).
//   2. `updateOrderWithCas` rejects a write whose `expectedVersion` no
//      longer matches the durable row -- the two-instances-racing-on-a-
//      stale-snapshot scenario SD §7.5 requires to be blocked, not
//      last-write-wins.
//   3. A transaction that fails for any reason (CAS conflict, an error
//      thrown while preparing the next state) leaves the row completely
//      unchanged -- no partial write survives a rollback.
//   4. `withTransaction`'s lock/statement deadline (SD §7.1: "DB transaction
//      設 lock／statement deadline") actually fires: a second transaction
//      blocked on the same row's `FOR UPDATE` lock fails fast instead of
//      hanging indefinitely.

const DATABASE_URL = process.env.DATABASE_URL;

function buildOrderFixture(
  overrides: Partial<OwnedOrderRecord> & { orderId: string },
): OwnedOrderRecord {
  const now = new Date().toISOString();
  return {
    orderId: overrides.orderId,
    orderNo: `ON-${overrides.orderId}`,
    orderSource: "voice_agent",
    orderDomain: "owned",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    passengerDisclosure: null,
    serviceBucket: "standard_taxi",
    dispatchSemantics: "immediate",
    businessDispatchSubtype: null,
    status: "ready_for_dispatch",
    pickup: { address: "台北車站" },
    dropoff: { address: "松山機場" },
    passenger: { name: "UV-EXEC-004 Rider", phone: "0911000222" },
    bookingId: null,
    bookingType: null,
    etaSnapshot: null,
    callId: null,
    voiceIntentId: null,
    recordingId: null,
    reservationWindowStart: null,
    reservationWindowEnd: null,
    recurrenceRule: null,
    modifiableUntil: null,
    cancelableUntil: null,
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes: null,
    fixedPrice: false,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    exceptionHold: null,
    proofRequirements: {
      minPhotoCount: 0,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    approvalState: "not_required",
    approvalRequestIds: [],
    complianceFlags: [],
    cancelledAt: null,
    cancelReason: null,
    reservationHoldStatus: "none",
    reservationHoldId: null,
    reservationHoldExpiresAt: null,
    dispatchAttemptCount: 0,
    lastDispatchFailureReason: null,
    noSupplyEscalation: null,
    dispatchTimeout: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as OwnedOrderRecord;
}

async function readOrderRow(database: DatabaseService, orderId: string) {
  const result = await database.query<{
    record: unknown;
    aggregate_version: number;
    call_id: string | null;
    voice_intent_id: string | null;
  }>(
    `
      SELECT record, aggregate_version, call_id, voice_intent_id
      FROM ops.phase1_owned_orders
      WHERE order_id = $1
    `,
    [orderId],
  );
  return result.rows[0] ?? null;
}

describe("UV-EXEC-004 owned-order UoW / CAS transaction primitives", () => {
  const databases: DatabaseService[] = [];
  const orderIds: string[] = [];

  afterEach(async () => {
    if (DATABASE_URL && orderIds.length > 0) {
      const cleanupDatabase = new DatabaseService();
      try {
        await cleanupDatabase.query(
          `DELETE FROM ops.phase1_owned_orders WHERE order_id = ANY($1)`,
          [orderIds.splice(0)],
        );
      } finally {
        await cleanupDatabase.onModuleDestroy();
      }
    }
    for (const database of databases.splice(0)) {
      await database.onModuleDestroy();
    }
  });

  function trackOrder(orderId: string) {
    orderIds.push(orderId);
    return orderId;
  }

  it("requires DATABASE_URL", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  it("insertVoiceOrder starts a durable order at aggregate_version 1 and rejects a colliding voice_intent_id", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec004-${randomUUID()}`);
    const voiceIntentId = randomUUID();
    const order = buildOrderFixture({
      orderId,
      callId: `call-uvexec004-${randomUUID()}`,
      voiceIntentId,
    });

    const version = await repository.withTransaction((client) =>
      repository.insertVoiceOrder(client, order),
    );
    expect(version).toBe(1);

    const row = await readOrderRow(database, orderId);
    expect(row?.aggregate_version).toBe(1);
    expect(row?.voice_intent_id).toBe(voiceIntentId);
    expect(
      (row?.record as { aggregateVersion?: number })?.aggregateVersion,
    ).toBe(1);

    // A second writer racing on the exact same voice intent (e.g. a retried
    // command that generated a fresh order_id instead of replaying the
    // original receipt) must be rejected, not silently create a second
    // order for the same intent (SD §7.2 UNIQUE(voice_intent_id)).
    const collidingOrderId = trackOrder(`order-uvexec004-${randomUUID()}`);
    const collidingOrder = buildOrderFixture({
      orderId: collidingOrderId,
      callId: `call-uvexec004-${randomUUID()}`,
      voiceIntentId,
    });
    await expect(
      repository.withTransaction((client) =>
        repository.insertVoiceOrder(client, collidingOrder),
      ),
    ).rejects.toBeInstanceOf(OwnedOrderDuplicateVoiceLinkError);

    // The rejected insert must not have landed a second row.
    const collidingRow = await readOrderRow(database, collidingOrderId);
    expect(collidingRow).toBeNull();
  });

  it("updateOrderWithCas rejects a stale snapshot after another commit has already advanced the version", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec004-${randomUUID()}`);
    const order = buildOrderFixture({ orderId });
    await repository.withTransaction((client) =>
      repository.insertVoiceOrder(client, order),
    );

    // Instance A: reads version 1 under `FOR UPDATE`, computes the next
    // state purely, and commits via CAS.
    const instanceASnapshot = await repository.withTransaction((client) =>
      repository.findOrderForUpdate(client, orderId),
    );
    expect(instanceASnapshot?.aggregateVersion).toBe(1);

    const committedVersion = await repository.withTransaction(
      async (client) => {
        const current = await repository.findOrderForUpdate(client, orderId);
        return repository.updateOrderWithCas(
          client,
          { ...current!.order, status: "driver_accepted" },
          current!.aggregateVersion,
        );
      },
    );
    expect(committedVersion).toBe(2);

    // Instance B raced on the same original snapshot (version 1, read
    // before instance A committed) and now tries to commit its own
    // (different) next state against that stale version. SD §7.5: two
    // instances writing the same stale snapshot must have one of them
    // rejected -- not last-write-wins.
    await expect(
      repository.withTransaction((client) =>
        repository.updateOrderWithCas(
          client,
          { ...instanceASnapshot!.order, status: "cancelled" },
          instanceASnapshot!.aggregateVersion,
        ),
      ),
    ).rejects.toBeInstanceOf(OwnedOrderVersionConflictError);

    // The durable row must still reflect instance A's commit, not instance
    // B's rejected write and not a mix of both.
    const row = await readOrderRow(database, orderId);
    expect(row?.aggregate_version).toBe(2);
    expect((row?.record as { status?: string })?.status).toBe(
      "driver_accepted",
    );
  });

  it("rolls back a failed transaction without leaving any partial write on the row", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec004-${randomUUID()}`);
    const order = buildOrderFixture({ orderId });
    await repository.withTransaction((client) =>
      repository.insertVoiceOrder(client, order),
    );

    await expect(
      repository.withTransaction(async (client) => {
        const current = await repository.findOrderForUpdate(client, orderId);
        await repository.updateOrderWithCas(
          client,
          { ...current!.order, status: "cancelled" },
          current!.aggregateVersion,
        );
        // Simulate a failure discovered after the CAS write executed but
        // before the caller decides to commit (e.g. a rejected precondition
        // found while preparing dependent rows in the same transaction).
        throw new Error("simulated failure after the CAS write executed");
      }),
    ).rejects.toThrow("simulated failure after the CAS write executed");

    const row = await readOrderRow(database, orderId);
    expect(row?.aggregate_version).toBe(1);
    expect((row?.record as { status?: string })?.status).toBe(
      "ready_for_dispatch",
    );
  });

  it("fails fast on lock_timeout instead of hanging when a second transaction is blocked on the same row", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const repository = new OwnedMobilityRepository(database);

    const orderId = trackOrder(`order-uvexec004-${randomUUID()}`);
    const order = buildOrderFixture({ orderId });
    await repository.withTransaction((client) =>
      repository.insertVoiceOrder(client, order),
    );

    let releaseHolder: () => void = () => {};
    const holderCanRelease = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let signalLockAcquired: () => void = () => {};
    const lockAcquired = new Promise<void>((resolve) => {
      signalLockAcquired = resolve;
    });

    const holderTransaction = repository.withTransaction(async (client) => {
      await repository.findOrderForUpdate(client, orderId);
      signalLockAcquired();
      // Hold the row lock well past the 3s `lock_timeout` set in
      // `withTransaction` (SD §7.1: "DB transaction 設 lock／statement deadline").
      await holderCanRelease;
      return "holder-done";
    });

    // Deterministically wait for the holder to actually have the row
    // locked before contending for it -- otherwise which of the two
    // concurrent `withTransaction` calls wins the lock first is a race,
    // and this test would be flaky about which side observes the timeout.
    await lockAcquired;

    const blockedResult = await repository
      .withTransaction((client) =>
        repository.findOrderForUpdate(client, orderId),
      )
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    releaseHolder();
    await holderTransaction;

    expect(blockedResult.ok).toBe(false);
    if (!blockedResult.ok) {
      // Postgres error code 55P03 = lock_not_available, raised when
      // `lock_timeout` expires waiting for a lock.
      expect((blockedResult.error as { code?: string }).code).toBe("55P03");
    }
  }, 15_000);
});
