import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../../apps/api/src/common/db";
import { PartnerNotificationNavigationRepository } from "../../apps/api/src/modules/tenant-partner/partner-notification-navigation.repository";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
const repoRoot = path.resolve(__dirname, "..", "..");
const seedDatabaseUrl = process.env.DATABASE_URL;

// Opt-in real PostgreSQL only. This suite provisions its own throwaway
// database and replays the full migration ledger via db-apply.sh so the
// schema it asserts against can never drift from what admin/mobility/ops
// actually ship (root cause of prior CI failures: the shared job database
// used by `pnpm run test:unit` has no migrations applied at that point, and
// hand-rolled subset schema drifted from the real, multi-migration tables).
// Never starts a server on the worker VM.
describe.skipIf(!seedDatabaseUrl)(
  "SR-PARTNER-NOTIFY-NAV-20260917 Integration",
  () => {
    const dbName = `sr_partner_notify_nav_${process.pid}_${Date.now()}`;
    const adminUrl = (() => {
      if (!seedDatabaseUrl) return new URL("postgres://localhost");
      const url = new URL(seedDatabaseUrl);
      url.pathname = "/postgres";
      return url;
    })();
    const databaseUrl = (() => {
      if (!seedDatabaseUrl) return "postgres://localhost";
      const url = new URL(seedDatabaseUrl);
      url.pathname = `/${dbName}`;
      return url.toString();
    })();

    let admin: InstanceType<typeof Pool>;
    let pool: InstanceType<typeof Pool>;
    let db: DatabaseService;
    let navRepo: PartnerNotificationNavigationRepository;

    beforeAll(async () => {
      admin = new Pool({ connectionString: adminUrl.toString() });
      await admin.query(`CREATE DATABASE "${dbName}"`);

      execFileSync("./operations/database/db-apply.sh", [], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: "utf8",
        stdio: "pipe",
      });

      // A minimal DatabaseService-shaped Pool wrapper scoped to this suite's
      // own throwaway database, so this suite never touches the shared
      // process.env.DATABASE_URL that other concurrently-running test files
      // and their DatabaseService instances rely on.
      pool = new Pool({ connectionString: databaseUrl, max: 8 });
      db = { connect: pool.connect.bind(pool) } as unknown as DatabaseService;
      navRepo = new PartnerNotificationNavigationRepository(db);
    }, 120_000);

    afterAll(async () => {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await admin.end();
    }, 30_000);

    const setupMockData = async (client: any, data: any) => {
      const {
        orderId,
        entrySlug,
        partnerId,
        tenantId,
        orderPassengerId,
        routePassengerId,
        userRef,
        rideRef,
        passengerSubjectRef,
        orderTenantId,
        orderPartnerId,
      } = data;

      // Seed partner entry (FK)
      await client.query(
        `
      INSERT INTO admin.phase1_partner_channel_entries (entry_slug, partner_id, tenant_id, status, program_id, record, created_at, updated_at)
      VALUES ($1, $2, $3, 'active', 'prog-1', '{}'::jsonb, NOW(), NOW())
      ON CONFLICT (entry_slug) DO NOTHING;
    `,
        [entrySlug, partnerId, tenantId || "default-tenant"],
      );

      // Seed owned order
      const orderRecord = JSON.stringify({
        tenantId: orderTenantId,
        partnerId: orderPartnerId,
        partnerEntrySlug: entrySlug,
        status: "driver_assigned",
        passenger: { passengerId: orderPassengerId },
      });

      await client.query(
        `
      INSERT INTO ops.phase1_owned_orders
        (order_id, order_no, record, status, order_source, service_bucket, dispatch_semantics, created_at, updated_at)
      VALUES
        ($1, 'NO123', $2::jsonb, 'driver_assigned', 'app', 'standard', 'immediate', NOW(), NOW())
      ON CONFLICT DO NOTHING;
    `,
        [orderId, orderRecord],
      );

      // Seed notification route
      await client.query(
        `
      INSERT INTO mobility.phase1_order_partner_notification_routes
        (order_id, tenant_id, partner_id, entry_slug, partner_user_ref, drts_passenger_id, ride_ref, passenger_subject_ref, identity_linked_at, consent_bundle_version)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), '1.0.0')
      ON CONFLICT DO NOTHING;
    `,
        [
          orderId,
          tenantId,
          partnerId,
          entrySlug,
          userRef,
          routePassengerId,
          rideRef,
          passengerSubjectRef,
        ],
      );
    };

    const cleanupMockData = async (client: any, data: any) => {
      await client.query(
        `DELETE FROM mobility.phase1_order_partner_notification_routes WHERE order_id = $1`,
        [data.orderId],
      );
      await client.query(
        `DELETE FROM ops.phase1_owned_orders WHERE order_id = $1`,
        [data.orderId],
      );
      await client.query(
        `DELETE FROM admin.phase1_partner_channel_entries WHERE entry_slug = $1`,
        [data.entrySlug],
      );
    };

    it("should successfully resolve a null-tenant multi-taxi order route (positive)", async () => {
      const client = await db.connect();
      const data = {
        orderId: randomUUID(),
        entrySlug: `entry-${randomUUID()}`,
        partnerId: `partner-${randomUUID()}`,
        tenantId: `tenant-${randomUUID()}`,
        orderTenantId: null,
        orderPartnerId: `partner-${randomUUID()}`,
        orderPassengerId: "pass-same-1",
        routePassengerId: "pass-same-1",
        userRef: `user-${randomUUID()}`,
        rideRef: `ride-${randomUUID()}`,
        passengerSubjectRef: `subj-${randomUUID()}`,
      };
      data.orderPartnerId = data.partnerId; // Valid match

      try {
        await setupMockData(client, data);

        const result = await navRepo.resolveRoute(
          data.entrySlug,
          data.rideRef,
          data.userRef,
        );
        expect(result).not.toBeNull();
        expect(result?.orderId).toBe(data.orderId);
        expect(result?.tenantId).toBe(data.tenantId);
      } finally {
        try {
          await cleanupMockData(client, data);
        } finally {
          client.release();
        }
      }
    });

    it("should reject resolving route when passenger mismatches for null-tenant (negative cross-passenger)", async () => {
      const client = await db.connect();
      const data = {
        orderId: randomUUID(),
        entrySlug: `entry-${randomUUID()}`,
        partnerId: `partner-1`,
        tenantId: `tenant-${randomUUID()}`,
        orderTenantId: null,
        orderPartnerId: `partner-1`,
        orderPassengerId: "pass-order-1",
        routePassengerId: "pass-route-2",
        userRef: `user-${randomUUID()}`,
        rideRef: `ride-${randomUUID()}`,
        passengerSubjectRef: `subj-${randomUUID()}`,
      };

      try {
        await setupMockData(client, data);

        const result = await navRepo.resolveRoute(
          data.entrySlug,
          data.rideRef,
          data.userRef,
        );
        expect(result).toBeNull();
      } finally {
        try {
          await cleanupMockData(client, data);
        } finally {
          client.release();
        }
      }
    });

    it("should reject resolving route when tenant mismatches (negative frozen tenant)", async () => {
      const client = await db.connect();
      const data = {
        orderId: randomUUID(),
        entrySlug: `entry-${randomUUID()}`,
        partnerId: `partner-${randomUUID()}`,
        tenantId: `tenant-${randomUUID()}`,
        orderTenantId: `different-tenant-${randomUUID()}`, // Mismatch!
        orderPartnerId: `partner-${randomUUID()}`,
        orderPassengerId: "pass-1",
        routePassengerId: "pass-1",
        userRef: `user-${randomUUID()}`,
        rideRef: `ride-${randomUUID()}`,
        passengerSubjectRef: `subj-${randomUUID()}`,
      };
      data.orderPartnerId = data.partnerId;

      try {
        await setupMockData(client, data);

        const result = await navRepo.resolveRoute(
          data.entrySlug,
          data.rideRef,
          data.userRef,
        );
        expect(result).toBeNull();
      } finally {
        try {
          await cleanupMockData(client, data);
        } finally {
          client.release();
        }
      }
    });

    it("should successfully resolve a tenant-bound order route (positive tenant match)", async () => {
      const client = await db.connect();
      const tenantId = `tenant-${randomUUID()}`;
      const data = {
        orderId: randomUUID(),
        entrySlug: `entry-${randomUUID()}`,
        partnerId: `partner-1`,
        tenantId: tenantId,
        orderTenantId: tenantId,
        orderPartnerId: `partner-1`,
        orderPassengerId: "pass-1",
        routePassengerId: "pass-1",
        userRef: `user-${randomUUID()}`,
        rideRef: `ride-${randomUUID()}`,
        passengerSubjectRef: `subj-${randomUUID()}`,
      };

      try {
        await setupMockData(client, data);

        const result = await navRepo.resolveRoute(
          data.entrySlug,
          data.rideRef,
          data.userRef,
        );
        expect(result).not.toBeNull();
        expect(result?.orderId).toBe(data.orderId);
      } finally {
        try {
          await cleanupMockData(client, data);
        } finally {
          client.release();
        }
      }
    });

    it("should reject resolving route when tenant mismatches (negative cross-tenant)", async () => {
      const client = await db.connect();
      const data = {
        orderId: randomUUID(),
        entrySlug: `entry-${randomUUID()}`,
        partnerId: `partner-1`,
        tenantId: `tenant-route`,
        orderTenantId: `tenant-order`,
        orderPartnerId: `partner-1`,
        orderPassengerId: "pass-1",
        routePassengerId: "pass-1",
        userRef: `user-${randomUUID()}`,
        rideRef: `ride-${randomUUID()}`,
        passengerSubjectRef: `subj-${randomUUID()}`,
      };

      try {
        await setupMockData(client, data);

        const result = await navRepo.resolveRoute(
          data.entrySlug,
          data.rideRef,
          data.userRef,
        );
        expect(result).toBeNull();
      } finally {
        try {
          await cleanupMockData(client, data);
        } finally {
          client.release();
        }
      }
    });
  },
);
