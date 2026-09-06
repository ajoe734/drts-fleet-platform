import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseService } from "../../apps/api/src/common/db";
import { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";

// UV-EXEC-002: migrations for the voice-booking runtime schema
// (infra/migrations/V0086, V0087, V0088). This suite assumes migrations have
// already been applied to DATABASE_URL (operations/database/db-apply.sh),
// exactly like the other `*-db-*.integration.test.ts` suites in this repo --
// it is not itself a migration runner.
//
// Per SD §7.5, the tables under test are the ones the application actually
// writes at runtime (`ops.phase1_owned_orders`, `crm.phase1_call_sessions`,
// the new `voice.*` schema, `ops.dispatch_resource_reservations`), not the
// mostly-empty canonical `ops.orders` / `crm.call_sessions`.

const DATABASE_URL = process.env.DATABASE_URL;

type Fixture = {
  callId: string;
  orderId: string;
  scopeId: string;
  lineBindingId: string;
  routeProfileId: string;
  voiceSessionId: string;
  intentId: string;
};

async function seedSessionChain(
  database: DatabaseService,
  overrides: Partial<{ callId: string; orderId: string }> = {},
): Promise<Fixture> {
  const callId = overrides.callId ?? `call-uvexec002-${randomUUID()}`;
  const orderId = overrides.orderId ?? `order-uvexec002-${randomUUID()}`;
  const scopeId = randomUUID();
  const lineBindingId = randomUUID();
  const routeProfileId = randomUUID();
  const voiceSessionId = randomUUID();
  const intentId = randomUUID();
  const providerAccountId = `acct-${randomUUID()}`;
  const providerCallId = `pcall-${randomUUID()}`;
  // voice.resource_scope's uniqueness is keyed on (brand_id, operating_unit_id)
  // while active (SD §9.1 scope isolation), so each fixture needs its own
  // brand, not a fixed literal -- otherwise a prior run's evidence-pinned
  // scope row (append-only session_event/recording_checkpoint rows keep
  // their ancestor session/scope/line_binding un-deletable by design) would
  // collide with this run's.
  const brandId = `brand-uvexec002-${randomUUID()}`;

  await database.query(
    `INSERT INTO crm.phase1_call_sessions (call_id, status, started_at, updated_at, record)
     VALUES ($1, 'active', now(), now(), $2::jsonb)`,
    [callId, JSON.stringify({ callId, status: "active" })],
  );

  await database.query(
    `INSERT INTO ops.phase1_owned_orders (
       order_id, order_no, status, order_source, service_bucket,
       dispatch_semantics, created_at, updated_at, record
     ) VALUES ($1, $2, 'ready_for_dispatch', 'voice_agent', 'owned', 'immediate', now(), now(), $3::jsonb)`,
    [
      orderId,
      `ON-${orderId}`,
      JSON.stringify({
        orderId,
        status: "ready_for_dispatch",
        callId,
        voiceIntentId: intentId,
        bookingActor: {
          type: "voice_agent",
          voiceSessionId,
          principalId: "svc-uvexec002",
        },
      }),
    ],
  );

  await database.query(
    `INSERT INTO voice.resource_scope (scope_id, brand_id, granted_by) VALUES ($1, $2, 'admin-uvexec002')`,
    [scopeId, brandId],
  );
  await database.query(
    `INSERT INTO voice.line_binding (line_binding_id, provider_account_id, dnis, brand_id, operating_profile_id)
     VALUES ($1, $2, '0800-uvexec002', $3, 'profile-uvexec002')`,
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
    `INSERT INTO voice.intent (intent_id, voice_session_id, action, status)
     VALUES ($1, $2, 'create_owned_order', 'committed')`,
    [intentId, voiceSessionId],
  );
  await database.query(
    `UPDATE crm.phase1_call_sessions
     SET record = record || $2::jsonb
     WHERE call_id = $1`,
    [
      callId,
      JSON.stringify({
        linkedOrderId: orderId,
        voiceSessionId,
        sourceChannel: "voice_agent",
      }),
    ],
  );

  return {
    callId,
    orderId,
    scopeId,
    lineBindingId,
    routeProfileId,
    voiceSessionId,
    intentId,
  };
}

/**
 * Best-effort delete: some fixture rows are pinned forever by append-only
 * evidence (voice.session_event, voice.recording_checkpoint -- SD §9.1 core
 * evidence is never deleted by any repository code, by design). Swallow only
 * the foreign-key violation that pinning produces; anything else is a real
 * bug and must still fail the test.
 */
async function tryDelete(
  database: DatabaseService,
  sql: string,
  values: unknown[],
) {
  try {
    await database.query(sql, values);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/violates foreign key constraint/.test(message)) {
      throw error;
    }
  }
}

