import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import type { OwnedOrderRecord } from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { DatabaseService } from "../../apps/api/src/common/db";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { resolveVoiceOrderFence } from "../../apps/api/src/modules/voice-booking/voice-order-fence";

// UV-EXEC-005: SD §7.4/§7.5/§8.4 -- the legacy callcenter/multi-taxi entry
// points and the recording-state callback must be fenced against a voice
// session that already owns (or is still reconciling) an intent order for
// the same callId. Assumes migrations V0086-V0089 have already been applied
// to DATABASE_URL, exactly like the UV-EXEC-002/004 suites this one builds
// on -- it is not itself a migration runner.

const DATABASE_URL = process.env.DATABASE_URL;

type VoiceFixture = {
  callId: string;
  scopeId: string;
  lineBindingId: string;
  routeProfileId: string;
  voiceSessionId: string;
  intentId: string;
  brandId: string;
  boundOrderId: string | null;
};

/**
 * Seeds the minimal voice.* chain a `callId` needs to resolve through
 * `resolveVoiceOrderFence` (SD §7.4): call session -> line binding ->
 * resource scope -> route profile -> voice session -> create intent, with
 * an optional command receipt. Mirrors UV-EXEC-002's `seedSessionChain`
 * fixture shape.
 */
async function seedVoiceFixture(
  database: DatabaseService,
  options: {
    boundOrderId?: string | null;
    receiptStatus?: "pending" | "succeeded" | "rejected" | null;
  } = {},
): Promise<VoiceFixture> {
  const callId = `call-uvexec005-${randomUUID()}`;
  const scopeId = randomUUID();
  const lineBindingId = randomUUID();
  const routeProfileId = randomUUID();
  const voiceSessionId = randomUUID();
  const intentId = randomUUID();
  const providerAccountId = `acct-${randomUUID()}`;
  const providerCallId = `pcall-${randomUUID()}`;
  const brandId = `brand-uvexec005-${randomUUID()}`;
  const boundOrderId = options.boundOrderId ?? null;

  await database.query(
    `INSERT INTO crm.phase1_call_sessions (call_id, status, started_at, updated_at, record)
     VALUES ($1, 'active', now(), now(), $2::jsonb)`,
    [callId, JSON.stringify({ callId, status: "active" })],
  );

  if (boundOrderId) {
    await database.query(
      `INSERT INTO ops.phase1_owned_orders (
         order_id, order_no, status, order_source, service_bucket,
         dispatch_semantics, created_at, updated_at, record
       ) VALUES ($1, $2, 'ready_for_dispatch', 'voice_agent', 'owned', 'immediate', now(), now(), $3::jsonb)`,
      [
        boundOrderId,
        `ON-${boundOrderId}`,
        JSON.stringify({
          orderId: boundOrderId,
          status: "ready_for_dispatch",
          callId,
          voiceIntentId: intentId,
        }),
      ],
    );
  }

  await database.query(
    `INSERT INTO voice.resource_scope (scope_id, brand_id, granted_by) VALUES ($1, $2, 'admin-uvexec005')`,
    [scopeId, brandId],
  );
  await database.query(
    `INSERT INTO voice.line_binding (line_binding_id, provider_account_id, dnis, brand_id, operating_profile_id)
     VALUES ($1, $2, '0800-uvexec005', $3, 'profile-uvexec005')`,
    [lineBindingId, providerAccountId, brandId],
  );
  await database.query(
    `INSERT INTO voice.route_profile (profile_id, version, models, languages) VALUES ($1, 1, '{}'::jsonb, '["zh-TW"]'::jsonb)`,
    [routeProfileId],
  );
  await database.query(
    `INSERT INTO voice.session (
       voice_session_id, call_id, provider_account_id, provider_call_id,
       resource_scope_id, line_binding_id, route_profile_id, route_profile_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
    [
      voiceSessionId,
      callId,
      providerAccountId,
      providerCallId,
      scopeId,
      lineBindingId,
      routeProfileId,
    ],
  );
  await database.query(
    `INSERT INTO voice.intent (intent_id, voice_session_id, action, status, bound_order_id)
     VALUES ($1, $2, 'create_owned_order', 'committed', $3)`,
    [intentId, voiceSessionId, boundOrderId],
  );

  if (options.receiptStatus) {
    await database.query(
      `INSERT INTO voice.command_receipt (intent_id, brand_id, call_id, action, payload_hash, status, order_id)
       VALUES ($1, $2, $3, 'create_owned_order', 'hash-uvexec005', $4, $5)`,
      [
        intentId,
        brandId,
        callId,
        options.receiptStatus,
        options.receiptStatus === "succeeded" ? boundOrderId : null,
      ],
    );
  }

  return {
    callId,
    scopeId,
    lineBindingId,
    routeProfileId,
    voiceSessionId,
    intentId,
    brandId,
    boundOrderId,
  };
}

async function tryDelete(database: DatabaseService, sql: string, values: unknown[]) {
  try {
    await database.query(sql, values);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/violates foreign key constraint/.test(message)) {
      throw error;
    }
  }
}

async function purgeVoiceFixture(database: DatabaseService, fixture: VoiceFixture) {
  await database.query(`DELETE FROM voice.command_receipt WHERE intent_id = $1`, [
    fixture.intentId,
  ]);
  await database.query(`DELETE FROM voice.intent WHERE voice_session_id = $1`, [
    fixture.voiceSessionId,
  ]);
  await tryDelete(database, `DELETE FROM voice.session WHERE voice_session_id = $1`, [
    fixture.voiceSessionId,
  ]);
  await tryDelete(database, `DELETE FROM voice.line_binding WHERE line_binding_id = $1`, [
    fixture.lineBindingId,
  ]);
  await tryDelete(database, `DELETE FROM voice.resource_scope WHERE scope_id = $1`, [
    fixture.scopeId,
  ]);
  if (fixture.boundOrderId) {
    await database.query(`DELETE FROM ops.phase1_owned_orders WHERE order_id = $1`, [
      fixture.boundOrderId,
    ]);
  }
  await tryDelete(database, `DELETE FROM crm.phase1_call_sessions WHERE call_id = $1`, [
    fixture.callId,
  ]);
}

function buildOrderFixture(overrides: Partial<OwnedOrderRecord> & { orderId: string }): OwnedOrderRecord {
  const now = new Date().toISOString();
  return {
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
    passenger: { name: "UV-EXEC-005 Rider", phone: "0911000222" },
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

function createTestService(database: DatabaseService) {
  const auditNotificationService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditNotificationService);
  const taskEventsService = new OwnedMobilityTaskEventsService(new EventEmitter() as never);
  const regulatoryRegistryService = {
    getEligibleCandidates: () => [],
    getVehicleDispatchability: () => true,
    getDriverAvailability: () => true,
  };
  const ownedMobilityRepository = new OwnedMobilityRepository(database);
  const voiceBookingRepository = new VoiceBookingRepository(database);

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService,
    callcenterService,
    taskEventsService,
    undefined, // opsDispatchEventsService
    ownedMobilityRepository,
    undefined, // tenantPartnerService
    undefined, // vehicleEligibilityService
    undefined, // serviceProductService
    undefined, // eventEmitter
    undefined, // runtimeEligibilityEvaluator
    undefined, // sandboxFallbackCostPolicyResolver (falls back to its default)
    undefined, // sandboxDispatchGateService
    undefined, // serviceAreaService
    undefined, // fareAnomalyService
    undefined, // idempotencyService
    voiceBookingRepository,
  );

  return { service, ownedMobilityRepository, voiceBookingRepository, callcenterService };
}

async function readOrderRow(database: DatabaseService, orderId: string) {
  const result = await database.query<{
    status: string;
    record: { recordingId: string | null; complianceFlags: string[] };
  }>(
    `SELECT status, record FROM ops.phase1_owned_orders WHERE order_id = $1`,
    [orderId],
  );
  return result.rows[0] ?? null;
}

function getErrorCode(error: unknown): string | null {
  return error instanceof ApiRequestError ? error.code : null;
}

describe("UV-EXEC-005 legacy callcenter/multi-taxi/callback voice fence", () => {
  const databases: DatabaseService[] = [];
  const voiceFixtures: VoiceFixture[] = [];
  const extraOrderIds: string[] = [];

  afterEach(async () => {
    if (DATABASE_URL) {
      const cleanupDatabase = new DatabaseService();
      try {
        for (const fixture of voiceFixtures.splice(0)) {
          await purgeVoiceFixture(cleanupDatabase, fixture);
        }
        for (const orderId of extraOrderIds.splice(0)) {
          await cleanupDatabase.query(
            `DELETE FROM ops.phase1_owned_orders WHERE order_id = $1`,
            [orderId],
          );
        }
      } finally {
        await cleanupDatabase.onModuleDestroy();
      }
    }
    for (const database of databases.splice(0)) {
      await database.onModuleDestroy();
    }
  });

  it("requires DATABASE_URL", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  describe("resolveVoiceOrderFence (SD §7.4 shared fence)", () => {
    it("returns none when the call has no voice session at all", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);

      const outcome = await resolveVoiceOrderFence(
        new VoiceBookingRepository(database),
        `call-uvexec005-nonexistent-${randomUUID()}`,
      );
      expect(outcome).toEqual({ kind: "none" });
    });

    it("returns bound when the intent already has a succeeded receipt/order", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const boundOrderId = `order-uvexec005-${randomUUID()}`;
      const fixture = await seedVoiceFixture(database, {
        boundOrderId,
        receiptStatus: "succeeded",
      });
      voiceFixtures.push(fixture);

      const outcome = await resolveVoiceOrderFence(
        new VoiceBookingRepository(database),
        fixture.callId,
      );
      expect(outcome).toEqual({ kind: "bound", orderId: boundOrderId });
    });

    it("returns pending when the AI command receipt has not resolved yet", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const fixture = await seedVoiceFixture(database, { receiptStatus: "pending" });
      voiceFixtures.push(fixture);

      const outcome = await resolveVoiceOrderFence(
        new VoiceBookingRepository(database),
        fixture.callId,
      );
      expect(outcome).toEqual({ kind: "pending", intentId: fixture.intentId });
    });

    it("returns none when the AI command was rejected without ever producing an order (SD §7.4 bullet 3)", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const fixture = await seedVoiceFixture(database, { receiptStatus: "rejected" });
      voiceFixtures.push(fixture);

      const outcome = await resolveVoiceOrderFence(
        new VoiceBookingRepository(database),
        fixture.callId,
      );
      expect(outcome).toEqual({ kind: "none" });
    });
  });

  describe("POST /call-center/orders (createCallCenterOrder)", () => {
    it("rejects a second manual order for a call already bound to a succeeded voice order", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const { service } = createTestService(database);
      const boundOrderId = `order-uvexec005-${randomUUID()}`;
      const fixture = await seedVoiceFixture(database, {
        boundOrderId,
        receiptStatus: "succeeded",
      });
      voiceFixtures.push(fixture);

      let caught: unknown;
      try {
        await service.createCallCenterOrder(
          {
            callId: fixture.callId,
            agentId: "ops-agent-001",
            pickup: { address: "Taipei Main Station" },
            dropoff: { address: "Songshan Airport" },
            passenger: { name: "Rider", phone: "0912000000" },
          },
          "req-uvexec005-001",
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApiRequestError);
      expect(getErrorCode(caught)).toBe("VOICE_ORDER_ALREADY_LINKED");
    });

    it("rejects a manual order while the AI command for this call is still pending reconciliation", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const { service } = createTestService(database);
      const fixture = await seedVoiceFixture(database, { receiptStatus: "pending" });
      voiceFixtures.push(fixture);

      let caught: unknown;
      try {
        await service.createCallCenterOrder(
          {
            callId: fixture.callId,
            agentId: "ops-agent-001",
            pickup: { address: "Taipei Main Station" },
            dropoff: { address: "Songshan Airport" },
            passenger: { name: "Rider", phone: "0912000000" },
          },
          "req-uvexec005-002",
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApiRequestError);
      expect(getErrorCode(caught)).toBe("VOICE_ACTION_PENDING");
    });

    it("allows a manual fallback order once the AI command is rejected with no order (SD §7.4 bullet 3)", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const { service } = createTestService(database);
      const fixture = await seedVoiceFixture(database, { receiptStatus: "rejected" });
      voiceFixtures.push(fixture);

      const order = await service.createCallCenterOrder(
        {
          callId: fixture.callId,
          agentId: "ops-agent-001",
          pickup: { address: "Taipei Main Station" },
          dropoff: { address: "Songshan Airport" },
          passenger: { name: "Rider", phone: "0912000000" },
        },
        "req-uvexec005-003",
      );
      extraOrderIds.push(order.orderId);

      expect(order.callId).toBe(fixture.callId);
      expect(order.orderSource).toBe("phone");

      // `persistChanges` writes through fire-and-forget (`void repo
      // .persistChanges(...).catch(...)`, not awaited by the caller); give
      // it a beat to land before this test's afterEach tries to delete the
      // row, so cleanup does not race the write and leak the fixture.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  describe("callcenter/sessions/:callId/link-order (linkOrderToExistingSession)", () => {
    it("rejects rebinding a call already bound to a different AI-originated order", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const voiceBookingRepository = new VoiceBookingRepository(database);
      const auditNotificationService = new AuditNotificationService();
      const callcenterService = new CallcenterService(
        auditNotificationService,
        undefined,
        voiceBookingRepository,
      );
      const boundOrderId = `order-uvexec005-${randomUUID()}`;
      const fixture = await seedVoiceFixture(database, {
        boundOrderId,
        receiptStatus: "succeeded",
      });
      voiceFixtures.push(fixture);
      callcenterService.upsertExternalSession({ callId: fixture.callId });

      let caught: unknown;
      try {
        await callcenterService.linkOrderToExistingSession(fixture.callId, {
          orderId: `order-different-${randomUUID()}`,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApiRequestError);
      expect(getErrorCode(caught)).toBe("VOICE_ORDER_ALREADY_LINKED");
    });

    it("allows re-linking the same call to the order it is already bound to (idempotent replay)", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const voiceBookingRepository = new VoiceBookingRepository(database);
      const auditNotificationService = new AuditNotificationService();
      const callcenterService = new CallcenterService(
        auditNotificationService,
        undefined,
        voiceBookingRepository,
      );
      const boundOrderId = `order-uvexec005-${randomUUID()}`;
      const fixture = await seedVoiceFixture(database, {
        boundOrderId,
        receiptStatus: "succeeded",
      });
      voiceFixtures.push(fixture);
      callcenterService.upsertExternalSession({ callId: fixture.callId });

      const session = await callcenterService.linkOrderToExistingSession(
        fixture.callId,
        { orderId: boundOrderId },
      );

      expect(session.linkedOrderId).toBe(boundOrderId);
    });

    it("rejects linking any order while an AI command is still pending reconciliation", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const voiceBookingRepository = new VoiceBookingRepository(database);
      const auditNotificationService = new AuditNotificationService();
      const callcenterService = new CallcenterService(
        auditNotificationService,
        undefined,
        voiceBookingRepository,
      );
      const fixture = await seedVoiceFixture(database, { receiptStatus: "pending" });
      voiceFixtures.push(fixture);
      callcenterService.upsertExternalSession({ callId: fixture.callId });

      let caught: unknown;
      try {
        await callcenterService.linkOrderToExistingSession(fixture.callId, {
          orderId: `order-manual-${randomUUID()}`,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApiRequestError);
      expect(getErrorCode(caught)).toBe("VOICE_ACTION_PENDING");
    });
  });

  describe("handleCallRecordingStateChanged (SD §8.4 voice-aware recording callback)", () => {
    it("does not regress an on_trip voice order back to recording_pending on a stale/missing event", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const { service } = createTestService(database);

      const orderId = `order-uvexec005-${randomUUID()}`;
      extraOrderIds.push(orderId);
      const order = buildOrderFixture({
        orderId,
        callId: `call-uvexec005-legacy-${randomUUID()}`,
        voiceIntentId: randomUUID(),
        status: "on_trip",
        recordingId: "recording-already-bound-001",
        complianceFlags: ["recording_bound"],
      });
      await service.createVoiceOrder(order, "test_setup");

      await service.handleCallRecordingStateChanged({
        callId: order.callId!,
        linkedOrderId: orderId,
        recordingState: "missing",
        recordingId: null,
        providerRecordingRef: null,
        recordingUrl: null,
        startedAt: null,
        endedAt: null,
        agentId: null,
      });

      const row = await readOrderRow(database, orderId);
      expect(row?.status).toBe("on_trip");
      expect(row?.record.recordingId).toBe("recording-already-bound-001");
      expect(row?.record.complianceFlags).toContain("recording_bound");
    });

    it("does not clear a newer already-bound recording index on a late pre-dispatch missing event", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const { service } = createTestService(database);

      const orderId = `order-uvexec005-${randomUUID()}`;
      extraOrderIds.push(orderId);
      const order = buildOrderFixture({
        orderId,
        callId: `call-uvexec005-legacy-${randomUUID()}`,
        voiceIntentId: randomUUID(),
        status: "ready_for_dispatch",
        recordingId: "recording-newer-002",
        complianceFlags: ["recording_bound"],
      });
      await service.createVoiceOrder(order, "test_setup");

      await service.handleCallRecordingStateChanged({
        callId: order.callId!,
        linkedOrderId: orderId,
        recordingState: "missing",
        recordingId: null,
        providerRecordingRef: null,
        recordingUrl: null,
        startedAt: null,
        endedAt: null,
        agentId: null,
      });

      const row = await readOrderRow(database, orderId);
      expect(row?.status).toBe("ready_for_dispatch");
      expect(row?.record.recordingId).toBe("recording-newer-002");
      expect(row?.record.complianceFlags).toContain("recording_bound");
    });

    it("still demotes a genuinely pre-dispatch voice order with no bound recording (legitimate case preserved)", async () => {
      expect(DATABASE_URL).toBeTruthy();
      const database = new DatabaseService();
      databases.push(database);
      const { service } = createTestService(database);

      const orderId = `order-uvexec005-${randomUUID()}`;
      extraOrderIds.push(orderId);
      const order = buildOrderFixture({
        orderId,
        callId: `call-uvexec005-legacy-${randomUUID()}`,
        voiceIntentId: randomUUID(),
        status: "ready_for_dispatch",
        recordingId: null,
        complianceFlags: [],
      });
      await service.createVoiceOrder(order, "test_setup");

      await service.handleCallRecordingStateChanged({
        callId: order.callId!,
        linkedOrderId: orderId,
        recordingState: "missing",
        recordingId: null,
        providerRecordingRef: null,
        recordingUrl: null,
        startedAt: null,
        endedAt: null,
        agentId: null,
      });

      const row = await readOrderRow(database, orderId);
      expect(row?.status).toBe("recording_pending");
      expect(row?.record.recordingId).toBeNull();
      expect(row?.record.complianceFlags).toContain("recording_missing");
    });
  });
});
