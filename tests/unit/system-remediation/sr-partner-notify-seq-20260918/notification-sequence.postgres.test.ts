import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { ConsumerNotificationOutboxRecord } from "@drts/contracts";
import type { DatabaseService } from "../../../../apps/api/src/common/db";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
const databaseUrl = process.env.PARTNER_NOTIFY_SEQ_TEST_DATABASE_URL;

// Opt-in real PostgreSQL gate, not a SQL-string simulator. A configured but
// unreachable DB fails. Each run creates/drops only its own random database.
describe.skipIf(!databaseUrl)(
  "SR-PARTNER-NOTIFY-SEQ-20260918 PostgreSQL",
  () => {
    const databaseName = `notify_seq_${randomUUID().replaceAll("-", "")}`;
    let admin: InstanceType<typeof Pool>;
    let pool: InstanceType<typeof Pool>;
    let repository: OwnedMobilityRepository;
    let allocator: MultiTaxiRepository;
    let database: DatabaseService;
    let created = false;

    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      created = true;
      const url = new URL(databaseUrl!);
      url.pathname = `/${databaseName}`;
      pool = new Pool({ connectionString: url.toString(), max: 16 });
      await pool.query(`
      CREATE SCHEMA ops;
      CREATE SCHEMA mobility;
      CREATE SCHEMA admin;
      CREATE TABLE admin.phase1_partner_channel_entries (entry_slug varchar(150) PRIMARY KEY);
      CREATE TABLE admin.phase1_tenant_webhook_endpoints (webhook_id varchar(100) PRIMARY KEY);
    `);
      // Apply the actual route/counter migration and actual outbox table DDL.
      const routeMigration = await readFile(
        "infra/migrations/V0104__sr_partner_notification_binding_and_routing.sql",
        "utf8",
      );
      const outboxMigration = await readFile(
        "infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql",
        "utf8",
      );
      const outboxDdl = outboxMigration.match(
        /CREATE TABLE IF NOT EXISTS ops\.consumer_notification_outbox \([\s\S]*?\n\);/,
      )?.[0];
      if (!outboxDdl) throw new Error("outbox migration DDL missing");
      await pool.query(routeMigration);
      await pool.query(outboxDdl);
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries VALUES ('entry-seq')",
      );
      // A real SQL error after allocation verifies the counter and inserted row
      // are both rolled back, including persistChanges' implicit transaction.
      await pool.query(`
      CREATE FUNCTION ops.reject_sequence_payload() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.payload->>'rejectSequence' = 'true' AND NEW.payload ? 'eventSequence' THEN
          RAISE EXCEPTION 'injected payload failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_sequence_payload BEFORE UPDATE ON ops.consumer_notification_outbox
        FOR EACH ROW EXECUTE FUNCTION ops.reject_sequence_payload();
    `);
      database = {
        isEnabled: () => true,
        connect: () => pool.connect(),
        query: vi.fn(() => {
          throw new Error("allocator escaped the transaction");
        }),
      } as unknown as DatabaseService;
      allocator = new MultiTaxiRepository(database);
      repository = new OwnedMobilityRepository(database, allocator);
    }, 30_000);

    afterAll(async () => {
      await pool?.end();
      if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
      await admin?.end();
    });

    beforeEach(async () => {
      vi.restoreAllMocks();
      await pool.query(
        "TRUNCATE ops.consumer_notification_outbox, mobility.phase1_partner_notification_sequences, mobility.phase1_order_partner_notification_routes",
      );
      for (const orderId of ["order-a", "order-b"]) {
        await allocator.writeOrderPartnerNotificationRoute({
          orderId,
          tenantId: "tenant-seq",
          partnerId: "partner-seq",
          entrySlug: "entry-seq",
          partnerUserRef: "opaque-user",
          drtsPassengerId: "passenger-seq",
          passengerSubjectRef: "subject-seq",
          identityLinkedAt: "2026-09-19T00:00:00.000Z",
          consentBundleVersion: "v1",
          notificationPolicyVersion: "partner_notification_v1",
          rideRef: `ride-${orderId}`,
          createdAt: "2026-09-19T00:00:00.000Z",
        });
      }
    });

    function event(
      id: string,
      orderId = "order-a",
      eventType: ConsumerNotificationOutboxRecord["eventType"] = "eta_changed",
    ): ConsumerNotificationOutboxRecord {
      return {
        outboxId: id,
        orderId,
        passengerSubjectRef: "subject-seq",
        eventType,
        assignmentVersion: 42,
        payload: { marker: id },
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: "2026-09-19T00:00:00.000Z",
        createdAt: "2026-09-19T00:00:00.000Z",
        deliveredAt: null,
      };
    }

    async function nextSequence(orderId = "order-a") {
      const result = await pool.query(
        "SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id = $1",
        [orderId],
      );
      return Number(result.rows[0].next_sequence);
    }

    async function rows() {
      return (
        await pool.query(
          "SELECT * FROM ops.consumer_notification_outbox ORDER BY (payload->>'eventSequence')::bigint",
        )
      ).rows;
    }

    it("uses the caller's transaction and rolls back both outbox and allocated sequence", async () => {
      const allocate = vi.spyOn(allocator, "allocateNotificationEventSequence");
      await expect(
        repository.withTransaction(async (tx) => {
          await repository.persistOrderWorkflow(tx, {
            consumerNotificationOutbox: [event("rolled-back")],
          });
          expect(allocate).toHaveBeenCalledExactlyOnceWith("order-a", tx);
          expect(
            (
              await tx.query(
                "SELECT payload FROM ops.consumer_notification_outbox",
              )
            ).rows[0].payload.eventSequence,
          ).toBe(1);
          // A different connection cannot see either uncommitted change.
          expect(await rows()).toHaveLength(0);
          expect(await nextSequence()).toBe(1);
          throw new Error("abort workflow");
        }),
      ).rejects.toThrow("abort workflow");
      expect(await rows()).toHaveLength(0);
      expect(await nextSequence()).toBe(1);
      await repository.persistChanges({
        consumerNotificationOutbox: [event("after-rollback")],
      });
      expect((await rows())[0].payload.eventSequence).toBe(1);
      expect(database.query).not.toHaveBeenCalled();
    });

    it("rolls back allocation and all batch rows when the payload update fails", async () => {
      const failing = event("rejected");
      failing.payload = { rejectSequence: true };
      await expect(
        repository.persistChanges({
          consumerNotificationOutbox: [event("first-in-batch"), failing],
        }),
      ).rejects.toThrow("injected payload failure");
      expect(await rows()).toHaveLength(0);
      expect(await nextSequence()).toBe(1);
      await repository.persistChanges({
        consumerNotificationOutbox: [event("rejected")],
      });
      expect((await rows())[0].payload.eventSequence).toBe(1);
    });

    it("allocates increasing sequences for all five event types independently of assignmentVersion", async () => {
      const types: ConsumerNotificationOutboxRecord["eventType"][] = [
        "assignment_disclosure_ready",
        "assignment_replaced",
        "eta_changed",
        "driver_arrived",
        "receipt_ready",
      ];
      const events = types.map((type, i) =>
        event(`event-${i}`, "order-a", type),
      );
      events[4]!.assignmentVersion = null;
      await repository.persistChanges({ consumerNotificationOutbox: events });
      expect(
        (await rows()).map((row) => [
          row.event_type,
          row.payload.eventSequence,
        ]),
      ).toEqual(types.map((type, i) => [type, i + 1]));
      expect(await nextSequence()).toBe(6);
      expect(await nextSequence("order-b")).toBe(1);
      const restarted = new OwnedMobilityRepository(
        database,
        new MultiTaxiRepository(database),
      );
      await restarted.persistChanges({
        consumerNotificationOutbox: [event("after-restart")],
      });
      expect((await rows()).at(-1).payload.eventSequence).toBe(6);
    });

    it("keeps ID, sequence, payload and delivery state unchanged on a replay", async () => {
      const original = event("replayed");
      await repository.persistChanges({
        consumerNotificationOutbox: [original],
      });
      await pool.query(
        "UPDATE ops.consumer_notification_outbox SET status = 'delivered', attempt_count = 2, delivered_at = now() WHERE outbox_id = $1",
        [original.outboxId],
      );
      const stored = (await rows())[0];
      const allocate = vi.spyOn(allocator, "allocateNotificationEventSequence");
      await repository.persistChanges({
        consumerNotificationOutbox: [
          { ...original, payload: { marker: "changed", eventSequence: 999 } },
        ],
      });
      expect(allocate).not.toHaveBeenCalled();
      expect((await rows())[0]).toEqual(stored);
      expect(await nextSequence()).toBe(2);
    });

    it("allocates exactly once across concurrent retries without burning sequence numbers", async () => {
      const allocate = vi.spyOn(allocator, "allocateNotificationEventSequence");
      await Promise.all(
        Array.from({ length: 16 }, () =>
          repository.persistChanges({
            consumerNotificationOutbox: [event("concurrent-retry")],
          }),
        ),
      );
      expect(allocate).toHaveBeenCalledTimes(1);
      expect(await rows()).toHaveLength(1);
      expect(await nextSequence()).toBe(2);
      await repository.persistChanges({
        consumerNotificationOutbox: [event("next-event")],
      });
      expect((await rows()).map((row) => row.payload.eventSequence)).toEqual([
        1, 2,
      ]);
    });

    it("gives concurrent distinct events unique contiguous sequences per order", async () => {
      const writes = Array.from({ length: 16 }, (_, i) =>
        event(`concurrent-${i}`),
      );
      writes.push(event("other-order", "order-b"));
      await Promise.all(
        writes.map((outbox) =>
          repository.persistChanges({ consumerNotificationOutbox: [outbox] }),
        ),
      );
      const stored = await rows();
      expect(
        stored
          .filter((row) => row.order_id === "order-a")
          .map((row) => row.payload.eventSequence),
      ).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
      expect(
        stored.find((row) => row.order_id === "order-b").payload.eventSequence,
      ).toBe(1);
      expect(await nextSequence()).toBe(17);
    });

    it("preserves non-partner payloads and does not consume another order's sequence", async () => {
      const outbox = event("non-partner-event", "order-no-route");
      await repository.persistChanges({ consumerNotificationOutbox: [outbox] });
      const stored = (await rows())[0];
      expect(stored.payload).toEqual(outbox.payload);
      expect(stored.status).toBe("pending");
      expect(stored.attempt_count).toBe(0);
      expect(await nextSequence()).toBe(1);
    });
  },
);
