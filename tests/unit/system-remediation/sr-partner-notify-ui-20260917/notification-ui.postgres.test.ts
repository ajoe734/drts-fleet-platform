import { randomUUID } from "node:crypto";
import {
  describe,
  it,
  beforeAll,
  afterAll,
  afterEach,
  expect,
  vi,
} from "vitest";
import { createRequire } from "node:module";
const customRequire = createRequire(
  new URL("file://" + process.cwd() + "/apps/api/package.json"),
);
const { NestFactory } = customRequire("@nestjs/core");
const { Pool } = customRequire("pg");

import { AppModule } from "../../../../apps/api/src/app.module";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { computeEndpointFingerprint } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-fingerprint";

const testDbUrl = process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;

describe.skipIf(!testDbUrl)(
  "partner notification UI postgres acceptance",
  () => {
    let pool: any;
    const originalEnv = { ...process.env };
    let app: any;
    let mtRepo: MultiTaxiRepository;

    // Unique test suite identifier prefix
    const testRunId = randomUUID();
    const entrySlug1 = `test-entry-${testRunId}-1`;
    const entrySlug2 = `test-entry-${testRunId}-2`;
    const entrySlug3 = `test-entry-${testRunId}-3`;
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
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'p3', 'active', $4::jsonb)",
        [
          entrySlug3,
          tenantId,
          partnerId,
          JSON.stringify({
            entrySlug: entrySlug3,
            tenantId,
            partnerId,
            partnerCode: "P3",
            partnerType: "enterprise",
            programId: "p3",
            displayName: "Partner 3",
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

      const endpointRecord: import("../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository").StoredWebhookEndpointRecord =
        {
          url: "https://test.com",
          events: ["passenger.eta_changed.v1", "passenger.receipt_ready.v1"],
          status: "active",
          webhookId: webhookId,
          tenantId: tenantId,
          secretVersion: 1,
          secretPreview: "prev",
          secretValue: "test-secret-value",
          retryPolicy: {
            maxAttempts: 3,
            initialBackoffSeconds: 10,
            backoffMultiplier: 2,
            maxBackoffSeconds: 3600,
            retryableStatusCodes: [429, 500, 502, 503, 504],
          },
          runtimeMetadata: {
            secretRotation: {
              currentVersion: 1,
              rotatedAt: "2026-09-24T00:00:00Z",
              rotationCount: 0,
              history: [],
            },
            deliveryCount: 0,
            failedDeliveryCount: 0,
          } as any,
          secretHistory: [],
          createdAt: "2026-09-24T00:00:00Z",
          updatedAt: "2026-09-24T00:00:00Z",
        };

      // Compute actual fingerprint
      computedFingerprint = computeEndpointFingerprint(endpointRecord as any);

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
          "DELETE FROM ops.phase1_push_delivery_receipts WHERE outbox_id = ANY($1)",
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
          "DELETE FROM ops.passenger_dispatch_disclosure_snapshots WHERE order_id = ANY($1)",
          [createdOrderIds],
        );
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
          "DELETE FROM admin.phase1_partner_user_identity_links WHERE entry_slug IN ($1, $2, $3)",
          [entrySlug1, entrySlug2, entrySlug3],
        );
        await pool.query(
          "DELETE FROM admin.phase1_partner_notification_bindings WHERE entry_slug IN ($1, $2, $3)",
          [entrySlug1, entrySlug2, entrySlug3],
        );
        await pool.query(
          "DELETE FROM admin.phase1_tenant_webhook_endpoints WHERE webhook_id = $1",
          [webhookId],
        );
        await pool.query(
          "DELETE FROM admin.phase1_partner_channel_entries WHERE entry_slug IN ($1, $2, $3)",
          [entrySlug1, entrySlug2, entrySlug3],
        );
        await pool.query(
          "DELETE FROM admin.phase1_platform_tenants WHERE tenant_id = $1",
          [tenantId],
        );
      } finally {
        if (app) await app.close();
        if (pool) await pool.end();
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
      attemptCount?: number;
      eventType?: string;
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
        "INSERT INTO ops.consumer_notification_outbox (outbox_id, order_id, passenger_subject_ref, event_type, payload, status, attempt_count, next_attempt_at, created_at, assignment_version) VALUES ($1, $2, 'sub', $5, '{}', $3, $4, now() - interval '1 hour', now(), 1)",
        [
          outboxId,
          orderId,
          status,
          opts.attemptCount || 1,
          opts.eventType || "eta_changed",
        ],
      );

      const wirePayload = {
        event: `passenger.${opts.eventType || "eta_changed"}.v1`,
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
        expect((resLease as any).failure.failureReason).toBe(
          "provider_transient_error",
        );

      // 3. Expired lease is accepted (stale worker rejection)
      const { outboxId: staleId } = await createFixture({ lease: "expired" });
      const resStale = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        staleId,
      );
      expect(resStale.kind).toBe("requeued");

      // Actually claim the requeued outbox to get a worker fence
      const claimRes = await mtRepo.claimPartnerNotification(
        staleId,
        "worker-1",
        60,
      );
      expect(claimRes).toBeDefined();
      expect(claimRes!.fenceToken).toBeDefined();

      // Attempt a stale completion (using an old fence) - should fail
      const staleRes = await mtRepo.recordPushDeliveryOutcome({
        outboxId: staleId,
        fenceToken: claimRes!.fenceToken - 1,
        passengerSubjectRef: "sub",
        providerName: "test-provider",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "msg-fail",
        deliveryOutcome: {
          outboxId: staleId,
          status: "failed",
          result: "provider_error",
          attemptCount: 1,
          nextAttemptAt: new Date().toISOString(),
          deliveredAt: null,
          providerName: "test-provider",
        },
        partnerMetadata: {
          deliveryTarget: "partner_endpoint",
          deliveryStage: "outbox_persisted",
          retryDisposition: "automatic",
          failureReason: "provider_transient_error",
          receiptId: "receipt-123",
          downstreamStatus: "unknown",
          expiresAt: new Date().toISOString(),
        },
      });
      expect(staleRes).toEqual({ recorded: false, reason: "fence_lost" });

      // Attempt a genuine completion with the correct fence
      const genRes = await mtRepo.recordPushDeliveryOutcome({
        outboxId: staleId,
        fenceToken: claimRes!.fenceToken,
        passengerSubjectRef: "sub",
        providerName: "test-provider",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "msg-123",
        deliveryOutcome: {
          outboxId: staleId,
          status: "delivered",
          result: "delivered",
          attemptCount: 1,
          nextAttemptAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
          providerName: "test-provider",
        },
        partnerMetadata: {
          deliveryTarget: "partner_endpoint",
          deliveryStage: "partner_accepted",
          retryDisposition: "terminal",
          failureReason: null,
          receiptId: "receipt-123",
          downstreamStatus: "unknown",
          expiresAt: new Date().toISOString(),
        },
      });
      expect(genRes).toEqual({ recorded: true, replayed: false });

      // Verify actual receipt insertion
      const receipt = await pool.query(
        "SELECT * FROM ops.phase1_push_delivery_receipts WHERE outbox_id = $1",
        [staleId],
      );
      expect(receipt.rows.length).toBe(1);
      expect(receipt.rows[0].receipt_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(receipt.rows[0].provider_message_ref).toBe("msg-123");

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

      const { outboxId: superId, orderId: superOrderId } = await createFixture({
        status: "failed",
      });
      // Bump assignment version to exercise authoritative reassignment
      await pool.query(
        "INSERT INTO ops.passenger_dispatch_disclosure_snapshots (snapshot_id, order_id, dispatch_job_id, assignment_id, assignment_version, record, created_at) VALUES ($1, $2, $3, $4, 2, '{}', now())",
        [
          `snap-${superOrderId}`,
          superOrderId,
          `job-${superOrderId}`,
          `assn-${superOrderId}`,
        ],
      );
      const resSuper = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        superId,
      );
      expect(resSuper.kind).toBe("failed");
      if (resSuper.kind === "failed") {
        expect((resSuper as any).failure.failureReason).toBe(
          "notification_superseded",
        );
      }

      // 5. Cross-tenant authority rejection
      const resCrossTenant = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId: "tenant-wrong", partnerId },
        legalId,
      );
      expect(resCrossTenant.kind).toBe("failed");

      // 6. Duplicate retry / schedule preservation check
      const { outboxId: pendingId } = await createFixture({
        status: "pending",
      });
      const pendingBefore = await pool.query(
        "SELECT attempt_count, next_attempt_at FROM ops.consumer_notification_outbox WHERE outbox_id = $1",
        [pendingId],
      );

      const resDup = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        pendingId,
      );
      expect(resDup.kind).toBe("requeued");

      const pendingAfter = await pool.query(
        "SELECT attempt_count, next_attempt_at FROM ops.consumer_notification_outbox WHERE outbox_id = $1",
        [pendingId],
      );
      expect(pendingAfter.rows[0].attempt_count).toBe(
        pendingBefore.rows[0].attempt_count,
      );
      expect(pendingAfter.rows[0].next_attempt_at.getTime()).toBe(
        pendingBefore.rows[0].next_attempt_at.getTime(),
      );

      // 8. Exhausted budget
      const { outboxId: budgetId } = await createFixture({
        attemptCount: 3,
      });
      const resBudget = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        budgetId,
      );
      expect(resBudget.kind).toBe("failed");

      // 9. Genuine receipt preservation under refused repeat retry
      const { outboxId: genReceiptId } = await createFixture({
        lease: "expired",
        status: "pending",
        retryDisp: "automatic",
      });
      const genReceiptClaim = await mtRepo.claimPartnerNotification(
        genReceiptId,
        "worker-gen",
        60,
      );
      const genuineRes = await mtRepo.recordPushDeliveryOutcome({
        outboxId: genReceiptId,
        fenceToken: genReceiptClaim!.fenceToken,
        passengerSubjectRef: "sub",
        providerName: "test-provider",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "msg-genuine",
        deliveryOutcome: {
          outboxId: genReceiptId,
          status: "delivered",
          result: "delivered",
          attemptCount: 1,
          nextAttemptAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
          providerName: "test-provider",
        },
        partnerMetadata: {
          deliveryTarget: "partner_endpoint",
          deliveryStage: "partner_accepted",
          retryDisposition: "terminal",
          failureReason: null,
          receiptId: "receipt-genuine",
          downstreamStatus: "unknown",
          expiresAt: new Date().toISOString(),
        },
      });
      expect(genuineRes.recorded).toBe(true);

      const resGenRetry = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        genReceiptId,
      );
      expect(resGenRetry.kind).toBe("failed");

      const genuineReceiptCheck = await pool.query(
        "SELECT * FROM ops.phase1_push_delivery_receipts WHERE outbox_id = $1",
        [genReceiptId],
      );
      expect(genuineReceiptCheck.rows.length).toBe(1);
      expect(genuineReceiptCheck.rows[0].provider_message_ref).toBe(
        "msg-genuine",
      );
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
      expect(list1.rows[0]!.deliveryId).toBeDefined();
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
      expect(list1.rows[0]!.wirePayloadHash).toBe(expectedHash);
      expect(Number(list1.rows[0]!.eventSequence)).toBe(42);
      expect(list1.rows[0]!.receiptId).toBe("rcpt-123");

      const list2 = await mtRepo.listPartnerNotificationDeliveries(
        { entrySlug: entrySlug2, tenantId, partnerId },
        { pageSize: 50 },
      );
      expect(list2.rows.length).toBe(1);
      expect(list2.rows[0]!.receiptId).toBe("rcpt-456");

      // Retry to test invariance
      const retryResult = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId, partnerId },
        list1.rows[0]!.outboxId,
      );
      expect(retryResult.kind).toBe("requeued");

      const listAfter = await mtRepo.listPartnerNotificationDeliveries(
        { entrySlug: entrySlug1, tenantId, partnerId },
        { pageSize: 50 },
      );
      expect(listAfter.rows[0]!.deliveryId).toBe(list1.rows[0]!.deliveryId);
      expect(listAfter.rows[0]!.wirePayload).toEqual(
        list1.rows[0]!.wirePayload,
      );
      expect(listAfter.rows[0]!.wirePayloadHash).toBe(expectedHash);
      expect(Number(listAfter.rows[0]!.eventSequence)).toBe(42);
      expect(listAfter.rows[0]!.receiptId).toBe("rcpt-123");
    });

    it("tests list API pagination boundary", async () => {
      // Test pagination boundary with actual data
      await createFixture({ entrySlug: entrySlug1 });
      await createFixture({ entrySlug: entrySlug1 });
      await createFixture({ entrySlug: entrySlug1 });

      const listP = await mtRepo.listPartnerNotificationDeliveries(
        { entrySlug: entrySlug1, tenantId, partnerId },
        { page: 2, pageSize: 1 },
      );
      expect(listP.rows.length).toBe(1);
    });

    it("tests missing-binding -> configure/test/enable -> retry of SAME contextless outbox -> original worker eligibility", async () => {
      const orderId = randomUUID();
      const outboxId = randomUUID();
      createdOrderIds.push(orderId);
      createdOutboxIds.push(outboxId);

      const missingBindingSlug = entrySlug3;

      await pool.query(
        "INSERT INTO ops.phase1_owned_orders (order_id, order_no, status, order_source, service_bucket, dispatch_semantics, created_at, updated_at, record) VALUES ($1, $1, 'created', 'app', 'multi_taxi', 'immediate', now(), now(), $2::jsonb)",
        [orderId, JSON.stringify({ tenantId, partnerId, origin: "system" })],
      );

      await pool.query(
        "INSERT INTO mobility.phase1_order_partner_notification_routes (order_id, ride_ref, entry_slug, tenant_id, partner_id, partner_user_ref, drts_passenger_id, passenger_subject_ref, identity_linked_at, consent_bundle_version, created_at) VALUES ($1, $1, $2, $3, $4, 'user', 'passenger', 'sub', now(), 1, now())",
        [orderId, missingBindingSlug, tenantId, partnerId],
      );

      await pool.query(
        "INSERT INTO ops.consumer_notification_outbox (outbox_id, order_id, passenger_subject_ref, event_type, payload, status, attempt_count, next_attempt_at, created_at, assignment_version) VALUES ($1, $2, 'sub', 'eta_changed', '{\"eventSequence\": 42}', 'failed', 1, now() - interval '1 hour', now(), 1)",
        [outboxId, orderId],
      );

      await pool.query(
        'INSERT INTO admin.phase1_partner_user_identity_links (entry_slug, partner_user_ref, drts_passenger_id, status, consent_scope, linked_at, last_seen_at, created_at, updated_at, record) VALUES ($1, \'user\', \'passenger\', \'active\', \'["all"]\'::jsonb, now(), now(), now(), now(), \'{"status":"active","drtsPassengerId":"passenger","partnerUserRef":"user"}\') ON CONFLICT DO NOTHING',
        [missingBindingSlug],
      );

      const prepBefore = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: missingBindingSlug, tenantId, partnerId },
        outboxId,
      );
      expect(prepBefore.kind).toBe("failed");
      expect((prepBefore as any).failure?.failureReason).toBe("configuration_blocked");

      const { PartnerEntryNotificationBindingService } = await import("../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.service");
      const { PartnerNotificationDispatchFacade } = await import("../../../../apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade");
      const { PartnerNotificationTransport } = await import("../../../../apps/api/src/modules/multi-taxi/partner-notification.transport");
      const bindingService = app.get(PartnerEntryNotificationBindingService);
      const dispatchFacade = app.get(PartnerNotificationDispatchFacade);

      await bindingService.putBinding(missingBindingSlug, { webhookId, eventTypes: ["eta_changed"], expectedVersion: 0 });
      await bindingService.testBinding(missingBindingSlug, { tenantId, partnerId, actingUser: "system" } as any);
      await bindingService.enableBinding(missingBindingSlug, 1);

      const res = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: missingBindingSlug, tenantId, partnerId },
        outboxId,
      );
      expect(res.kind).toBe("requeued");

      const claim = await mtRepo.claimPartnerNotification(outboxId, "worker-1", 60);
      expect(claim).toBeDefined();

      const dispatchSpy = vi.spyOn(dispatchFacade, "dispatchNotificationAttemptByWebhookId").mockImplementation(async (command: any) => ({
        kind: "accepted",
        ack: {
          notificationId: command.wirePayload.notificationId,
          deliveryId: command.wirePayload.deliveryId,
          partnerEntrySlug: missingBindingSlug,
          status: "accepted",
          receiptId: "ack-typed",
        } as any,
      }));

      try {
        const transport = new PartnerNotificationTransport(mtRepo, dispatchFacade);
        const receipt = await transport.send({
          providerName: "partner_webhook",
          message: claim!.record as any,
          context: { fenceToken: claim!.fenceToken }
        });
        
        expect(dispatchSpy).toHaveBeenCalled();
        const callCommand: any = dispatchSpy.mock.calls?.[0]?.[0] || {};
        expect(callCommand.wirePayload?.eventSequence).toBe(42);
        
        await mtRepo.recordPushDeliveryOutcome({
          outboxId,
          fenceToken: claim!.fenceToken,
          passengerSubjectRef: "sub",
          providerName: "partner_webhook",
          providerAckState: "provider_acknowledged",
          providerMessageRef: "msg-1",
          deliveryOutcome: {
            status: "delivered",
            result: "delivered",
            attemptCount: claim!.record.attemptCount,
            ...receipt!.deliveryContext!
          } as any,
          partnerMetadata: {} as any,
        });

        const { rows } = await pool.query("SELECT status, attempt_count FROM ops.consumer_notification_outbox WHERE outbox_id = $1", [outboxId]);
        expect(rows[0].status).toBe("delivered");
        expect(rows[0].attempt_count).toBe(2);
      } finally {
        dispatchSpy.mockRestore();
      }
    });

    it("tests missing/disabled/test_pending readiness", async () => {
      const orderId = randomUUID();
      const outboxId = randomUUID();
      createdOrderIds.push(orderId);
      createdOutboxIds.push(outboxId);

      await pool.query(
        "INSERT INTO ops.phase1_owned_orders (order_id, order_no, status, order_source, service_bucket, dispatch_semantics, created_at, updated_at, record) VALUES ($1, $1, 'created', 'app', 'multi_taxi', 'immediate', now(), now(), $2::jsonb)",
        [orderId, JSON.stringify({ tenantId, partnerId, origin: "system" })],
      );

      await pool.query(
        "INSERT INTO mobility.phase1_order_partner_notification_routes (order_id, ride_ref, entry_slug, tenant_id, partner_id, partner_user_ref, drts_passenger_id, passenger_subject_ref, identity_linked_at, consent_bundle_version, created_at) VALUES ($1, $1, $2, $3, $4, 'user', 'passenger', 'sub', now(), 1, now())",
        [orderId, entrySlug1, tenantId, partnerId],
      );

      await pool.query(
        "INSERT INTO ops.consumer_notification_outbox (outbox_id, order_id, passenger_subject_ref, event_type, payload, status, attempt_count, next_attempt_at, created_at, assignment_version) VALUES ($1, $2, 'sub', 'eta_changed', '{}', 'pending', 0, now() - interval '1 hour', now(), 1)",
        [outboxId, orderId],
      );

      await pool.query(
        "UPDATE admin.phase1_partner_notification_bindings SET state = 'disabled' WHERE binding_id = $1",
        [bindingId1],
      );
      const prepDisabled = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId, partnerId },
        outboxId,
      );
      expect(prepDisabled.kind).toBe("failed");

      await pool.query(
        "UPDATE admin.phase1_partner_notification_bindings SET state = 'test_pending' WHERE binding_id = $1",
        [bindingId1],
      );
      const prepTestPending = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId, partnerId },
        outboxId,
      );
      expect(prepTestPending.kind).toBe("failed");

      await pool.query(
        "UPDATE admin.phase1_partner_notification_bindings SET state = 'ready' WHERE binding_id = $1",
        [bindingId1],
      );
      const prepReady = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId, partnerId },
        outboxId,
      );
      expect(prepReady.kind).toBe("requeued");
    });

    it("tests cancellation versus independent receipt_ready", async () => {
      const { outboxId, orderId } = await createFixture({ status: "failed" });
      await pool.query(
        "UPDATE ops.phase1_owned_orders SET status = 'cancelled' WHERE order_id = $1",
        [orderId],
      );

      // First without receipt_ready
      const resNoReceiptReady = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId, partnerId },
        outboxId,
      );
      expect(resNoReceiptReady.kind).toBe("failed");

      // Update binding to have receipt_ready
      await pool.query(
        'UPDATE admin.phase1_partner_notification_bindings SET event_types = \'["eta_changed", "receipt_ready"]\' WHERE binding_id = $1',
        [bindingId1],
      );

      // Even with receipt_ready in binding, the immutable outbox event is 'eta_changed', which is obsolete
      const resReceiptReady = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId, partnerId },
        outboxId,
      );
      expect(resReceiptReady.kind).toBe("failed");
      expect((resReceiptReady as any).failure?.failureReason).toBe(
        "notification_obsolete",
      );

      // Add an independent valid receipt_ready fixture
      const { outboxId: outboxIdReceipt, orderId: orderIdReceipt } =
        await createFixture({
          status: "failed",
          entrySlug: entrySlug1,
          eventType: "receipt_ready",
        });
      await pool.query(
        "UPDATE ops.phase1_owned_orders SET status = 'cancelled' WHERE order_id = $1",
        [orderIdReceipt],
      );

      // This should be allowed to retry because the event itself is receipt_ready
      const resActualReceiptReady =
        await mtRepo.retryPartnerNotificationDelivery(
          { entrySlug: entrySlug1, tenantId, partnerId },
          outboxIdReceipt,
        );
      expect(resActualReceiptReady.kind).toBe("requeued");

      // Revert binding
      await pool.query(
        "UPDATE admin.phase1_partner_notification_bindings SET event_types = '[\"eta_changed\"]' WHERE binding_id = $1",
        [bindingId1],
      );
    });

    it("tests historical context/route ownership changes", async () => {
      const { outboxId, orderId } = await createFixture({ status: "failed" });

      await pool.query(
        "UPDATE mobility.phase1_order_partner_notification_routes SET entry_slug = $1 WHERE order_id = $2",
        [entrySlug2, orderId],
      );

      const oldRes = await mtRepo.listPartnerNotificationDeliveries(
        { entrySlug: entrySlug1, tenantId, partnerId },
        { pageSize: 50 },
      );
      expect(oldRes.rows).toHaveLength(1);
      expect(
        oldRes.rows.find((i: any) => i.outboxId === outboxId),
      ).toBeDefined();

      const newRes = await mtRepo.listPartnerNotificationDeliveries(
        { entrySlug: entrySlug2, tenantId, partnerId },
        { pageSize: 50 },
      );
      expect(oldRes.total).toBe(1);
      expect(
        newRes.rows.find((i: any) => i.outboxId === outboxId),
      ).toBeUndefined();

      const res = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug1, tenantId, partnerId },
        outboxId,
      );
      expect(res.kind).toBe("failed");
      expect((res as any).failure?.failureReason).toBe("owner_changed");

      const res2 = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug: entrySlug2, tenantId, partnerId },
        outboxId,
      );
      expect(res2.kind).toBe("failed");
      expect((res2 as any).failure?.failureReason).toBe("route_missing");
      
      const { rows: postRows } = await pool.query(
        "SELECT status, attempt_count FROM ops.consumer_notification_outbox WHERE outbox_id = $1",
        [outboxId],
      );
      expect(postRows[0].status).toBe("failed");
      expect(postRows[0].attempt_count).toBe(1); // from createFixture
    });
  },
);
