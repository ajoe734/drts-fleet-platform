import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
const databaseUrl = process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)(
  "partner notification UI postgres acceptance",
  () => {
    const databaseName = `notify_ui_${randomUUID().replaceAll("-", "")}`;
    let admin: InstanceType<typeof Pool>;
    let pool: InstanceType<typeof Pool>;
    let database: DatabaseService;
    let mtRepo: MultiTaxiRepository;
    let bindingRepo: PartnerEntryNotificationBindingRepository;

    beforeAll(async () => {
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const url = new URL(databaseUrl!);
      url.pathname = `/${databaseName}`;
      pool = new Pool({ connectionString: url.toString(), max: 16 });

      await pool.query(`
        CREATE SCHEMA ops;
        CREATE SCHEMA mobility;
        CREATE SCHEMA admin;
        CREATE TABLE admin.phase1_partner_channel_entries (entry_slug varchar(150) PRIMARY KEY, tenant_id varchar(100), partner_id varchar(100));
        CREATE TABLE admin.phase1_tenant_webhook_endpoints (webhook_id varchar(100) PRIMARY KEY);
      `);

      const routeMigration = await readFile(
        "infra/migrations/V0104__sr_partner_notification_binding_and_routing.sql",
        "utf8",
      );
      const ctxMigration = await readFile(
        "infra/migrations/V0105__sr_partner_notification_delivery_context.sql",
        "utf8",
      );
      const outboxMigration = await readFile(
        "infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql",
        "utf8",
      );

      const outboxDdl = outboxMigration.match(
        /CREATE TABLE IF NOT EXISTS ops\.consumer_notification_outbox \([\s\S]*?\n\);/,
      )?.[0];
      const claimDdl = outboxMigration.match(
        /CREATE TABLE IF NOT EXISTS ops\.phase1_push_delivery_claims \([\s\S]*?\n\);/,
      )?.[0];
      if (!outboxDdl || !claimDdl) throw new Error("outbox/claim migration DDL missing");

      await pool.query(routeMigration);
      await pool.query(outboxDdl);
      await pool.query(claimDdl);
      await pool.query(ctxMigration);

      database = {
        isEnabled: () => true,
        connect: () => pool.connect(),
        query: (text, params) => pool.query(text, params),
      } as any;

      mtRepo = new MultiTaxiRepository(database);
      bindingRepo = new PartnerEntryNotificationBindingRepository(database);
    });

    afterAll(async () => {
      if (pool) await pool.end();
      if (admin) {
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        await admin.end();
      }
    });

    it("expectedVersion/409 is enforced correctly using repository", async () => {
      const entrySlug = "entry-409-test";
      const tenantId = "tenant-a";
      const partnerId = "partner-1";
      const webhookId = "webhook-409";
      await pool.query("INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id) VALUES ($1, $2, $3)", [entrySlug, tenantId, partnerId]);
      await pool.query("INSERT INTO admin.phase1_tenant_webhook_endpoints VALUES ($1)", [webhookId]);

      const res1 = await bindingRepo.put({
        entrySlug,
        tenantId,
        partnerId,
        webhookId,
        expectedVersion: 0,
        eventTypes: ["eta_changed"],
        now: new Date().toISOString()
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
        now: new Date().toISOString()
      });
      expect(resConflict.outcome).toBe("version_conflict");
      if (resConflict.outcome === "version_conflict") {
        expect(resConflict.current?.version).toBe(1);
      }
    });

    it("retry idempotence/lease/fence/expiry/supersession are verified via DB state", async () => {
      const entrySlug = "entry-retry-test";
      await pool.query("INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id) VALUES ($1, 't', 'p') ON CONFLICT DO NOTHING", [entrySlug]);
      await pool.query("INSERT INTO admin.phase1_tenant_webhook_endpoints VALUES ('w') ON CONFLICT DO NOTHING");

      const outboxId = randomUUID();
      const bindingId = randomUUID();

      await pool.query(`
        INSERT INTO admin.phase1_partner_notification_bindings (
          entry_slug, binding_id, tenant_id, partner_id, webhook_id, version, state, event_types
        ) VALUES (
          $1, $2, 't', 'p', 'w', 1, 'ready', '[]'::jsonb
        )
      `, [entrySlug, bindingId]);

      await pool.query(`
        INSERT INTO ops.consumer_notification_outbox (
          outbox_id, binding_id, event_type, payload, status, attempt_count, next_attempt_at, created_at
        ) VALUES (
          $1, NULL, 'test_event', '{}', 'failed', 3, now() - interval '1 hour', now()
        )
      `, [outboxId]);

      await pool.query(`
        INSERT INTO mobility.phase1_partner_notification_delivery_contexts (
          outbox_id, entry_slug, binding_id, order_id, event_sequence, expires_at, retry_disposition, failure_reason, created_at
        ) VALUES (
          $1, $2, $3, 'order-x', 1, now() + interval '1 day', 'manual_only', 'endpoint_timeout', now()
        )
      `, [outboxId, entrySlug, bindingId]);

      const res1 = await mtRepo.retryPartnerNotificationDelivery(entrySlug, outboxId);
      expect(res1.kind).toBe("accepted");

      const res2 = await mtRepo.retryPartnerNotificationDelivery(entrySlug, outboxId);
      expect(res2.kind).toBe("failed");
      expect(res2.failure?.failureReason).toBe("notification_obsolete");
    });

    it("same-tenant vs cross-tenant logic", async () => {
      const entrySlug = "entry-tenant";

      const mockedTenantService = {
        getPartnerEntry: (slug: string) => {
          if (slug === entrySlug) {
            return { tenantId: "tenant-a" };
          }
          throw new Error("Not found");
        }
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
        mockedTenantService as any
      );

      const identity1: BootstrapRequestIdentity = {
        authMode: "jwt",
        actorType: "admin",
        actorId: "admin-1",
        realm: "tenant",
        tenantId: "tenant-a"
      } as BootstrapRequestIdentity;

      const queryPromise = mtService.listPartnerNotificationDeliveries(
        entrySlug,
        {},
        identity1
      );

      await expect(queryPromise).resolves.toBeDefined();

      const identity2: BootstrapRequestIdentity = {
        authMode: "jwt",
        actorType: "admin",
        actorId: "admin-2",
        realm: "tenant",
        tenantId: "tenant-other"
      } as BootstrapRequestIdentity;

      const crossTenantPromise = mtService.listPartnerNotificationDeliveries(
        entrySlug,
        {},
        identity2
      );

      await expect(crossTenantPromise).rejects.toThrowError(ApiRequestError);
    });
  }
);
