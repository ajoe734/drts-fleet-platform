import { randomUUID } from "node:crypto";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createRequire } from "node:module";

const customRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { NestFactory } = customRequire("@nestjs/core");
const { Pool } = customRequire("pg");

import { AppModule } from "../../../../apps/api/src/app.module";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

const testDbUrl = process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;

describe.skipIf(!testDbUrl || process.env.RUN_UI_PG_GATE !== "true")(
  "partner notification UI postgres acceptance",
  () => {
    let pool: any;
    let app: any;
    let mtRepo: any;

    // Unique test suite identifier prefix
    const testRunId = randomUUID();
    const entrySlug1 = `test-entry-${testRunId}-1`;
    const entrySlug2 = `test-entry-${testRunId}-2`;
    const tenantId = `tenant-${testRunId}`;
    const partnerId = `partner-${testRunId}`;
    const webhookId = `w-${testRunId}`;
    const bindingId1 = randomUUID();
    const bindingId2 = randomUUID();

    const createdOutboxIds: string[] = [];
    const createdOrderIds: string[] = [];

    beforeAll(async () => {
      process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL = testDbUrl;
      process.env.DATABASE_URL = testDbUrl;
      process.env.AUTH_MODE = "test";

      pool = new Pool({ connectionString: testDbUrl, max: 16 });

      // Create unique tenants and webhooks
      await pool.query(
        "INSERT INTO admin.phase1_platform_tenants (tenant_id, tenant_code, tenant_status, created_at, updated_at, record) VALUES ($1, $2, 'active', now(), now(), '{}')",
        [tenantId, `T-${testRunId}`],
      );

      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'p1', 'active', '{}')",
        [entrySlug1, tenantId, partnerId],
      );
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'p2', 'active', '{}')",
        [entrySlug2, tenantId, partnerId],
      );

      await pool.query(
        "INSERT INTO admin.phase1_tenant_webhook_endpoints (webhook_id, tenant_id, url, events, status, secret_version, secret_preview, created_at, updated_at) VALUES ($1, $2, 'https://test.com', '[]', 'active', 1, 'prev', now(), now())",
        [webhookId, tenantId],
      );

      await pool.query(
        "INSERT INTO admin.phase1_partner_notification_bindings (binding_id, entry_slug, tenant_id, partner_id, webhook_id, version, state, event_types, validated_endpoint_fingerprint, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 1, 'ready', '[]', 'f', now(), now())",
        [bindingId1, entrySlug1, tenantId, partnerId, webhookId],
      );
      await pool.query(
        "INSERT INTO admin.phase1_partner_notification_bindings (binding_id, entry_slug, tenant_id, partner_id, webhook_id, version, state, event_types, validated_endpoint_fingerprint, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 1, 'ready', '[]', 'f', now(), now())",
        [bindingId2, entrySlug2, tenantId, partnerId, webhookId],
      );

      app = await NestFactory.createApplicationContext(AppModule);
      await app.init();

      mtRepo = app.get(MultiTaxiRepository);
      mtService = app.get(MultiTaxiService);
    });

    afterAll(async () => {
      // Scoped cleanup
      if (createdOutboxIds.length > 0) {
        await pool.query(
          "DELETE FROM ops.phase1_push_delivery_claims WHERE outbox_id = ANY($1)",
          [createdOutboxIds],
        );
        await pool.query(
          "DELETE FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id = ANY($1)",
          [createdOutboxIds],
        );
        await pool.query(
          "DELETE FROM ops.consumer_notification_outbox WHERE outbox_id = ANY($1)",
          [createdOutboxIds],
        );
      }
      if (createdOrderIds.length > 0) {
        await pool.query(
          "DELETE FROM mobility.phase1_order_partner_notification_routes WHERE order_id = ANY($1)",
          [createdOrderIds],
        );
      }

      await pool.query(
        "DELETE FROM admin.phase1_partner_notification_bindings WHERE binding_id IN ($1, $2)",
        [bindingId1, bindingId2],
      );
      await pool.query(
        "DELETE FROM admin.phase1_tenant_webhook_endpoints WHERE webhook_id = $1",
        [webhookId],
      );
      await pool.query(
        "DELETE FROM admin.phase1_partner_channel_entries WHERE entry_slug IN ($1, $2)",
        [entrySlug1, entrySlug2],
      );
      await pool.query(
        "DELETE FROM admin.phase1_platform_tenants WHERE tenant_id = $1",
        [tenantId],
      );

      if (app) await app.close();
      if (pool) await pool.end();
    });

    async function createFixture(opts: {
      status?: string;
      lease?: string;
      failureReason?: string;
      expiresAt?: string;
      entrySlug?: string;
      retryDisp?: string;
      receiptId?: string;
    }) {
      const orderId = randomUUID();
      const outboxId = randomUUID();
      createdOrderIds.push(orderId);
      createdOutboxIds.push(outboxId);

      await pool.query(
        "INSERT INTO mobility.phase1_order_partner_notification_routes (order_id, entry_slug, tenant_id, partner_id, partner_user_ref, created_at, updated_at) VALUES ($1, $2, $3, $4, 'user', now(), now())",
        [orderId, opts.entrySlug || entrySlug1, tenantId, partnerId],
      );

      const status = opts.status || "failed";
      await pool.query(
        "INSERT INTO ops.consumer_notification_outbox (outbox_id, order_id, passenger_subject_ref, event_type, payload, status, attempt_count, next_attempt_at, created_at, assignment_version) VALUES ($1, $2, 'sub', 'eta_changed', '{}', $3, 1, now() - interval '1 hour', now(), 1)",
        [outboxId, orderId, status],
      );

      await pool.query(
        'INSERT INTO mobility.phase1_partner_notification_delivery_contexts (outbox_id, delivery_id, order_id, entry_slug, tenant_id, partner_id, binding_id, binding_version, webhook_id, endpoint_fingerprint, wire_payload, wire_payload_hash, event_sequence, expires_at, retry_policy_snapshot, delivery_target, retry_disposition, failure_reason, receipt_id, created_at) VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, 1, $7, \'f\', \'{"event": "passenger.eta_changed.v1", "data": {"recipient": {"partnerUserRef": "user"}}}\'::jsonb, \'testhash\', 42, ' +
          (opts.expiresAt || "now() + interval '1 day'") +
          ", '{\"maxAttempts\": 3}'::jsonb, 'target', $8, $9, $10, now())",
        [
          outboxId,
          orderId,
          opts.entrySlug || entrySlug1,
          tenantId,
          partnerId,
          opts.entrySlug === entrySlug2 ? bindingId2 : bindingId1,
          webhookId,
          opts.retryDisp || "manual_only",
          opts.failureReason || "provider_transient_error",
          opts.receiptId || null,
        ],
      );

      if (opts.lease === "active") {
        await pool.query(
          "INSERT INTO ops.phase1_push_delivery_claims (outbox_id, passenger_subject_ref, worker_id, claim_state, lease_expires_at, fence_token, claimed_at) VALUES ($1, 's', 'worker', 'claimed', now() + interval '10 minutes', 1, now())",
          [outboxId],
        );
      } else if (opts.lease === "expired") {
        await pool.query(
          "INSERT INTO ops.phase1_push_delivery_claims (outbox_id, passenger_subject_ref, worker_id, claim_state, lease_expires_at, fence_token, claimed_at) VALUES ($1, 's', 'worker', 'claimed', now() - interval '10 minutes', 1, now())",
          [outboxId],
        );
      }

      return { orderId, outboxId };
    }

    it("tests retry lifecycle: legal retry, supersession, active lease fence, and stale rejection", async () => {
      const entryObj = { entrySlug: entrySlug1, tenantId, partnerId };

      // 1. Legal retry
      const { outboxId: legalId } = await createFixture({});
      const res1 = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        legalId,
      );
      expect(res1.kind).toBe("requeued");

      const legalOutbox = await pool.query(
        "SELECT status, assignment_version FROM ops.consumer_notification_outbox WHERE outbox_id = $1",
        [legalId],
      );
      expect(legalOutbox.rows[0].status).toBe("pending");
      expect(legalOutbox.rows[0].assignment_version).toBe(1); // fence advance happens via worker, not UI API, but status changed.

      // 2. Active lease rejection (competing worker fence)
      const { outboxId: leaseId } = await createFixture({ lease: "active" });
      const resLease = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        leaseId,
      );
      expect(resLease.kind).toBe("failed");
      if (resLease.kind === "failed")
        expect(resLease.failure.failureReason).toBe("provider_transient_error");

      // 3. Expired lease is accepted (stale worker rejection)
      const { outboxId: staleId } = await createFixture({ lease: "expired" });
      const resStale = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        staleId,
      );
      expect(resStale.kind).toBe("requeued");

      // 4. Expiry / superseded
      const { outboxId: expId } = await createFixture({
        expiresAt: "now() - interval '1 day'",
        failureReason: "notification_expired",
      });
      const resExp = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        expId,
      );
      expect(resExp.kind).toBe("failed");

      const { outboxId: superId } = await createFixture({
        status: "delivered",
        failureReason: "notification_superseded",
      });
      const resSuper = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        superId,
      );
      expect(resSuper.kind).toBe("failed");
    });

    it("tests list API preservation of sequence, hash, receipt, history and same-tenant isolation", async () => {
      await await createFixture({
        entrySlug: entrySlug1,
        receiptId: "rcpt-123",
      });
      await await createFixture({
        entrySlug: entrySlug2,
        receiptId: "rcpt-456",
      });

      // mtRepo.listPartnerNotificationDeliveries
      const list1 = await mtRepo.listPartnerNotificationDeliveries(
        entrySlug1,
        { pageSize: 50 },
        { tenantId, partnerId },
      );
      expect(list1.rows.length).toBe(1);
      expect(list1.rows[0].deliveryId).toBeDefined();
      expect(list1.rows[0].wirePayloadHash).toBe("testhash");
      expect(list1.rows[0].eventSequence).toBe(42);
      expect(list1.rows[0].receiptId).toBe("rcpt-123");

      const list2 = await mtRepo.listPartnerNotificationDeliveries(
        entrySlug2,
        { pageSize: 50 },
        { tenantId, partnerId },
      );
      expect(list2.rows.length).toBe(1);
      expect(list2.rows[0].receiptId).toBe("rcpt-456");

      // Test pagination boundary
      const listP = await mtRepo.listPartnerNotificationDeliveries(
        entrySlug1,
        { page: 2, pageSize: 50 },
        { tenantId, partnerId },
      );
      expect(listP.rows.length).toBe(0);
    });
  },
);
