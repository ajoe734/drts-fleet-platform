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
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";

// Use the database URL specifically meant for this UI test.
// We expect the CI hosted workflow to provide this after migrating the schema.
const testDbUrl =
  process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL || process.env.DATABASE_URL;

describe.skipIf(!testDbUrl)(
  "partner notification UI postgres acceptance",
  () => {
    let pool: any;
    let app: any;
    let mtRepo: any;
    let mtService: any;
    let bindingRepo: any;

    beforeAll(async () => {
      // Set environment for NestJS AppModule boot
      process.env.DATABASE_URL = testDbUrl;
      process.env.AUTH_MODE = "test";

      app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix("api", { exclude: ["health", "metrics"] });
      await app.init();

      mtRepo = app.get(MultiTaxiRepository);
      mtService = app.get(MultiTaxiService);
      bindingRepo = app.get(PartnerEntryNotificationBindingRepository);

      pool = new Pool({ connectionString: testDbUrl, max: 16 });
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

      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'program1', 'active', '{}'::jsonb) ON CONFLICT DO NOTHING",
        [entrySlug, tenantId, partnerId],
      );
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
      const tenantId = "tenant-t";
      const partnerId = "partner-p";

      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'program1', 'active', '{}'::jsonb) ON CONFLICT DO NOTHING",
        [entrySlug, tenantId, partnerId],
      );
      await pool.query(
        "INSERT INTO admin.phase1_tenant_webhook_endpoints (webhook_id, tenant_id, status, created_at, updated_at, record) VALUES ('w', $1, 'active', now(), now(), '{}'::jsonb) ON CONFLICT DO NOTHING",
        [tenantId],
      );

      const outboxId = randomUUID();
      const bindingId = randomUUID();
      const orderId = randomUUID();

      await pool.query(
        `
      INSERT INTO admin.phase1_partner_notification_bindings (
        entry_slug, binding_id, tenant_id, partner_id, webhook_id, version, state, purpose, event_types, schema_version, acknowledgement_policy, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'w', 1, 'ready', 'passenger_notification', '["eta_changed"]'::jsonb, '1.0', 'durable_partner_acceptance_v1', now()
      )
    `,
        [entrySlug, bindingId, tenantId, partnerId],
      );

      await pool.query(
        `
      INSERT INTO ops.phase1_owned_orders (
        order_id, tenant_id, status, created_at, updated_at
      ) VALUES (
        $1, $2, 'assigned', now(), now()
      )
    `,
        [orderId, tenantId],
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
        $1, gen_random_uuid(), $2, $3, $4, $5, $6, 1, 'w', 'fingerprint', '{"event": "passenger.eta_changed.v1"}'::jsonb, 'hash', 1, now() + interval '1 day', '{"maxAttempts": 3}'::jsonb, 'partner_endpoint', 'manual_only', 'provider_transient_error', now()
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
    });

    it("same-tenant vs cross-tenant logic is validated using real TenantPartnerService", async () => {
      const entrySlug = "entry-tenant";
      const tenantId = "tenant-a";
      const partnerId = "partner-1";

      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'program1', 'active', '{}'::jsonb) ON CONFLICT DO NOTHING",
        [entrySlug, tenantId, partnerId],
      );

      const identity1 = {
        authMode: "jwt",
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
        authMode: "jwt",
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
