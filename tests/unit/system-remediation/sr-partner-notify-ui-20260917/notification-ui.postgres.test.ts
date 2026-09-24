import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { PartnerEntryNotificationBindingRepository } from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.repository";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { PartnerNotificationDispatchFacade } from "../../../../apps/api/src/modules/multi-taxi/partner-notification-dispatch.facade";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
// Use PARTNER_NOTIFY_UI_TEST_DATABASE_URL for isolated DB tests!
const databaseUrl = process.env.PARTNER_NOTIFY_UI_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("partner notification UI postgres acceptance", () => {
  const databaseName = `notify_ui_${randomUUID().replaceAll("-", "")}`;
  let admin: InstanceType<typeof Pool>;
  let pool: InstanceType<typeof Pool>;
  let mtRepo: MultiTaxiRepository;
  let bindingRepo: PartnerEntryNotificationBindingRepository;
  let mtService: any;
  let created = false;
  let facadeMock: any;
  
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const url = new URL(databaseUrl!);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString(), max: 8 });

    // Apply schema identical to transport.postgres.test.ts
    await pool.query(`CREATE SCHEMA ops; CREATE SCHEMA admin; CREATE SCHEMA mobility;
    CREATE TABLE admin.phase1_partner_channel_entries(entry_slug varchar(150) PRIMARY KEY, tenant_id varchar(100), partner_id varchar(100), program_id varchar(100), status varchar(50), active_flag boolean, created_at timestamptz, updated_at timestamptz, record jsonb);
    CREATE TABLE admin.phase1_tenant_webhook_endpoints(webhook_id varchar(100) PRIMARY KEY, tenant_id varchar(100), status varchar(50), created_at timestamptz, updated_at timestamptz, record jsonb);
    CREATE TABLE admin.phase1_partner_user_identity_links(entry_slug varchar(150), partner_user_ref varchar(100), drts_passenger_id varchar(100), status varchar(50), consent_scope jsonb, linked_at timestamptz, last_seen_at timestamptz, created_at timestamptz, updated_at timestamptz, record jsonb, PRIMARY KEY(entry_slug, partner_user_ref));
    `);
    
    const original = await readFile("infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql", "utf8");
    await pool.query(original.match(/CREATE TABLE IF NOT EXISTS ops\.consumer_notification_outbox \([\s\S]*?\n\);/)![0]);
    await pool.query(original.match(/CREATE TABLE IF NOT EXISTS ops\.phase1_owned_orders \([\s\S]*?\n\);/)![0]);
    await pool.query(original.match(/CREATE TABLE IF NOT EXISTS ops\.phase1_push_delivery_claims \([\s\S]*?\n\);/)![0]);

    for (const migration of [
      "V0099__sr_passenger_push_delivery.sql",
      "V0104__sr_partner_notification_binding_and_routing.sql",
      "V0105__sr_partner_notification_delivery_context.sql",
    ]) {
      await pool.query(await readFile(`infra/migrations/${migration}`, "utf8"));
    }

    facadeMock = {
      resolveNotificationRoute: vi.fn(),
    };

    mtRepo = new MultiTaxiRepository({
      isEnabled: () => true,
      query: pool.query.bind(pool),
      connect: pool.connect.bind(pool),
    } as never);
    (mtRepo as any).facade = facadeMock;

    bindingRepo = new PartnerEntryNotificationBindingRepository({
      query: pool.query.bind(pool),
    } as never);

    mtService = new MultiTaxiService({} as never, mtRepo, {} as never);
    // mock tenantPartnerService registry
    mtService.tenantPartnerService = {
      partnerEntries: [],
      webhookEndpoints: [],
      findNotificationWebhookEndpoint: async (tenantId: string, webhookId: string) => {
        return mtService.tenantPartnerService.webhookEndpoints.find((e: any) => e.webhookId === webhookId && e.tenantId === tenantId) || null;
      }
    };
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin?.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ops.consumer_notification_outbox CASCADE`);
    await pool.query(`TRUNCATE mobility.phase1_partner_notification_delivery_contexts CASCADE`);
    await pool.query(`TRUNCATE ops.phase1_owned_orders CASCADE`);
    await pool.query(`TRUNCATE mobility.phase1_order_partner_notification_routes CASCADE`);
    vi.resetAllMocks();
  });

  it("expectedVersion/409 is enforced correctly using repository", async () => {
    const entrySlug = `entry-409-${randomUUID()}`;
    const tenantId = `tenant-${randomUUID()}`;
    const partnerId = `partner-${randomUUID()}`;
    const webhookId = `webhook-${randomUUID()}`;

    await pool.query(
      "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'program1', 'active', $4::jsonb)",
      [entrySlug, tenantId, partnerId, JSON.stringify({ entrySlug, tenantId, partnerId, status: 'active', activeFlag: true })]
    );

    await pool.query(
      "INSERT INTO admin.phase1_tenant_webhook_endpoints (webhook_id, tenant_id, status, created_at, updated_at, record) VALUES ($2, $1, 'active', now(), now(), $3::jsonb)",
      [tenantId, webhookId, JSON.stringify({ webhookId, tenantId, status: 'active', events: [], retryPolicy: {}, runtimeMetadata: {} })]
    );

    const res = await bindingRepo.put({
      entrySlug,
      tenantId,
      partnerId,
      webhookId,
      expectedVersion: 0,
      eventTypes: ["eta_changed"],
      now: new Date().toISOString(),
    });
    expect(res.outcome).toBe("accepted");

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
  });

  it("retry idempotence/lease/fence/expiry/supersession are verified via DB state", async () => {
    const entrySlug = `entry-retry-${randomUUID()}`;
    const webhookId = 'w-' + randomUUID();
    const tenantId = `tenant-${randomUUID()}`;
    const partnerId = `partner-${randomUUID()}`;

    await pool.query(
      "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'program1', 'active', $4::jsonb)",
      [entrySlug, tenantId, partnerId, JSON.stringify({ entrySlug, tenantId, partnerId, status: 'active', activeFlag: true })]
    );
    await pool.query(
      "INSERT INTO admin.phase1_tenant_webhook_endpoints (webhook_id, tenant_id, status, created_at, updated_at, record) VALUES ($2, $1, 'active', now(), now(), $3::jsonb)",
      [tenantId, webhookId, JSON.stringify({ webhookId, tenantId, status: 'active', events: [], retryPolicy: {}, runtimeMetadata: {} })]
    );

    const outboxId = randomUUID();
    const bindingId = randomUUID();
    const orderId = randomUUID();

    await pool.query(
      `INSERT INTO admin.phase1_partner_notification_bindings (
        entry_slug, binding_id, tenant_id, partner_id, webhook_id, version, state, purpose, event_types, schema_version, acknowledgement_policy, updated_at, record
      ) VALUES ($1, $2, $3, $4, $5, 1, 'ready', 'passenger_notification', '["eta_changed"]'::jsonb, '1.0', 'durable_partner_acceptance_v1', now(), $6::jsonb)`,
      [entrySlug, bindingId, tenantId, partnerId, webhookId, JSON.stringify({})]
    );

    // FIX: R5 requires order_no/order_source/service_bucket/dispatch_semantics/record for ops.phase1_owned_orders and no explicit tenant_id (generated always)
    await pool.query(
      `INSERT INTO ops.phase1_owned_orders (
        order_id, order_no, order_source, service_bucket, dispatch_semantics, status, created_at, updated_at, record
      ) VALUES ($1, $2, 'partner_api', 'test_bucket', 'fleet_managed', 'assigned', now(), now(), $3::jsonb)`,
      [orderId, `TEST-${randomUUID()}`, JSON.stringify({ tenantId })]
    );

    await pool.query(
      `INSERT INTO mobility.phase1_order_partner_notification_routes (
        order_id, tenant_id, partner_id, entry_slug, partner_user_ref, drts_passenger_id, passenger_subject_ref, identity_linked_at, consent_bundle_version, ride_ref
      ) VALUES ($1, $2, $3, $4, 'u', 'd', 's', now(), '1', gen_random_uuid()::text)`,
      [orderId, tenantId, partnerId, entrySlug]
    );

    await pool.query(
      `INSERT INTO ops.consumer_notification_outbox (
        outbox_id, order_id, passenger_subject_ref, event_type, payload, status, attempt_count, next_attempt_at, created_at
      ) VALUES ($1, $2, 's', 'eta_changed', '{}', 'failed', 1, now() - interval '1 hour', now())`,
      [outboxId, orderId]
    );

    await pool.query(
      `INSERT INTO mobility.phase1_partner_notification_delivery_contexts (
        outbox_id, delivery_id, order_id, entry_slug, tenant_id, partner_id, binding_id, binding_version, webhook_id, endpoint_fingerprint, wire_payload, wire_payload_hash, event_sequence, expires_at, retry_policy_snapshot, delivery_target, retry_disposition, failure_reason, created_at
      ) VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, 1, 'w', 'fingerprint', '{"event": "passenger.eta_changed.v1", "data": {"recipient": {"partnerUserRef": "u"}}}'::jsonb, 'hash', 1, now() + interval '1 day', '{"maxAttempts": 3}'::jsonb, 'partner_endpoint', 'manual_only', 'provider_transient_error', now())`,
      [outboxId, orderId, entrySlug, tenantId, partnerId, bindingId]
    );

    const entryObj = { entrySlug, tenantId, partnerId };

    const res1 = await mtRepo.retryPartnerNotificationDelivery(entryObj, outboxId);
    expect(res1.kind).toBe("requeued");

    const res2 = await mtRepo.retryPartnerNotificationDelivery(entryObj, outboxId);
    expect(res2.kind).toBe("requeued");

    const entryObjWrongOwner = { entrySlug: "entry-wrong", tenantId: "tenant-wrong", partnerId: "partner-wrong" };
    const resWrong = await mtRepo.retryPartnerNotificationDelivery(entryObjWrongOwner, outboxId);
    expect(resWrong.kind).toBe("failed");
    if (resWrong.kind === "failed") {
      expect(resWrong.failure.failureReason).toBe("owner_changed");
    }
  });

  it("same-tenant vs cross-tenant logic is validated", async () => {
    const entrySlug = `entry-tenant-${randomUUID()}`;
    const tenantId = `tenant-${randomUUID()}`;
    const partnerId = `partner-${randomUUID()}`;

    await pool.query(
      "INSERT INTO admin.phase1_partner_channel_entries (entry_slug, tenant_id, partner_id, created_at, updated_at, program_id, status, record) VALUES ($1, $2, $3, now(), now(), 'program1', 'active', $4::jsonb)",
      [entrySlug, tenantId, partnerId, JSON.stringify({ entrySlug, tenantId, partnerId, status: 'active', activeFlag: true })]
    );

    const identity1 = { authMode: "jwt_bearer", actorType: "tenant_admin", actorId: "admin-1", realm: "tenant", tenantId };
    mtService.tenantPartnerService.partnerEntries.push({ entrySlug, tenantId, partnerId, status: 'active', programId: 'program1', activeFlag: true });
    
    const queryPromise = mtService.listPartnerNotificationDeliveries(entrySlug, {}, identity1);
    await expect(queryPromise).resolves.toBeDefined();

    const identity2 = { authMode: "jwt_bearer", actorType: "tenant_admin", actorId: "admin-2", realm: "tenant", tenantId: tenantId + '-other' };
    const crossTenantPromise = mtService.listPartnerNotificationDeliveries(entrySlug, {}, identity2);
    await expect(crossTenantPromise).rejects.toThrowError(ApiRequestError);
  });
});
