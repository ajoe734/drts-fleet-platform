import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg");
import { randomUUID } from "node:crypto";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";

const testDbUrl =
  process.env.CONCURRENCY_TEST_DATABASE_URL ??
  process.env.UV_BOOKING_TEST_DATABASE_URL ??
  process.env.DATABASE_URL;

describe.skipIf(!testDbUrl)("OwnedMobilityRepository consumer notification outbox event sequence", () => {

  let pool: any;
  let multiTaxiRepository: MultiTaxiRepository;
  let ownedMobilityRepository: OwnedMobilityRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDbUrl });

    // Ensure schema and tables exist in the unit test db
    await pool.query(`CREATE SCHEMA IF NOT EXISTS mobility`);
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ops`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mobility.phase1_order_partner_notification_routes (
        order_id TEXT PRIMARY KEY,
        tenant_id TEXT,
        partner_id TEXT,
        entry_slug TEXT,
        partner_user_ref TEXT,
        drts_passenger_id TEXT,
        passenger_subject_ref TEXT,
        identity_linked_at TIMESTAMPTZ,
        consent_bundle_version TEXT,
        ride_ref TEXT,
        created_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mobility.phase1_partner_notification_sequences (
        order_id TEXT PRIMARY KEY,
        next_sequence INTEGER NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ops.consumer_notification_outbox (
        outbox_id TEXT PRIMARY KEY,
        order_id TEXT,
        passenger_subject_ref TEXT,
        event_type TEXT,
        assignment_version INTEGER,
        payload JSONB,
        status TEXT,
        attempt_count INTEGER,
        next_attempt_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ
      )
    `);

    const fakeDbService = {
      connect: async () => pool.connect(),
      query: (t: string, v: any[]) => pool.query(t, v),
      isEnabled: () => true,
    };
    multiTaxiRepository = new (MultiTaxiRepository as any)(fakeDbService);
    ownedMobilityRepository = new (OwnedMobilityRepository as any)(
      fakeDbService,
      multiTaxiRepository
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it("allocates the durable sequence in the same transaction and rolls back if outbox insertion fails", async () => {
    const orderId = `test-order-${randomUUID()}`;
    const outboxId = `outbox-seq-${randomUUID()}`;

    // Disable FK checks for seed data
    await pool.query(`SET session_replication_role = 'replica';`);
    await pool.query(
      `INSERT INTO mobility.phase1_order_partner_notification_routes (
        order_id, tenant_id, partner_id, entry_slug, partner_user_ref, drts_passenger_id, passenger_subject_ref, identity_linked_at, consent_bundle_version, ride_ref, created_at
      ) VALUES ($1, 'tenant', 'partner', 'entry', 'user', 'drts', 'subject', now(), 'v1', 'ride', now()) ON CONFLICT DO NOTHING`,
      [orderId]
    );

    // Seed sequence for this order
    await pool.query(
      `INSERT INTO mobility.phase1_partner_notification_sequences (order_id, next_sequence) VALUES ($1, 1)`,
      [orderId]
    );
    await pool.query(`SET session_replication_role = 'origin';`);

    const outbox: any = {
      outboxId,
      orderId,
      passengerSubjectRef: "test-subject",
      eventType: "assignment_disclosure_ready",
      assignmentVersion: 1,
      payload: { assignmentId: "test-assignment" },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };

    // Use a transaction that we will intentionally break
    let errorThrown = false;
    try {
      await ownedMobilityRepository.withTransaction(async (tx) => {
        // Mock the query to throw an error ONLY on INSERT to simulate insertion failure
        const originalQuery = tx.query.bind(tx);
        (tx as any).query = function(...args: any[]) {
          const text = args[0];
          if (typeof text === 'string' && text.includes("INSERT INTO ops.consumer_notification_outbox")) {
            return Promise.reject(new Error("Simulated insertion failure"));
          }
          return originalQuery.apply(tx, args as any);
        };

        try {
          await ownedMobilityRepository.persistOrderWorkflow(tx as any, {
            consumerNotificationOutbox: [outbox],
          });
        } finally {
          (tx as any).query = originalQuery;
        }
      });
    } catch {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);

    // Verify sequence is STILL 1 (it was rolled back)
    const seqResult = await pool.query(
      `SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1`,
      [orderId]
    );
    expect(Number(seqResult.rows[0].next_sequence)).toBe(1);

    // Verify outbox was not created
    const outboxResult = await pool.query(
      `SELECT 1 FROM ops.consumer_notification_outbox WHERE outbox_id = $1`,
      [outboxId]
    );
    expect(outboxResult.rowCount).toBe(0);

    // Now do it without error and verify it increments
    await ownedMobilityRepository.withTransaction(async (tx) => {
      await ownedMobilityRepository.persistOrderWorkflow(tx as any, {
        consumerNotificationOutbox: [outbox],
      });
    });

    const seqResult2 = await pool.query(
      `SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1`,
      [orderId]
    );
    // 1 became 2 because it allocated sequence 1
    expect(Number(seqResult2.rows[0].next_sequence)).toBe(2);
    
    // Verify outbox has eventSequence = 1
    const finalOutboxResult = await pool.query(
      `SELECT payload FROM ops.consumer_notification_outbox WHERE outbox_id = $1`,
      [outboxId]
    );
    expect(finalOutboxResult.rows[0].payload.eventSequence).toBe(1);
  });
});

describe("OwnedMobilityRepository consumer notification outbox event sequence (Mocked)", () => {
  it("allocates the durable sequence in the same transaction using the same executor", async () => {
    let allocateCalled = false;
    const fakeExecutor = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      query: async (sql: string, params: any[]) => {
        if (sql.includes("INSERT INTO ops.consumer_notification_outbox")) {
          return { rows: [{ outbox_id: "mock-outbox-1" }] };
        }
        if (sql.includes("UPDATE ops.consumer_notification_outbox")) {
          return { rows: [] };
        }
        return { rows: [] };
      }
    };

    const fakeMultiTaxiRepository = {
      allocateNotificationEventSequence: async (orderId: string, executor: any) => {
        allocateCalled = true;
        expect(executor).toHaveProperty('query');
        return 99;
      }
    };

    const fakeDbService = {
      connect: async () => fakeExecutor,
      query: (t: string, v: any[]) => fakeExecutor.query(t, v),
      isEnabled: () => true,
    };

    const repo = new (OwnedMobilityRepository as any)(
      fakeDbService,
      fakeMultiTaxiRepository
    );

    repo.withTransaction = async (cb: any) => {
      return cb(fakeExecutor);
    };

    await repo.withTransaction(async (tx: any) => {
      await repo.persistOrderWorkflow(tx, {
        consumerNotificationOutbox: [
          {
            outboxId: "mock-outbox-1",
            orderId: "mock-order-1",
            passengerSubjectRef: "mock-subject",
            eventType: "assignment_disclosure_ready",
            assignmentVersion: 1,
            payload: {},
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            deliveredAt: null,
          }
        ]
      });
    });

    expect(allocateCalled).toBe(true);
  });
});
