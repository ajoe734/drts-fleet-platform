import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type { ConsumerNotificationOutboxRecord, OrderPartnerNotificationRoute } from "@drts/contracts";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { PassengerPushDevicesRepository } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";

const require = createRequire(new URL("../../../apps/api/package.json", import.meta.url));
const { Pool } = require("pg") as typeof import("pg");
export const databaseUrl = process.env.PASSENGER_PUSH_CHANNEL_TEST_DATABASE_URL;

/** Hosted opt-in only. Apply every production migration, without substitute
 * tables or copied DDL. An unreachable configured URL is a failure, never a skip.
 * Cleanup can only drop this harness's randomly named, successfully created DB. */
export class PostgresHarness {
  private readonly name = `push_qa_${randomUUID().replaceAll("-", "")}`;
  private admin?: InstanceType<typeof Pool>;
  private created = false;
  pool!: InstanceType<typeof Pool>;
  database!: DatabaseService;
  taxi!: MultiTaxiRepository;
  owned!: OwnedMobilityRepository;
  devices!: PassengerPushDevicesRepository;

  async open() {
    this.admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
    await this.admin.query(`CREATE DATABASE "${this.name}"`);
    this.created = true;
    const url = new URL(databaseUrl!);
    url.pathname = `/${this.name}`;
    this.pool = new Pool({ connectionString: url.toString(), max: 16, connectionTimeoutMillis: 10000 });
    const files = (await readdir("infra/migrations")).filter((f) => /^V\d+__.*\.sql$/.test(f)).sort();
    for (const file of files) {
      try {
        await this.pool.query(await readFile(`infra/migrations/${file}`, "utf8"));
      } catch (error) {
        throw new Error(`Production migration failed: ${file}`, { cause: error });
      }
    }
    this.database = {
      isEnabled: () => true,
      query: this.pool.query.bind(this.pool),
      connect: this.pool.connect.bind(this.pool),
    } as unknown as DatabaseService;
    this.taxi = new MultiTaxiRepository(this.database);
    this.owned = new OwnedMobilityRepository(this.database, this.taxi);
    this.devices = new PassengerPushDevicesRepository(this.database);
  }

  async close() {
    await this.pool?.end();
    try {
      if (this.created) await this.admin!.query(`DROP DATABASE "${this.name}"`);
    } finally { await this.admin?.end(); }
  }

  async reset() {
    await this.pool.query(`TRUNCATE ops.phase1_owned_orders, ops.phase1_dispatch_jobs,
      ops.phase1_dispatch_assignments, ops.phase1_driver_tasks, ops.phase1_dispatch_attempts,
      ops.phase1_dispatch_trace_logs, ops.consumer_notification_outbox,
      mobility.phase1_order_partner_notification_routes,
      mobility.phase1_order_first_party_notification_routes,
      iam.phase1_passenger_push_devices, admin.phase1_partner_user_identity_links CASCADE`);
  }

  async entry(entrySlug = "entry-qa") {
    await this.pool.query(`INSERT INTO admin.phase1_partner_channel_entries
      (entry_slug,tenant_id,partner_id,program_id,status,created_at,updated_at,record)
      VALUES ($1,'tenant-qa','partner-qa','program-qa','active',now(),now(),'{}')
      ON CONFLICT DO NOTHING`, [entrySlug]);
  }

  partnerRoute(orderId = "order-qa"): OrderPartnerNotificationRoute {
    const now = new Date().toISOString();
    return { orderId, tenantId: "tenant-qa", partnerId: "partner-qa", entrySlug: "entry-qa",
      partnerUserRef: "opaque-qa", drtsPassengerId: "passenger-qa", passengerSubjectRef: "passenger-qa",
      identityLinkedAt: now, consentBundleVersion: "v1", notificationPolicyVersion: "partner_notification_v1",
      rideRef: `ride-${orderId}`, createdAt: now };
  }

  firstRoute(orderId = "order-qa") {
    return { orderId, tenantId: "tenant-qa", drtsPassengerId: "passenger-qa",
      passengerSubjectRef: "passenger-qa", appId: "app-qa", consentVersion: "v1", rideRef: `ride-${orderId}` };
  }

  device(token: string, drtsPassengerId = "passenger-qa") {
    return this.devices.registerDevice({ token, drtsPassengerId, platform: "android", provider: "fcm_v1",
      appId: "app-qa", appVersion: "1", notificationConsentVersion: "v1" });
  }

  async order(orderId = "order-qa") {
    const order = buildOrderFixture({ orderId, runtimeProfileCode: "business_dispatch",
      serviceBucket: "business_dispatch", orderSource: "portal", tenantId: "tenant-qa",
      partnerId: "partner-qa", partnerEntrySlug: "entry-qa",
      passenger: { passengerId: "passenger-qa", name: "Synthetic", phone: "0900000000" } });
    await this.owned.persistChanges({ orders: [order] });
    return order;
  }

  async event(outboxId = "outbox-qa", orderId = "order-qa", eventType: ConsumerNotificationOutboxRecord["eventType"] = "receipt_ready") {
    const now = new Date().toISOString();
    const event: ConsumerNotificationOutboxRecord = { outboxId, orderId, eventType,
      passengerSubjectRef: "passenger-qa", assignmentVersion: 1, payload: { eventSequence: 1 },
      status: "pending", attemptCount: 0, nextAttemptAt: now, createdAt: now, deliveredAt: null };
    await this.owned.persistChanges({ consumerNotificationOutbox: [event] });
    return event;
  }
}
