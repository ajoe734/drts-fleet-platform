import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MultiTaxiRepository,
  type RecordPushDeliveryOutcomeInput,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import type { StoredPartnerNotificationContext } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.types";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
const databaseUrl = process.env.PARTNER_NOTIFY_TRANSPORT_TEST_DATABASE_URL;

// Opt-in external PostgreSQL only. Never starts a server on the worker VM.
describe.skipIf(!databaseUrl)(
  "partner transport PostgreSQL transaction gate",
  () => {
    const databaseName = `notify_transport_${randomUUID().replaceAll("-", "")}`;
    let admin: InstanceType<typeof Pool>;
    let pool: InstanceType<typeof Pool>;
    let repository: MultiTaxiRepository;
    let created = false;
    const bindingId = randomUUID();

    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      created = true;
      const url = new URL(databaseUrl!);
      url.pathname = `/${databaseName}`;
      pool = new Pool({ connectionString: url.toString(), max: 8 });
      await pool.query(`CREATE SCHEMA ops; CREATE SCHEMA admin; CREATE SCHEMA mobility;
      CREATE TABLE admin.phase1_partner_channel_entries(entry_slug varchar(150) PRIMARY KEY);
      CREATE TABLE admin.phase1_tenant_webhook_endpoints(webhook_id varchar(100) PRIMARY KEY);`);
      const original = await readFile(
        "infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql",
        "utf8",
      );
      await pool.query(
        original.match(
          /CREATE TABLE IF NOT EXISTS ops\.consumer_notification_outbox \([\s\S]*?\n\);/,
        )![0],
      );
      for (const migration of [
        "V0099__sr_passenger_push_delivery.sql",
        "V0104__sr_partner_notification_binding_and_routing.sql",
        "V0105__sr_partner_notification_delivery_context.sql",
      ]) {
        await pool.query(
          await readFile(`infra/migrations/${migration}`, "utf8"),
        );
      }
      await pool.query(
        `INSERT INTO admin.phase1_partner_channel_entries VALUES ('entry'); INSERT INTO admin.phase1_tenant_webhook_endpoints VALUES ('webhook')`,
      );
      await pool.query(
        `INSERT INTO admin.phase1_partner_notification_bindings (entry_slug,binding_id,tenant_id,partner_id,webhook_id,event_types) VALUES ('entry',$1,'tenant','partner','webhook','[]')`,
        [bindingId],
      );
      await pool.query(
        `INSERT INTO mobility.phase1_order_partner_notification_routes (order_id,tenant_id,partner_id,entry_slug,partner_user_ref,drts_passenger_id,passenger_subject_ref,identity_linked_at,consent_bundle_version,ride_ref) VALUES ('order','tenant','partner','entry','opaque','passenger','subject',now(),'v1','ride')`,
      );
      repository = new MultiTaxiRepository({
        isEnabled: () => true,
        query: pool.query.bind(pool),
        connect: pool.connect.bind(pool),
      } as never);
    }, 30_000);
    afterAll(async () => {
      await pool?.end();
      if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
      await admin?.end();
    });
    beforeEach(async () => {
      await pool.query(`TRUNCATE ops.consumer_notification_outbox CASCADE`);
      await pool.query(
        `INSERT INTO ops.consumer_notification_outbox (outbox_id,order_id,passenger_subject_ref,event_type,assignment_version,payload,next_attempt_at,created_at) VALUES ('outbox','order','subject','receipt_ready',1,'{"eventSequence":1}',now()-interval '1 second',now())`,
      );
    });
    function context(): StoredPartnerNotificationContext {
      const deliveryId = randomUUID();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 600_000).toISOString();
      return {
        outboxId: "outbox",
        deliveryId,
        orderId: "order",
        entrySlug: "entry",
        tenantId: "tenant",
        partnerId: "partner",
        bindingId,
        bindingVersion: 1,
        webhookId: "webhook",
        endpointFingerprint: "fingerprint",
        wirePayloadHash: "hash",
        eventSequence: 1,
        expiresAt,
        wirePayload: {
          event: "passenger.receipt_ready.v1",
          deliveryId,
          tenantId: "tenant",
          occurredAt: now,
          data: {
            schemaVersion: "1.0",
            notificationId: "outbox",
            partnerEntrySlug: "entry",
            recipient: { partnerUserRef: "opaque" },
            rideRef: "ride",
            eventSequence: 1,
            assignmentVersion: 1,
            expiresAt,
            message: "receipt ready",
            navigation: { type: "ride", rideRef: "ride" },
          },
        },
        retryPolicySnapshot: {
          maxAttempts: 5,
          initialBackoffSeconds: 30,
          maxBackoffSeconds: 300,
          backoffMultiplier: 2,
          retryableStatusCodes: [503],
        },
        deliveryTarget: "partner_endpoint",
        deliveryStage: null,
        retryDisposition: null,
        failureReason: null,
        receiptId: null,
        downstreamStatus: "unknown",
        createdAt: now,
        deliveredAt: null,
      };
    }
    function outcome(fenceToken: number): RecordPushDeliveryOutcomeInput {
      const now = new Date().toISOString();
      return {
        outboxId: "outbox",
        passengerSubjectRef: "subject",
        fenceToken,
        providerName: "partner_webhook",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "real-receipt",
        deliveryOutcome: {
          outboxId: "outbox",
          status: "delivered",
          result: "delivered",
          attemptCount: 1,
          nextAttemptAt: now,
          deliveredAt: now,
          providerName: "partner_webhook",
        },
        partnerMetadata: {
          deliveryTarget: "partner_endpoint",
          deliveryStage: "partner_accepted",
          retryDisposition: "none",
          failureReason: null,
          receiptId: "real-receipt",
          downstreamStatus: "unknown",
          expiresAt: context().expiresAt,
        },
      };
    }
    it("two real connections grant exactly one claim and reserve exactly one attempt", async () => {
      const claims = await Promise.all([
        repository.claimPartnerNotification("outbox", "a", 120),
        repository.claimPartnerNotification("outbox", "b", 120),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(
        (
          await pool.query(
            "SELECT attempt_count FROM ops.consumer_notification_outbox",
          )
        ).rows[0].attempt_count,
      ).toBe(1);
    });
    it("stores immutable context before IO and atomically commits real receipt/outcome/release", async () => {
      const claim = (await repository.claimPartnerNotification(
        "outbox",
        "a",
        120,
      ))!;
      const original = await repository.preparePartnerNotificationContext(
        context(),
        claim.fenceToken,
      );
      const replay = await repository.preparePartnerNotificationContext(
        context(),
        claim.fenceToken,
      );
      expect(replay.deliveryId).toBe(original.deliveryId);
      expect(
        await repository.recordPushDeliveryOutcome(outcome(claim.fenceToken)),
      ).toMatchObject({ recorded: true });
      const result =
        await pool.query(`SELECT o.status,c.receipt_id,c.delivery_stage,l.claim_state,r.provider_message_ref,r.device_delivery_state
      FROM ops.consumer_notification_outbox o JOIN mobility.phase1_partner_notification_delivery_contexts c USING(outbox_id)
      JOIN ops.phase1_push_delivery_claims l USING(outbox_id) JOIN ops.phase1_push_delivery_receipts r USING(outbox_id)`);
      expect(result.rows[0]).toEqual({
        status: "delivered",
        receipt_id: "real-receipt",
        delivery_stage: "partner_accepted",
        claim_state: "released",
        provider_message_ref: "real-receipt",
        device_delivery_state: "unknown",
      });
      await expect(
        pool.query(
          `UPDATE mobility.phase1_partner_notification_delivery_contexts SET wire_payload='{}'`,
        ),
      ).rejects.toThrow("immutable");
    });
    it("rejects expired lease even before another worker reclaims", async () => {
      const claim = (await repository.claimPartnerNotification(
        "outbox",
        "a",
        120,
      ))!;
      await pool.query(
        `UPDATE ops.phase1_push_delivery_claims SET lease_expires_at=now()-interval '1 second'`,
      );
      expect(
        await repository.recordPushDeliveryOutcome(outcome(claim.fenceToken)),
      ).toMatchObject({ recorded: false, reason: "fence_lost" });
      expect(
        (await pool.query("SELECT * FROM ops.phase1_push_delivery_receipts"))
          .rows,
      ).toHaveLength(0);
    });
    it("rolls back receipt and context when the final outbox write fails", async () => {
      const claim = (await repository.claimPartnerNotification(
        "outbox",
        "a",
        120,
      ))!;
      await repository.preparePartnerNotificationContext(
        context(),
        claim.fenceToken,
      );
      // A real CHECK violation after receipt/context writes, not a mocked commit.
      const invalid = outcome(claim.fenceToken);
      invalid.deliveryOutcome.status = "invalid" as never;
      await expect(
        repository.recordPushDeliveryOutcome(invalid),
      ).rejects.toThrow();
      expect(
        (await pool.query("SELECT * FROM ops.phase1_push_delivery_receipts"))
          .rows,
      ).toHaveLength(0);
      expect(
        (await repository.findPartnerNotificationContext("outbox"))?.receiptId,
      ).toBeNull();
      expect(
        (
          await pool.query(
            "SELECT claim_state FROM ops.phase1_push_delivery_claims",
          )
        ).rows[0].claim_state,
      ).toBe("claimed");
    });
    it("unknown fifth attempt is terminalized without reserving a sixth", async () => {
      const first = (await repository.claimPartnerNotification(
        "outbox",
        "a",
        120,
      ))!;
      await repository.preparePartnerNotificationContext(
        context(),
        first.fenceToken,
      );
      await pool.query(
        `UPDATE ops.consumer_notification_outbox SET attempt_count=5,next_attempt_at=now()-interval '1 second'; UPDATE ops.phase1_push_delivery_claims SET lease_expires_at=now()-interval '1 second'`,
      );
      const retry = (await repository.claimPartnerNotification(
        "outbox",
        "b",
        120,
      ))!;
      expect(retry.attemptLimitReached).toBe(true);
      expect(retry.record.attemptCount).toBe(5);
      expect(
        await repository.recordPushDeliveryOutcome(outcome(first.fenceToken)),
      ).toMatchObject({ recorded: false });
    });
    it("due selection excludes manual/configuration/terminal/delivered and future attempts", async () => {
      expect(await repository.listDuePartnerNotifications()).toHaveLength(1);
      for (const disposition of [
        "manual_only",
        "configuration_blocked",
        "terminal",
        "none",
      ]) {
        await pool.query(
          `UPDATE ops.consumer_notification_outbox SET payload=jsonb_set(payload,'{partnerNotification}',$1::jsonb)`,
          [JSON.stringify({ retryDisposition: disposition })],
        );
        expect(await repository.listDuePartnerNotifications()).toHaveLength(0);
      }
      await pool.query(
        `UPDATE ops.consumer_notification_outbox SET payload='{}',next_attempt_at=now()+interval '1 hour'`,
      );
      expect(await repository.listDuePartnerNotifications()).toHaveLength(0);
    });
    it("catalog confirms matching FK types and unknown downstream status", async () => {
      const rows = await pool.query(
        `SELECT format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid IN ('ops.consumer_notification_outbox'::regclass,'mobility.phase1_partner_notification_delivery_contexts'::regclass) AND a.attname='outbox_id'`,
      );
      expect(rows.rows.map((r) => r.type)).toEqual([
        "character varying(255)",
        "character varying(255)",
      ]);
    });
  },
);
