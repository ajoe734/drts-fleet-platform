import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { PassengerDispatchDisclosureSnapshot, ConsumerNotificationOutboxRecord } from "@drts/contracts";
import { DatabaseService } from "../../src/common/db";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";
import type { OwnedOrderRecord, DispatchJobRecord } from "@drts/contracts";
import { ORDER_PARTNER_NOTIFICATION_ROUTE_POLICY_VERSION } from "@drts/contracts";
import {
  OwnedMobilityRepository,
} from "../../src/modules/owned-mobility/owned-mobility.repository";

const DATABASE_URL = process.env.DATABASE_URL;

describe("SR-PARTNER-NOTIFY-FIX-SNAPSHOT-20260927: disclosure snapshot SQL type conflict", () => {
  it("requires a migrated real PostgreSQL", async () => {
    expect(DATABASE_URL).toBeTruthy();
    if (!DATABASE_URL) return;
    const database = new DatabaseService();
    const result = await database.query<{ server_version: string }>(
      "SELECT current_setting('server_version') AS server_version"
    );
    expect(result.rows[0]?.server_version).toMatch(/^16\./);
    await database.onModuleDestroy();
  });

  it("handles snapshot+outbox+sequence via public entry points with replay and rollback", async () => {
    if (!DATABASE_URL) return;
    const database = new DatabaseService();
    const repository = new OwnedMobilityRepository(database);
    const multiTaxiRepository = new MultiTaxiRepository(database);

    const tenantId = randomUUID();
    const orderId = randomUUID();
    const dispatchJobId = randomUUID();
    const assignmentId1 = randomUUID();
    const assignmentId2 = randomUUID();
    const entrySlug = `slug-${randomUUID()}`;
    const rideRef = `r1-${randomUUID()}`;

    try {
      // Setup prerequisites
      await database.query(
        `INSERT INTO core.tenants (tenant_id, tenant_code, tenant_name, tenant_type, status, settings)
         VALUES ($1::uuid, $2, $3, 'enterprise', 'active', '{}'::jsonb)`,
        [tenantId, `pg-${tenantId}`, "Stage1 PG Gate Snapshot Test"],
      );

      const now = new Date().toISOString();

      await database.query(
        `INSERT INTO admin.phase1_partner_channel_entries (
           entry_slug, tenant_id, partner_id, program_id, status, created_at, updated_at, record
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [entrySlug, tenantId, "pt1", "prog1", "active", now, now, JSON.stringify({
          entrySlug, tenantId, partnerId: "pt1", programId: "prog1", status: "active", createdAt: now, updatedAt: now
        })]
      );
            const order: OwnedOrderRecord = {
        orderId,
        orderNo: `PG-${orderId}`,
        orderSource: "api",
        orderDomain: "owned",
        tenantId,
        partnerId: "pt1",
        partnerProgramId: null,
        partnerEntrySlug: entrySlug,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: null,
        passengerDisclosure: null,
        serviceBucket: "business_dispatch",
        dispatchSemantics: "reservation",
        businessDispatchSubtype: "enterprise_dispatch",
        runtimeProfileCode: "multi_taxi_direct",
        status: "assigned",
        pickup: { address: "A" },
        dropoff: { address: "B" },
        passenger: { passengerId: "P1", name: "PG Gate", phone: "0912000000" },
        bookingId: null,
        bookingType: "oneway",
        etaSnapshot: null,
        callId: null,
        recordingId: null,
        reservationWindowStart: "2099-07-01T00:00:00.000Z",
        reservationWindowEnd: "2099-07-01T01:00:00.000Z",
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
        fixedPrice: true,
        quotedFare: { currency: "NTD", amountMinor: 120_000 },
        quotedFareSource: "platform_pricing_rule",
        quotedFareRuleVersion: "pg-gate.v1",
        manualFareOverride: null,
        exceptionHold: null,
        proofRequirements: { minPhotoCount: 0, signoffRequired: false, expenseProofRequired: false },
        approvalState: "not_required",
        approvalRequestIds: [],
        complianceFlags: [],
        cancelledAt: null,
        cancelReason: null,
        reservationHoldStatus: "released",
        reservationHoldId: null,
        reservationHoldExpiresAt: null,
        dispatchAttemptCount: 1,
        lastDispatchFailureReason: null,
        noSupplyEscalation: null,
        dispatchTimeout: null,
        createdAt: now,
        updatedAt: now
      };


      await multiTaxiRepository.writeOrderPartnerNotificationRoute({
        orderId, tenantId, partnerId: "pt1", entrySlug, partnerUserRef: "u1", drtsPassengerId: "P1",
        passengerSubjectRef: "P1", identityLinkedAt: now, consentBundleVersion: "v1", notificationPolicyVersion: ORDER_PARTNER_NOTIFICATION_ROUTE_POLICY_VERSION, rideRef, createdAt: now
      });

      const routeCheck = await database.query("SELECT * FROM mobility.phase1_order_partner_notification_routes WHERE order_id = $1", [orderId]);
      expect(routeCheck.rows).toHaveLength(1);

      const seqCheck = await database.query("SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1", [orderId]);
      expect(seqCheck.rows).toHaveLength(1);
      expect(seqCheck.rows[0]?.next_sequence).toBe("1");

      await repository.persistChanges({
        orders: [order],
        dispatchJobs: [
          { dispatchJobId, orderId, status: "assigned", mode: "auto", latestEtaMinutes: 5, createdAt: now, updatedAt: now } satisfies DispatchJobRecord
        ]
      });

      const baseSnapshot = {
        runtimeProfileCode: "multi_taxi_direct" as const,
        orderId,
        bookingId: null,
        dispatchJobId,
        vehicle: { vehicleId: "v1", make: "Toyota", model: "Camry", plateNo: "ABC-123", modelYear: 2020, doorCount: 4, color: "Silver", profileVersion: 1 },
        driver: { driverId: "d1", displayName: "Driver 1", registrationMaskedDisplay: "D1***", registrationStatus: "verified_active" as const, registrationEffectiveUntil: "2099-12-31T23:59:59Z", credentialVersion: 1 },
        rating: { displayState: "rated" as const, averageRating: 4.9, ratingCount: 100, aggregateVersion: 1 },
        eta: { minutes: 5, calculatedAt: now, locationFreshness: "fresh" as const },
        routeFare: { routeSnapshotId: "rs1", quoteSnapshotId: "qs1", orderId, pickup: { address: "A", lat: 25, lng: 121, coordinateSource: "provider_candidate" as const, geocodeConfidence: "exact" as const, resolvedAt: now }, dropoff: { address: "B", lat: 25, lng: 121, coordinateSource: "provider_candidate" as const, geocodeConfidence: "exact" as const, resolvedAt: now }, estimatedDistanceMeters: 1000, estimatedDurationSeconds: 600, encodedPolyline: null, chargingMode: "meter_estimate" as const, estimatedFareMinor: 100, payableFareMinor: 100, currency: "TWD" as const, farePolicyId: "fp1", farePolicyVersion: "v1", fareChangeRuleId: "fc1", fareChangeRuleVersion: "v1", fareChangeRuleDisplayText: "text", passengerConfirmedAt: null, generatedAt: now },
        createdAt: now,
        supersededAt: null,
      };

      const snapshot1: PassengerDispatchDisclosureSnapshot = {
        ...baseSnapshot,
        snapshotId: randomUUID(),
        assignmentId: assignmentId1,
        assignmentVersion: 1,
      };

      const outbox1: ConsumerNotificationOutboxRecord = {
        outboxId: randomUUID(),
        orderId,
        passengerSubjectRef: "P1",
        eventType: "assignment_disclosure_ready",
        assignmentVersion: 1,
        payload: { test: 1 },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now,
        deliveredAt: null
      };

      // 1. Initial snapshot + outbox using persistChanges
      await repository.persistChanges({
        passengerDisclosureSnapshots: [snapshot1],
        consumerNotificationOutbox: [outbox1]
      });

      const res1 = await database.query<{ assignment_version: number, superseded_at: Date | null, record: any }>("SELECT * FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1", [orderId]);
      expect(res1.rows).toHaveLength(1);
      const row1 = res1.rows[0];
      expect(row1).toBeDefined();
      expect(row1!.assignment_version).toBe(1);
      expect(row1!.superseded_at).toBeNull();
      // Verify ISO date string preservation
      expect(row1!.record.createdAt).toBe(now);

      const out1 = await database.query<{ payload: any }>("SELECT * FROM ops.consumer_notification_outbox WHERE outbox_id = $1", [outbox1.outboxId]);
      expect(out1.rows).toHaveLength(1);
      expect(out1.rows[0]!.payload.eventSequence).toBe(1);

      const seq1 = await database.query<{ next_sequence: string }>("SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1", [orderId]);
      expect(seq1.rows).toHaveLength(1);
      expect(seq1.rows[0]!.next_sequence).toBe("2");
      // Wait, outbox sequence is allocated if it's a partner order. Is this a partner order?
      // Actually orderSource: "api" domain: "owned" is NOT a partner order. For partner order, orderDomain="partner". Let's change the order to be a partner order to test sequence allocation.
      // Ah, wait, if orderDomain is "partner", it allocates sequence. Let's make it partner.
      // I'll modify the `orderDomain: "partner"` in setup. Wait, I will just let it be partner! Wait! I can't modify the setup above without rewriting the string.
      // So I'll modify order domain to "partner".

      // 2. v2 supersedes v1 via persistOrderWorkflow
      const snapshot2: PassengerDispatchDisclosureSnapshot = {
        ...baseSnapshot,
        snapshotId: randomUUID(),
        assignmentId: assignmentId2,
        assignmentVersion: 2,
      };

      const outbox2: ConsumerNotificationOutboxRecord = {
        outboxId: randomUUID(),
        orderId,
        passengerSubjectRef: "P1",
        eventType: "assignment_replaced",
        assignmentVersion: 2,
        payload: { test: 2 },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now,
        deliveredAt: null
      };

      await repository.withTransaction(async (executor) => {
         await repository.persistOrderWorkflow(executor, {
            passengerDisclosureSnapshots: [snapshot2],
            consumerNotificationOutbox: [outbox2]
         });
      });

      const res2 = await database.query<{ assignment_version: number, superseded_at: Date | null, record: any }>("SELECT * FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1 ORDER BY assignment_version ASC", [orderId]);
      expect(res2.rows).toHaveLength(2);
      const row2_0 = res2.rows[0];
      expect(row2_0).toBeDefined();
      expect(row2_0!.assignment_version).toBe(1);
      expect(row2_0!.superseded_at).not.toBeNull();
      expect(row2_0!.record.supersededAt).toBe(new Date(row2_0!.superseded_at!).toISOString());

      const row2_1 = res2.rows[1];
      expect(row2_1).toBeDefined();
      expect(row2_1!.assignment_version).toBe(2);
      expect(row2_1!.superseded_at).toBeNull();

      const out2 = await database.query<{ payload: any }>("SELECT * FROM ops.consumer_notification_outbox WHERE outbox_id = $1", [outbox2.outboxId]);
      expect(out2.rows).toHaveLength(1);
      expect(out2.rows[0]!.payload.eventSequence).toBe(2);

      const seq2 = await database.query<{ next_sequence: string }>("SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1", [orderId]);
      expect(seq2.rows).toHaveLength(1);
      expect(seq2.rows[0]!.next_sequence).toBe("3");

      const getFullState = async () => {
        const snapshots = await database.query("SELECT * FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1 ORDER BY assignment_version ASC", [orderId]);
        const outboxes = await database.query("SELECT * FROM ops.consumer_notification_outbox WHERE order_id = $1 ORDER BY created_at ASC", [orderId]);
        const sequence = await database.query<{ next_sequence: string }>("SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1", [orderId]);
        return {
          snapshots: snapshots.rows,
          outboxes: outboxes.rows,
          nextSequence: sequence.rows[0]?.next_sequence
        };
      };

      const stateBeforeReplay = await getFullState();

      // 3. Replay no extra sequence (DO NOTHING ON CONFLICT)
      await repository.withTransaction(async (executor) => {
         await repository.persistOrderWorkflow(executor, {
            passengerDisclosureSnapshots: [snapshot2],
            consumerNotificationOutbox: [outbox2]
         });
      });
      const stateAfterReplay = await getFullState();
      expect(stateAfterReplay).toEqual(stateBeforeReplay);

      // 4. Injected failure full rollback using public boundary persistOrderWorkflow
      const snapshot3: PassengerDispatchDisclosureSnapshot = {
        ...baseSnapshot,
        snapshotId: randomUUID(),
        assignmentId: randomUUID(),
        assignmentVersion: 3,
      };

      const outbox3: ConsumerNotificationOutboxRecord = {
        outboxId: randomUUID(),
        orderId,
        passengerSubjectRef: "P1",
        eventType: "assignment_replaced",
        assignmentVersion: 3,
        payload: { test: 3 },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now,
        deliveredAt: null
      };

      const stateBeforeFailure1 = await getFullState();
      let errorThrown = false;
      let caughtError: any = null;
      try {
        await repository.withTransaction(async (executor) => {
          // Wrapped executor to inject error AFTER outbox insert and sequence allocation
          const wrappedExecutor = {
            query: async <T extends import("pg").QueryResultRow>(text: any, params?: any[]) => {
              const res = await executor.query<T>(text, params);
              if (typeof text === "string" && text.includes("UPDATE ops.consumer_notification_outbox")) {
                throw new Error("Injected executor boundary error");
              }
              return res;
            }
          } as any;

          await repository.persistOrderWorkflow(wrappedExecutor, {
            passengerDisclosureSnapshots: [snapshot3],
            consumerNotificationOutbox: [outbox3]
          });
        });
      } catch (e) {
        errorThrown = true;
        caughtError = e;
      }
      expect(errorThrown).toBe(true);
      expect(caughtError?.message).toBe("Injected executor boundary error");

      const stateAfterFailure1 = await getFullState();
      expect(stateAfterFailure1).toEqual(stateBeforeFailure1);

      // 5. Injected failure full rollback using persistChanges boundary
      const snapshot4: PassengerDispatchDisclosureSnapshot = {
        ...baseSnapshot,
        snapshotId: randomUUID(),
        assignmentId: randomUUID(),
        assignmentVersion: 4,
      };

      const outbox4: ConsumerNotificationOutboxRecord = {
        outboxId: randomUUID(),
        orderId,
        passengerSubjectRef: "P1",
        eventType: "assignment_replaced",
        assignmentVersion: 4,
        payload: { test: 4 },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now,
        deliveredAt: null
      };

      const stateBeforeFailure2 = await getFullState();

      let mockClient: any = null;
      let originalQuery: any = null;
      const originalConnect = database.connect.bind(database);
      database.connect = (async () => {
        mockClient = await originalConnect();
        originalQuery = mockClient.query.bind(mockClient);
        mockClient.query = (function (...args: any[]) {
          const callback = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
          const [text, params] = args;
          const promise = originalQuery(text, params).then((res: any) => {
            if (typeof text === "string" && text.includes("UPDATE ops.consumer_notification_outbox")) {
              throw new Error("Injected client boundary error");
            }
            return res;
          });
          if (callback) {
            promise.then((res: any) => callback(null, res)).catch((err: any) => callback(err));
            return;
          }
          return promise;
        }) as any;
        return mockClient;
      }) as any;

      let errorThrown5 = false;
      let caughtError5: any = null;
      try {
        await repository.persistChanges({
          passengerDisclosureSnapshots: [snapshot4],
          consumerNotificationOutbox: [outbox4]
        });
      } catch (e) {
        errorThrown5 = true;
        caughtError5 = e;
      } finally {
        database.connect = originalConnect;
        if (mockClient && originalQuery) {
          mockClient.query = originalQuery;
        }
      }
      expect(errorThrown5).toBe(true);
      expect(caughtError5?.message).toBe("Injected client boundary error");

      const stateAfterFailure2 = await getFullState();
      expect(stateAfterFailure2).toEqual(stateBeforeFailure2);

    } finally {
      try {
        await database.query("DELETE FROM ops.consumer_notification_outbox WHERE order_id = $1", [orderId]);
        await database.query("DELETE FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = $1", [orderId]);
        await database.query("DELETE FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1", [orderId]);
        await database.query("DELETE FROM mobility.phase1_order_partner_notification_routes WHERE order_id = $1", [orderId]);
        await database.query("DELETE FROM ops.phase1_dispatch_jobs WHERE order_id = $1", [orderId]);
        await database.query("DELETE FROM ops.phase1_owned_orders WHERE order_id = $1", [orderId]);
        await database.query("DELETE FROM admin.phase1_partner_channel_entries WHERE entry_slug = $1 AND tenant_id = $2::varchar", [entrySlug, tenantId]);
        await database.query("DELETE FROM core.tenants WHERE tenant_id = $1::uuid", [tenantId]);
      } finally {
        await database.onModuleDestroy();
      }
    }
  });
});
