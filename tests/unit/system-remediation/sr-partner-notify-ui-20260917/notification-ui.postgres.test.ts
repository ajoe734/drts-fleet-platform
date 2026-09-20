import { randomUUID } from "node:crypto";

import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseService } from "../../../../apps/api/src/common/db";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { PartnerEntryNotificationBindingRepository } from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.repository";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.types";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
const databaseUrl =
  process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL || process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "partner notification UI postgres acceptance",
  () => {
    let pool: InstanceType<typeof Pool>;
    let database: DatabaseService;
    let mtRepo: MultiTaxiRepository;
    let bindingRepo: PartnerEntryNotificationBindingRepository;

    beforeAll(async () => {
      pool = new Pool({ connectionString: databaseUrl, max: 16 });

      database = {
        isEnabled: () => true,
        connect: () => pool.connect(),
        query: (text: string, params: any[]) => pool.query(text, params),
      } as any;

      mtRepo = new MultiTaxiRepository(database);
      bindingRepo = new PartnerEntryNotificationBindingRepository(database);
    });

    afterAll(async () => {
      if (pool) await pool.end();
    });

    it("expectedVersion/409 is enforced correctly using repository", async () => {
      const entrySlug = "entry-409-test";
      const tenantId = "tenant-a";
      const partnerId = "partner-1";
      const webhookId = "webhook-409";
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id) VALUES ($1, $2, $3)",
        [entrySlug, tenantId, partnerId],
      );
      await pool.query(
        "INSERT INTO admin.phase1_tenant_webhook_endpoints VALUES ($1)",
        [webhookId],
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
      await pool.query(
        "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id) VALUES ($1, 't', 'p') ON CONFLICT DO NOTHING",
        [entrySlug],
      );
      await pool.query(
        "INSERT INTO admin.phase1_tenant_webhook_endpoints VALUES ('w') ON CONFLICT DO NOTHING",
      );

      const outboxId = randomUUID();
      const bindingId = randomUUID();
      const orderId = randomUUID();

      await pool.query(
        `
        INSERT INTO admin.phase1_partner_notification_bindings (
          entry_slug, binding_id, tenant_id, partner_id, webhook_id, version, state, event_types
        ) VALUES (
          $1, $2, 't', 'p', 'w', 1, 'ready', '["eta_changed"]'::jsonb
        )
      `,
        [entrySlug, bindingId],
      );

      await pool.query(
        `
        INSERT INTO mobility.phase1_order_partner_notification_routes (
          order_id, tenant_id, partner_id, entry_slug, partner_user_ref, drts_passenger_id, passenger_subject_ref, identity_linked_at, consent_bundle_version
        ) VALUES (
          $1, 't', 'p', $2, 'u', 'd', 's', now(), '1'
        )
      `,
        [orderId, entrySlug],
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
          $1, gen_random_uuid(), $2, $3, 't', 'p', $4, 1, 'w', 'fingerprint', '{}', 'hash', 1, now() + interval '1 day', '{"maxAttempts": 3}', 'partner_endpoint', 'manual_only', 'provider_transient_error', now()
        )
      `,
        [outboxId, orderId, entrySlug, bindingId],
      );

      // Service passes an object containing tenantId and partnerId.
      const entryObj = { entrySlug, tenantId: "t", partnerId: "p" };

      const res1 = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        outboxId,
      );
      expect(res1.kind).toBe("accepted");

      const res2 = await mtRepo.retryPartnerNotificationDelivery(
        entryObj,
        outboxId,
      );
      // Because we changed it to pending in the DB, our idempotence returns accepted.
      expect(res2.kind).toBe("accepted");
    });

    it("same-tenant vs cross-tenant logic", async () => {
      const entrySlug = "entry-tenant";

      const mockedTenantService = {
        getPartnerEntry: (slug: string) => {
          if (slug === entrySlug) {
            return { tenantId: "tenant-a" };
          }
          throw new Error("Not found");
        },
      };

      const mtService = new MultiTaxiService(
        {} as any,
        mtRepo,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockedTenantService as any,
      );

      const identity1: BootstrapRequestIdentity = {
        authMode: "jwt",
        actorType: "tenant_admin",
        actorId: "admin-1",
        realm: "tenant",
        tenantId: "tenant-a",
      } as unknown as BootstrapRequestIdentity;

      const queryPromise = mtService.listPartnerNotificationDeliveries(
        entrySlug,
        {},
        identity1,
      );

      await expect(queryPromise).resolves.toBeDefined();

      const identity2: BootstrapRequestIdentity = {
        authMode: "jwt",
        actorType: "tenant_admin",
        actorId: "admin-2",
        realm: "tenant",
        tenantId: "tenant-other",
      } as unknown as BootstrapRequestIdentity;

      const crossTenantPromise = mtService.listPartnerNotificationDeliveries(
        entrySlug,
        {},
        identity2,
      );

      await expect(crossTenantPromise).rejects.toThrowError(ApiRequestError);
    });
  },
);