async function purgeFixture(database: DatabaseService, fixture: Fixture) {
  // Always deletable: nothing append-only references these directly.
  await database.query(
    `DELETE FROM voice.command_receipt WHERE intent_id = $1`,
    [fixture.intentId],
  );
  await database.query(`DELETE FROM voice.intent WHERE voice_session_id = $1`, [
    fixture.voiceSessionId,
  ]);
  await database.query(
    `DELETE FROM ops.dispatch_resource_reservations WHERE order_id = $1`,
    [fixture.orderId],
  );
  // ops.phase1_owned_orders.call_id and crm.phase1_call_sessions.linked_order_id
  // reference each other from opposite sides (SD §7.5), so the cycle must be
  // broken by clearing the generated-column source fields before either row
  // (or voice.session, which call_sessions.voice_session_id also points at)
  // can be deleted.
  await database.query(
    `UPDATE crm.phase1_call_sessions
     SET record = (record - 'linkedOrderId') - 'voiceSessionId'
     WHERE call_id = $1`,
    [fixture.callId],
  );

  // Best-effort from here down: if this fixture recorded session_event or
  // recording_checkpoint evidence, voice.session (and transitively
  // resource_scope/line_binding) cannot be deleted -- intentionally, since
  // that evidence must survive independent of session lifecycle.
  await tryDelete(
    database,
    `DELETE FROM voice.session WHERE voice_session_id = $1`,
    [fixture.voiceSessionId],
  );
  // voice.route_profile is append-only by design (immutable published
  // versions, SD §9.1); the fixture's one-off profile row is intentionally
  // never deleted.
  await tryDelete(
    database,
    `DELETE FROM voice.line_binding WHERE line_binding_id = $1`,
    [fixture.lineBindingId],
  );
  await tryDelete(
    database,
    `DELETE FROM voice.resource_scope WHERE scope_id = $1`,
    [fixture.scopeId],
  );
  await database.query(
    `DELETE FROM ops.phase1_owned_orders WHERE order_id = $1`,
    [fixture.orderId],
  );
  // Also best-effort: voice.recording_checkpoint (append-only evidence) and
  // an un-deletable voice.session both FK straight to call_id.
  await tryDelete(
    database,
    `DELETE FROM crm.phase1_call_sessions WHERE call_id = $1`,
    [fixture.callId],
  );
}

