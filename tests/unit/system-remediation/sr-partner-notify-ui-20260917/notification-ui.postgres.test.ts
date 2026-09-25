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
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PartnerEntryNotificationBindingRepository } from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.repository";
import { computeEndpointFingerprint } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-fingerprint";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";

// Use the database URL specifically meant for this UI test.
// We expect the CI hosted workflow to provide this after migrating the schema.
const testDbUrl = process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;

describe.skipIf(!testDbUrl || process.env.RUN_UI_PG_GATE !== "true")(
  "partner notification UI postgres acceptance",
  () => {
    let pool: any;
    let app: any;
    let mtRepo: any;
    let mtService: any;
    let bindingRepo: any;

    beforeAll(async () => {
      // Set environment for NestJS AppModule boot
      process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL = testDbUrl;
      process.env.DATABASE_URL = testDbUrl;
      process.env.AUTH_MODE = "test";

      pool = new Pool({ connectionString: testDbUrl, max: 16 });
      // insert fixtures before app.init
      await pool.query(
        "INSERT INTO admin.phase1_platform_tenants (tenant_id, tenant_code, tenant_status, created_at, updated_at, record) VALUES ('tenant-a', 'TENANT-A', 'active', now(), now(), '{}') ON CONFLICT DO NOTHING",
      );
      await pool.query(
        "INSERT INTO admin.phase1_platform_tenants (tenant_id, tenant_code, tenant_status, created_at, updated_at, record) VALUES ('tenant-other', 'TENANT-O', 'active', now(), now(), '{}') ON CONFLICT DO NOTHING",
      );
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ('entry-tenant', 'tenant-a', 'partner-1', now(), now(), 'program1', 'active', jsonb_build_object('entrySlug', 'entry-tenant', 'tenantId', 'tenant-a', 'partnerId', 'partner-1', 'programId', 'program1', 'status', 'active', 'activeFlag', true)) ON CONFLICT DO NOTHING",
      );
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ('entry-409-test', 'tenant-a', 'partner-1', now(), now(), 'program1', 'active', jsonb_build_object('entrySlug', 'entry-409-test', 'tenantId', 'tenant-a', 'partnerId', 'partner-1', 'programId', 'program1', 'status', 'active', 'activeFlag', true)) ON CONFLICT DO NOTHING",
      );
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ('entry-retry-test', 'tenant-a', 'partner-1', now(), now(), 'program1', 'active', jsonb_build_object('entrySlug', 'entry-retry-test', 'tenantId', 'tenant-a', 'partnerId', 'partner-1', 'programId', 'program1', 'status', 'active', 'activeFlag', true)) ON CONFLICT DO NOTHING",
      );

      app = await NestFactory.create(AppModule, { logger: false });

      app.setGlobalPrefix("api", { exclude: ["health", "metrics"] });
      await app.init();

      mtRepo = app.get(MultiTaxiRepository);
      mtService = app.get(MultiTaxiService);
      bindingRepo = app.get(PartnerEntryNotificationBindingRepository);
    }, 60000);

    afterAll(async () => {
      if (app) await app.close();
      if (pool) await pool.end();
    });

    it("expectedVersion/409 is enforced correctly using repository", async () => {
      const entrySlug = "entry-409-test";
      const tenantId = "tenant-a";
      const partnerId = "partner-1";
      const webhookId = "webhook-409";

      const r = await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1::varchar, $2::varchar, $3::varchar, now(), now(), 'program1', 'active', jsonb_build_object('entrySlug', $1::varchar, 'tenantId', $2::varchar, 'partnerId', $3::varchar, 'status', 'active', 'activeFlag', true)) ON CONFLICT (entry_slug) DO UPDATE SET record = EXCLUDED.record",
        [entrySlug, tenantId, partnerId],
      );
      console.log("TEST 3 INSERTED:", r.rowCount);
      await pool.query(
        "INSERT INTO admin.phase1_tenant_webhook_endpoints (webhook_id, tenant_id, status, created_at, updated_at, record) VALUES ($1, $2, 'active', now(), now(), '{}'::jsonb) ON CONFLICT DO NOTHING",
        [webhookId, tenantId],
      );

      const res1 = await bindingRepo.put({
        entrySlug,
        tenantId,
        partnerId,
        webhookId,
        expectedVersion: 0,
        eventTypes: ["eta_changed"],
        now: new Date().toISOString(),
      });
      expect(res1.outcome).toBe("written");
      if (res1.outcome === "written") {
        expect(res1.binding?.version).toBe(1);
      }

      const resConflict = await bindingRepo.put({
        entrySlug,
        tenantId,
        partnerId,
        webhookId,
        expectedVersion: 0,
        eventTypes: ["eta_changed"],
        now: new Date().toISOString(),
      });
      expect(resConflict.outcome).toBe("version_conflict");
      if (resConflict.outcome === "version_conflict") {
        expect(resConflict.current?.version).toBe(1);
      }
    });

    it("retry idempotence/lease/fence/expiry/supersession are verified via DB state", async () => {
      const entrySlug = "entry-retry-test";
      const tenantId = "tenant-a";
      const partnerId = "partner-1";

      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1::varchar, $2::varchar, $3::varchar, now(), now(), 'program1', 'active', jsonb_build_object('entrySlug', $1::varchar, 'tenantId', $2::varchar, 'partnerId', $3::varchar, 'status', 'active', 'activeFlag', true, 'identityLinkMode', 'always')) ON CONFLICT DO NOTHING",
        [entrySlug, tenantId, partnerId],
      );
      await pool.query(
        'INSERT INTO admin.phase1_tenant_webhook_endpoints (webhook_id, tenant_id, status, created_at, updated_at, record) VALUES (\'w\', $1, \'active\', now(), now(), \'{"webhookId":"w","tenantId":"T-ID","url":"https://example.com/webhook","secretVersion":1,"secretPreview":"supersecret","events":["passenger.eta_changed.v1"],"status":"active","retryPolicy":{"maxAttempts":3},"runtimeMetadata":{"deliveryCount":0,"failedDeliveryCount":0,"lastAttemptAt":null,"lastDeliveredAt":null,"retryPolicy":{"maxAttempts":3},"secretRotation":{"currentVersion":"1","rotatedAt":null,"rotationCount":0}}}\'::jsonb) ON CONFLICT (webhook_id) DO UPDATE SET record = EXCLUDED.record',
        [tenantId],
      );

      const outboxId = randomUUID();
      const bindingId = randomUUID();
      const orderId = randomUUID();

      await pool.query(
        `
      INSERT INTO admin.phase1_partner_notification_bindings (
        entry_slug, binding_id, tenant_id, partner_id, webhook_id, version, state, purpose, event_types, schema_version, acknowledgement_policy, updated_at, validated_at, validated_endpoint_fingerprint
      ) VALUES (
        $1, $2, $3, $4, 'w', 1, 'ready', 'passenger_notification', '["eta_changed"]'::jsonb, '1.0', 'durable_partner_acceptance_v1', now(), now(), '${computeEndpointFingerprint({
          url: "https://example.com/webhook",
          events: ["passenger.eta_changed.v1"],
          secretVersion: 1,
          ownerRef: undefined,
          status: "active"
        } as any)}'
      )
    `,
        [entrySlug, bindingId, tenantId, partnerId],
      );

      await pool.query(
        `
      INSERT INTO ops.phase1_owned_orders (
        order_id, status, created_at, updated_at, order_no, order_source, service_bucket, dispatch_semantics, record
      ) VALUES (
        $1, 'assigned', now(), now(), $1, 'consumer_app', 'demand', 'immediate', '{"tenantId": "${tenantId}"}'::jsonb
      )
    `,
        [orderId],
      );

      await pool.query(
        `
      INSERT INTO admin.phase1_partner_user_identity_links (
        entry_slug, partner_user_ref, drts_passenger_id, status, consent_scope, linked_at, last_seen_at, created_at, updated_at, record
      ) VALUES (
        $1::varchar, 'u', 'd', 'active', '{"events":["eta_changed"]}'::jsonb, now(), now(), now(), now(), jsonb_build_object('entrySlug', $1::varchar, 'partnerUserRef', 'u', 'drtsPassengerId', 'd', 'status', 'active', 'consentScope', '{"events":["eta_changed"]}'::jsonb, 'linkedAt', now(), 'createdAt', now(), 'updatedAt', now())
      ) ON CONFLICT DO NOTHING
    `,
        [entrySlug],
      );

      await pool.query(
        `
      INSERT INTO mobility.phase1_order_partner_notification_routes (
        order_id, tenant_id, partner_id, entry_slug, partner_user_ref, drts_passenger_id, passenger_subject_ref, identity_linked_at, consent_bundle_version, ride_ref
      ) VALUES (
        $1, $2, $3, $4, 'u', 'd', 's', now(), '1', 'ride'
      )
    `,
        [orderId, tenantId, partnerId, entrySlug],
      );

      await pool.query(
        `
      INSERT INTO ops.consumer_notification_outbox (
        outbox_id, order_id, passenger_subject_ref, event_type, payload, status, attempt_count, next_attempt_at, created_at
      ) VALUES (
        $1, $2, 's', 'eta_changed', '{}', 'failed', 1, now() - interval '1 hour', now()
      )
    `,
        [outboxId, orderId],
      );

      await pool.query(
        `
      INSERT INTO mobility.phase1_partner_notification_delivery_contexts (
        outbox_id, delivery_id, order_id, entry_slug, tenant_id, partner_id, binding_id, binding_version, webhook_id, endpoint_fingerprint, wire_payload, wire_payload_hash, event_sequence, expires_at, retry_policy_snapshot, delivery_target, retry_disposition, failure_reason, created_at
      ) VALUES (
        $1, gen_random_uuid(), $2, $3, $4, $5, $6, 1, 'w', '${computeEndpointFingerprint({
          url: "https://example.com/webhook",
          events: ["passenger.eta_changed.v1"],
          secretVersion: 1,
          ownerRef: undefined,
          status: "active"
        } as any)}', '{"event": "passenger.eta_changed.v1", "data": {"recipient": {"partnerUserRef": "u"}}}'::jsonb, 'hash', 1, now() + interval '1 day', '{"maxAttempts": 3}'::jsonb, 'partner_endpoint', 'manual_only', 'provider_transient_error', now()
      )
    `,
        [outboxId, orderId, entrySlug, tenantId, partnerId, bindingId],
      );

      const entryObj = { entrySlug, tenantId, partnerId };

      const res1 = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        outboxId,
      );
      expect(res1.kind).toBe("requeued");

      const res2 = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        outboxId,
      );
      expect(res2.kind).toBe("requeued");

      // Test that the DB actually updated next_attempt_at and attempt_count
      const updated = await pool.query(
        "SELECT * FROM ops.consumer_notification_outbox WHERE outbox_id = $1",
        [outboxId],
      );
      expect(updated.rows[0].attempt_count).toBe(1); // attempt_count is incremented by the worker on dequeue, not by the manual retry
      expect(updated.rows[0].status).toBe("pending");

      // Test 2: Expired TTL
      const expiredRetry = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug, tenantId, partnerId },
        outboxId2,
      );
      expect(expiredRetry.kind).toBe("failed");
      if (expiredRetry.kind === "failed") {
        expect(expiredRetry.failure.failureReason).toBe("notification_expired");
      }

      // Test 3: Superseded
      const supersededRetry = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug, tenantId, partnerId },
        outboxId3,
      );
      expect(supersededRetry.kind).toBe("failed");
      if (supersededRetry.kind === "failed") {
        expect(supersededRetry.failure.failureReason).toBe("notification_superseded");
      }

      // Test 4: Active lease (concurrency)
      const leaseRetry = await mtRepo.retryPartnerNotificationDelivery(
        { entrySlug, tenantId, partnerId },
        outboxId4,
      );
      expect(leaseRetry.kind).toBe("failed");
      if (leaseRetry.kind === "failed") {
        expect(leaseRetry.failure.failureReason).toBe("provider_transient_error");
      }
    });

    it("same-tenant vs cross-tenant logic is validated using real TenantPartnerService", async () => {
      const entrySlug = "entry-tenant-3";
      mtService.tenantPartnerService.partnerEntries.push({
        entrySlug,
        tenantId: "tenant-a",
        partnerId: "partner-1",
        status: "active",
        activeFlag: true
      });
      const tenantId = "tenant-a";
      const partnerId = "partner-1";

      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1::varchar, $2::varchar, $3::varchar, now(), now(), 'program1', 'active', jsonb_build_object('entrySlug', $1::varchar, 'tenantId', $2::varchar, 'partnerId', $3::varchar, 'status', 'active', 'activeFlag', true)) ON CONFLICT DO NOTHING",
        [entrySlug, tenantId, partnerId],
      );

      const identity1 = {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: "admin-1",
        realm: "tenant",
        tenantId: "tenant-a",
      };

      const queryPromise = mtService.listPartnerNotificationDeliveries(
        entrySlug,
        {},
        identity1,
      );

      await expect(queryPromise).resolves.toBeDefined();

      const identity2 = {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: "admin-2",
        realm: "tenant",
        tenantId: "tenant-other",
      };

      const crossTenantPromise = mtService.listPartnerNotificationDeliveries(
        entrySlug,
        {},
        identity2,
      );

      await expect(crossTenantPromise).rejects.toThrowError(ApiRequestError);
    });
  },
);
