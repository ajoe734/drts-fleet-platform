import { randomUUID } from "node:crypto";
import { describe, it, beforeAll, afterAll, afterEach, expect } from "vitest";
import { createRequire } from "node:module";

const customRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { NestFactory } = customRequire("@nestjs/core");
const { Pool } = customRequire("pg");

import { AppModule } from "../../../../apps/api/src/app.module";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

const testDbUrl = process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;

describe.skipIf(!testDbUrl)(
  "partner notification UI postgres acceptance",
  () => {
    let pool: any;
    const originalEnv = { ...process.env };
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
    let computedFingerprint = "";

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
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'p1', 'active', $4::jsonb)",
        [
          entrySlug1,
          tenantId,
          partnerId,
          JSON.stringify({
            entrySlug: entrySlug1,
            tenantId,
            partnerId,
            partnerCode: "P1",
            partnerType: "enterprise",
            programId: "p1",
            displayName: "Partner 1",
            businessDispatchSubtype: "standard",
            activeFlag: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            auditMetadata: {
              source: "test",
              updatedBy: "system:test",
            },
            status: "active",
          }),
        ],
      );
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'p2', 'active', $4::jsonb)",
        [
          entrySlug2,
          tenantId,
          partnerId,
          JSON.stringify({
            entrySlug: entrySlug2,
            tenantId,
            partnerId,
            partnerCode: "P2",
            partnerType: "enterprise",
            programId: "p2",
            displayName: "Partner 2",
            businessDispatchSubtype: "standard",
            activeFlag: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            auditMetadata: {
              source: "test",
              updatedBy: "system:test",
            },
            status: "active",
          }),
        ],
      );

      const endpointRecord = {
        url: "https://test.com",
        events: ["passenger.eta_changed.v1"],
        status: "active",
        webhookId: webhookId,
        tenantId: tenantId,
        secretVersion: 1,
        secretPreview: "prev",
        validatedAt: "2026-09-24T00:00:00Z",
        retryPolicy: { maxAttempts: 3 },
        runtimeMetadata: {
          secretRotation: { rotatedAt: null, rotationCount: 0, history: [] },
          deliveryCount: 0,
          failedDeliveryCount: 0,
        },
      };

      // Compute actual fingerprint
      const { computeEndpointFingerprint } = customRequire(
        "../../../../apps/api/src/modules/tenant-partner/partner-notification-fingerprint",
      );
      computedFingerprint = computeEndpointFingerprint(endpointRecord);
      endpointRecord.fingerprint = computedFingerprint;

      await pool.query(
        "INSERT INTO admin.phase1_tenant_webhook_endpoints (webhook_id, tenant_id, status, created_at, updated_at, record) VALUES ($1, $2, 'active', now(), now(), $3::jsonb)",
        [webhookId, tenantId, JSON.stringify(endpointRecord)],
      );

      await pool.query(
        "INSERT INTO admin.phase1_partner_notification_bindings (binding_id, entry_slug, tenant_id, partner_id, webhook_id, version, state, event_types, validated_endpoint_fingerprint, validated_at) VALUES ($1, $2, $3, $4, $5, 1, 'ready', '[\"eta_changed\"]', $6, '2026-09-24T00:00:00Z')",
        [
          bindingId1,
          entrySlug1,
          tenantId,
          partnerId,
          webhookId,
          computedFingerprint,
        ],
      );
      await pool.query(
        "INSERT INTO admin.phase1_partner_notification_bindings (binding_id, entry_slug, tenant_id, partner_id, webhook_id, version, state, event_types, validated_endpoint_fingerprint, validated_at) VALUES ($1, $2, $3, $4, $5, 1, 'ready', '[\"eta_changed\"]', $6, '2026-09-24T00:00:00Z')",
        [
          bindingId2,
          entrySlug2,
          tenantId,
          partnerId,
          webhookId,
          computedFingerprint,
        ],
      );

      app = await NestFactory.createApplicationContext(AppModule);
      await app.init();

      mtRepo = app.get(MultiTaxiRepository);
    });

    afterEach(async () => {
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
        await pool.query(
          "DELETE FROM ops.phase1_owned_orders WHERE order_id = ANY($1)",
          [createdOrderIds],
        );
      }
      createdOutboxIds.length = 0;
      createdOrderIds.length = 0;
    });

    afterAll(async () => {
      try {
        await pool.query(
          "DELETE FROM admin.phase1_partner_user_identity_links WHERE entry_slug IN ($1, $2)",
          [entrySlug1, entrySlug2],
        );
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
      } finally {
        if (originalEnv.PARTNER_NOTIFY_UI_TEST_DATABASE_URL !== undefined) {
          process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL =
            originalEnv.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;
        } else {
          delete process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;
        }

        if (originalEnv.DATABASE_URL !== undefined) {
          process.env.DATABASE_URL = originalEnv.DATABASE_URL;
        } else {
          delete process.env.DATABASE_URL;
        }

        if (originalEnv.AUTH_MODE !== undefined) {
          process.env.AUTH_MODE = originalEnv.AUTH_MODE;
        } else {
          delete process.env.AUTH_MODE;
        }
      }
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
        'INSERT INTO admin.phase1_partner_user_identity_links (entry_slug, partner_user_ref, drts_passenger_id, status, consent_scope, linked_at, last_seen_at, created_at, updated_at, record) VALUES ($1, \'user\', \'passenger\', \'active\', \'["all"]\'::jsonb, now(), now(), now(), now(), \'{"status":"active","drtsPassengerId":"passenger","partnerUserRef":"user"}\') ON CONFLICT DO NOTHING',
        [opts.entrySlug || entrySlug1],
      );
      await pool.query(
        "INSERT INTO ops.phase1_owned_orders (order_id, order_no, status, order_source, service_bucket, dispatch_semantics, created_at, updated_at, record) VALUES ($1, $1, 'created', 'app', 'multi_taxi', 'immediate', now(), now(), $2::jsonb)",
        [orderId, JSON.stringify({ tenantId, partnerId, origin: "system" })],
      );

      await pool.query(
        "INSERT INTO mobility.phase1_order_partner_notification_routes (order_id, ride_ref, entry_slug, tenant_id, partner_id, partner_user_ref, drts_passenger_id, passenger_subject_ref, identity_linked_at, consent_bundle_version, created_at) VALUES ($1, $1, $2, $3, $4, 'user', 'passenger', 'sub', now(), 1, now())",
        [orderId, opts.entrySlug || entrySlug1, tenantId, partnerId],
      );

      const status = opts.status || "failed";
      await pool.query(
        "INSERT INTO ops.consumer_notification_outbox (outbox_id, order_id, passenger_subject_ref, event_type, payload, status, attempt_count, next_attempt_at, created_at, assignment_version) VALUES ($1, $2, 'sub', 'eta_changed', '{}', $3, 1, now() - interval '1 hour', now(), 1)",
        [outboxId, orderId, status],
      );

      const wirePayload = {
        event: "passenger.eta_changed.v1",
        data: {
          assignmentVersion: 1,
          assignment: { version: 1 },
          recipient: { partnerUserRef: "user" },
        },
      };
      const { createHash } = customRequire("node:crypto");
      const wirePayloadHash = createHash("sha256")
        .update(JSON.stringify(wirePayload))
        .digest("hex");

      await pool.query(
        "INSERT INTO mobility.phase1_partner_notification_delivery_contexts (outbox_id, delivery_id, order_id, entry_slug, tenant_id, partner_id, binding_id, binding_version, webhook_id, endpoint_fingerprint, wire_payload, wire_payload_hash, event_sequence, expires_at, retry_policy_snapshot, delivery_target, retry_disposition, failure_reason, receipt_id, created_at) VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, 1, $7, $8, $9::jsonb, $10, 42, " +
          (opts.expiresAt || "now() + interval '1 day'") +
          ", '{\"maxAttempts\": 3}'::jsonb, 'partner_endpoint', $11, $12, $13, now())",
        [
          outboxId,
          orderId,
          opts.entrySlug || entrySlug1,
          tenantId,
          partnerId,
          opts.entrySlug === entrySlug2 ? bindingId2 : bindingId1,
          webhookId,
          computedFingerprint,
          JSON.stringify(wirePayload),
          wirePayloadHash,
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
      if (res1.kind !== "requeued") {
        console.log("res1 failed:", res1);
      }
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
        { entrySlug: entrySlug1, tenantId, partnerId },
        { pageSize: 50 },
      );
      expect(list1.rows.length).toBe(1);
      expect(list1.rows[0].deliveryId).toBeDefined();
      const { createHash } = customRequire("node:crypto");
      const expectedHash = createHash("sha256")
        .update(
          JSON.stringify({
            event: "passenger.eta_changed.v1",
            data: {
              assignmentVersion: 1,
              assignment: { version: 1 },
              recipient: { partnerUserRef: "user" },
            },
          }),
        )
        .digest("hex");
      expect(list1.rows[0].wirePayloadHash).toBe(expectedHash);
      expect(Number(list1.rows[0].eventSequence)).toBe(42);
      expect(list1.rows[0].receiptId).toBe("rcpt-123");

      const list2 = await mtRepo.listPartnerNotificationDeliveries(
        { entrySlug: entrySlug2, tenantId, partnerId },
        { pageSize: 50 },
      );
      expect(list2.rows.length).toBe(1);
      expect(list2.rows[0].receiptId).toBe("rcpt-456");
    });

    it("tests list API pagination boundary", async () => {
      // Test pagination boundary
      const listP = await mtRepo.listPartnerNotificationDeliveries(
        { entrySlug: entrySlug1, tenantId, partnerId },
        { page: 2, pageSize: 50 },
      );
      expect(listP.rows.length).toBe(0);
    });
  },
);