describe("UV-EXEC-002 voice-booking runtime schema", () => {
  const databases: DatabaseService[] = [];
  const fixtures: Fixture[] = [];

  afterEach(async () => {
    if (DATABASE_URL) {
      const cleanupDatabase = new DatabaseService();
      try {
        for (const fixture of fixtures.splice(0)) {
          await purgeFixture(cleanupDatabase, fixture);
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

  it("upgrades an isolated Postgres instance from the pre-existing schema and exposes every new voice table", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);

    const tables = await database.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'voice' ORDER BY table_name`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "call_admission",
      "call_leg",
      "callback_attempt",
      "callback_task",
      "command_receipt",
      "confirmation",
      "draft_revision",
      "handoff",
      "intent",
      "line_binding",
      "passenger_proof",
      "rate_card",
      "recording_checkpoint",
      "resource_scope",
      "route_profile",
      "session",
      "session_event",
      "turn",
      "usage_record",
      "work_item",
    ]);

    const reservations = await database.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'ops' AND table_name = 'dispatch_resource_reservations'`,
    );
    expect(reservations.rows).toHaveLength(1);

    // SD §7.5: the identity linkage columns land on the tables the
    // application actually writes, generated straight from the JSON record
    // so they can never drift from it.
    const generatedColumns = await database.query<{
      column_name: string;
      is_generated: string;
    }>(
      `SELECT column_name, is_generated
       FROM information_schema.columns
       WHERE table_schema = 'ops' AND table_name = 'phase1_owned_orders'
         AND column_name IN ('call_id', 'voice_intent_id', 'booking_actor_type')`,
    );
    expect(generatedColumns.rows).toHaveLength(3);
    for (const row of generatedColumns.rows) {
      expect(row.is_generated).toBe("ALWAYS");
    }
  });

  it("enforces one order per call and a unique voice_intent_id on the real runtime table (SD §7.2/§7.5)", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const fixture = await seedSessionChain(database);
    fixtures.push(fixture);

    await expect(
      database.query(
        `INSERT INTO ops.phase1_owned_orders (
           order_id, order_no, status, order_source, service_bucket,
           dispatch_semantics, created_at, updated_at, record
         ) VALUES ($1, $2, 'ready_for_dispatch', 'voice_agent', 'owned', 'immediate', now(), now(), $3::jsonb)`,
        [
          `order-dup-${randomUUID()}`,
          `ON-DUP-${randomUUID()}`,
          JSON.stringify({ callId: fixture.callId }),
        ],
      ),
    ).rejects.toThrow(/uq_phase1_owned_orders_call_id/);

    await expect(
      database.query(
        `INSERT INTO ops.phase1_owned_orders (
           order_id, order_no, status, order_source, service_bucket,
           dispatch_semantics, created_at, updated_at, record
         ) VALUES ($1, $2, 'ready_for_dispatch', 'voice_agent', 'owned', 'immediate', now(), now(), $3::jsonb)`,
        [
          `order-dup2-${randomUUID()}`,
          `ON-DUP2-${randomUUID()}`,
          JSON.stringify({ voiceIntentId: fixture.intentId }),
        ],
      ),
    ).rejects.toThrow(/uq_phase1_owned_orders_voice_intent/);
  });

  it("keeps the call-session side of the link unique too (crm.phase1_call_sessions.linked_order_id)", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const fixture = await seedSessionChain(database);
    fixtures.push(fixture);

    const otherCallId = `call-uvexec002-other-${randomUUID()}`;
    await database.query(
      `INSERT INTO crm.phase1_call_sessions (call_id, status, started_at, updated_at, record)
       VALUES ($1, 'active', now(), now(), $2::jsonb)`,
      [otherCallId, JSON.stringify({ callId: otherCallId })],
    );

    await expect(
      database.query(
        `UPDATE crm.phase1_call_sessions SET record = record || $2::jsonb WHERE call_id = $1`,
        [otherCallId, JSON.stringify({ linkedOrderId: fixture.orderId })],
      ),
    ).rejects.toThrow(/uq_phase1_call_sessions_linked_order/);

    await database.query(
      `DELETE FROM crm.phase1_call_sessions WHERE call_id = $1`,
      [otherCallId],
    );
  });

  it("reconciles a durable command receipt by action key after a lost response (SD §7.2)", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const fixture = await seedSessionChain(database);
    fixtures.push(fixture);

    const repository = new VoiceBookingRepository(database);
    const payloadHash = "hash-abc";

    await database.query(
      `INSERT INTO voice.command_receipt (intent_id, brand_id, call_id, action, payload_hash, status, order_id)
       VALUES ($1, 'brand-uvexec002', $2, 'create_owned_order', $3, 'succeeded', $4)`,
      [fixture.intentId, fixture.callId, payloadHash, fixture.orderId],
    );

    const byActionKey = await repository.findReceiptByActionKey(
      "brand-uvexec002",
      fixture.callId,
      fixture.intentId,
      "create_owned_order",
    );
    expect(byActionKey).not.toBeNull();
    expect(byActionKey?.status).toBe("succeeded");
    expect(byActionKey?.orderId).toBe(fixture.orderId);
    expect(byActionKey?.payloadHash).toBe(payloadHash);

    const bySession = await repository.findSessionByCallId(fixture.callId);
    expect(bySession?.voiceSessionId).toBe(fixture.voiceSessionId);

    const intent = await repository.findActiveCreateIntent(
      fixture.voiceSessionId,
    );
    expect(intent?.intentId).toBe(fixture.intentId);
  });

  it("rejects same action-key resubmission with a conflicting payload hash (SD §7.2 unique action key)", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const fixture = await seedSessionChain(database);
    fixtures.push(fixture);

    await database.query(
      `INSERT INTO voice.command_receipt (intent_id, brand_id, call_id, action, payload_hash, status)
       VALUES ($1, 'brand-uvexec002', $2, 'create_owned_order', 'hash-1', 'pending')`,
      [fixture.intentId, fixture.callId],
    );

    await expect(
      database.query(
        `INSERT INTO voice.command_receipt (intent_id, brand_id, call_id, action, payload_hash, status)
         VALUES ($1, 'brand-uvexec002', $2, 'create_owned_order', 'hash-2', 'pending')`,
        [fixture.intentId, fixture.callId],
      ),
    ).rejects.toThrow(/uq_voice_command_receipt_action_key/);
  });

  it("enforces voice.session_event as append-only evidence", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const fixture = await seedSessionChain(database);
    fixtures.push(fixture);

    await database.query(
      `INSERT INTO voice.session_event (voice_session_id, source, occurred_at, sequence, event_type)
       VALUES ($1, 'provider', now(), 1, 'media_start')`,
      [fixture.voiceSessionId],
    );

    await expect(
      database.query(
        `UPDATE voice.session_event SET event_type = 'tampered' WHERE voice_session_id = $1 AND sequence = 1`,
        [fixture.voiceSessionId],
      ),
    ).rejects.toThrow(/append-only/);

    const repository = new VoiceBookingRepository(database);
    const events = await repository.listSessionEvents(fixture.voiceSessionId);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("media_start");
  });

  it("enforces single active occupancy per driver/vehicle across every dispatch writer (SD §7.6)", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const fixture = await seedSessionChain(database);
    fixtures.push(fixture);

    const driverId = `drv-uvexec002-${randomUUID()}`;
    await database.query(
      `INSERT INTO ops.dispatch_resource_reservations (resource_type, resource_id, order_id, reservation_group_id, status)
       VALUES ('driver', $1, $2, gen_random_uuid(), 'held')`,
      [driverId, fixture.orderId],
    );

    await expect(
      database.query(
        `INSERT INTO ops.dispatch_resource_reservations (resource_type, resource_id, order_id, reservation_group_id, status)
         VALUES ('driver', $1, $2, gen_random_uuid(), 'held')`,
        [driverId, fixture.orderId],
      ),
    ).rejects.toThrow(/uq_dispatch_resource_reservations_active/);

    const repository = new VoiceBookingRepository(database);
    const active = await repository.findActiveReservationForResource(
      "driver",
      driverId,
    );
    expect(active?.status).toBe("held");
    expect(active?.orderId).toBe(fixture.orderId);
  });

  it("keeps a pending receipt and its recording-checkpoint evidence readable after an unrelated rollback (no destructive down migration)", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const database = new DatabaseService();
    databases.push(database);
    const fixture = await seedSessionChain(database);
    fixtures.push(fixture);

    // Durably commit a pending receipt and a recording checkpoint --
    // evidence that must survive regardless of what happens next.
    await database.query(
      `INSERT INTO voice.command_receipt (intent_id, brand_id, call_id, action, payload_hash, status)
       VALUES ($1, 'brand-uvexec002', $2, 'create_owned_order', 'hash-pending', 'pending')`,
      [fixture.intentId, fixture.callId],
    );
    await database.query(
      `INSERT INTO voice.recording_checkpoint (call_id, manifest_version, manifest, manifest_hash, coverage, policy_version)
       VALUES ($1, 1, '{}'::jsonb, 'manifest-hash-1', '{}'::jsonb, 'policy-v1')`,
      [fixture.callId],
    );

    // Simulate a later, unrelated transaction (a different action on the
    // same intent, e.g. a cancel attempt) that rolls back -- it must not
    // take the already-committed evidence with it.
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO voice.command_receipt (intent_id, brand_id, call_id, action, payload_hash, status)
         VALUES ($1, 'brand-uvexec002', $2, 'cancel_booking', 'hash-unrelated', 'pending')`,
        [fixture.intentId, fixture.callId],
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const repository = new VoiceBookingRepository(database);
    const receipt = await repository.findReceiptByActionKey(
      "brand-uvexec002",
      fixture.callId,
      fixture.intentId,
      "create_owned_order",
    );
    expect(receipt?.status).toBe("pending");
    expect(receipt?.payloadHash).toBe("hash-pending");

    // The rolled-back, unrelated receipt attempt must not exist at all.
    const rolledBack = await repository.findReceiptByActionKey(
      "brand-uvexec002",
      fixture.callId,
      fixture.intentId,
      "cancel_booking",
    );
    expect(rolledBack).toBeNull();

    const checkpoint = await repository.findLatestRecordingCheckpointForCall(
      fixture.callId,
    );
    expect(checkpoint?.manifestHash).toBe("manifest-hash-1");
  });
});
