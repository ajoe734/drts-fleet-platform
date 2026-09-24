import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../../apps/api/src/common/db";
import { PartnerNotificationNavigationRepository } from "../../apps/api/src/modules/tenant-partner/partner-notification-navigation.repository";
import { ReferralEmbedHandoffRepository } from "../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

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
    let handoffRepo: ReferralEmbedHandoffRepository;

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
      db = {
        connect: pool.connect.bind(pool),
        isEnabled: () => true,
        query: pool.query.bind(pool),
      } as unknown as DatabaseService;
      navRepo = new PartnerNotificationNavigationRepository(db);
      handoffRepo = new ReferralEmbedHandoffRepository(db);
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

    it("resolves route by orderId (findByOrderId)", async () => {
      const client = await db.connect();
      const tenantId = `tenant-${randomUUID()}`;
      const data = {
        orderId: `order_nav_${randomUUID()}`,
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

        const result = await navRepo.findByOrderId(data.orderId);
        expect(result).not.toBeNull();
        expect(result!.orderId).toBe(data.orderId);

        const missing = await navRepo.findByOrderId("order_nav_missing");
        expect(missing).toBeNull();
      } finally {
        try {
          await cleanupMockData(client, data);
        } finally {
          client.release();
        }
      }
    });

    it("successfully records referral embed consent and persists to ledger (positive)", async () => {
      // Issue a handoff artifact
      const handoff = await handoffRepo.issue({
        artifact: "artifact_123",
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        partnerUserRef: "user-1",
        drtsPassengerId: "pass-1",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });

      // Consume it
      const consumeRes = await handoffRepo.consume({
        artifact: "artifact_123",
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
      });
      expect(consumeRes.outcome).toBe("consumed");

      // Record consent
      const linkRepo = {
        findByDrtsPassengerId: async () => ({ status: "active" }),
      };
      const tenantPartnerRepo = {
        loadState: async () => ({
          partnerEntries: [
            {
              entrySlug: "demo-slug",
              status: "active",
              tenantId: null,
              partnerId: null,
              activeFlag: true,
              authMode: "partner_api_key",
            },
          ],
        }),
      };
      const auditNotificationService = { recordAuditLog: () => {} };
      const service = new TenantPartnerService(
        auditNotificationService as any,
        tenantPartnerRepo as any,
        undefined,
        undefined,
        undefined,
        linkRepo as any,
        handoffRepo,
      );
      await service.onModuleInit();

      const consentSession = await service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: {
          bundleVersion: "v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      });
      expect(consentSession.handoffId).toBe(handoff.handoffId);

      // Verify ledger persistence
      const ledger = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
      expect(ledger).not.toBeNull();
      expect(ledger?.handoffId).toBe(handoff.handoffId);
    });

    it("allows consent after handoff expiration as long as it was consumed (positive replay)", async () => {
      const now = Date.now();
      const past = new Date(now - 300_000).toISOString(); // 5 minutes ago

      // Issue an ALREADY EXPIRED handoff (expiresAt is in the past)
      // but simulate that it was already consumed in time by directly injecting it or just consuming it (but consume would fail if expired).
      // So we issue it with future expiry, consume it, then update its expiresAt to past via PG client for the test.
      const handoff = await handoffRepo.issue({
        artifact: "artifact_expired",
        entrySlug: "demo-slug-exp",
        entryHost: "demo-host.com",
        partnerUserRef: "user-1",
        drtsPassengerId: "pass-1",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date(now - 400_000).toISOString(),
        expiresAt: new Date(now + 100_000).toISOString(), // valid for consumption
      });

      const consumeRes = await handoffRepo.consume({
        artifact: "artifact_expired",
        entrySlug: "demo-slug-exp",
        entryHost: "demo-host.com",
      });
      expect(consumeRes.outcome).toBe("consumed");

      // Update expires_at to be in the past to simulate the handoff artifact TTL expiring
      const client = await db.connect();
      try {
        await client.query(
          "UPDATE admin.phase1_referral_embed_handoffs SET expires_at = $1::timestamptz, record = jsonb_set(record, '{expiresAt}', to_jsonb($1::text), true) WHERE handoff_id = $2",
          [past, handoff.handoffId],
        );
      } finally {
        client.release();
      }

      // Record consent (should succeed even if handoff is expired, because the session outlives the artifact)
      const linkRepo = {
        findByDrtsPassengerId: async () => ({ status: "active" }),
      };
      const tenantPartnerRepo = {
        loadState: async () => ({
          partnerEntries: [
            {
              entrySlug: "demo-slug-exp",
              status: "active",
              tenantId: null,
              partnerId: null,
              activeFlag: true,
              authMode: "partner_api_key",
            },
          ],
        }),
      };
      const auditNotificationService = { recordAuditLog: () => {} };
      const service = new TenantPartnerService(
        auditNotificationService as any,
        tenantPartnerRepo as any,
        undefined,
        undefined,
        undefined,
        linkRepo as any,
        handoffRepo,
      );
      await service.onModuleInit();

      const consentSession = await service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug-exp",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug-exp",
        consentBundle: {
          bundleVersion: "v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      });
      expect(consentSession.handoffId).toBe(handoff.handoffId);
    });

    it("rejects consent if session is older than 8 hours", async () => {
      const now = Date.now();
      const past = new Date(now - 9 * 60 * 60 * 1000).toISOString(); // 9 hours ago

      // Issue and consume an artifact 9 hours ago
      const handoff = await handoffRepo.issue({
        artifact: "artifact_expired_session",
        entrySlug: "demo-slug-exp-sess",
        entryHost: "demo-host.com",
        partnerUserRef: "user-2",
        drtsPassengerId: "pass-2",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now - 9.5 * 60 * 60 * 1000).toISOString(),
      });

      // Instead of consuming via repo, we inject it directly with consumed_at > 8 hours ago
      const client = await db.connect();
      try {
        await client.query(
          "UPDATE admin.phase1_referral_embed_handoffs SET consumed_at = $1::timestamptz, expires_at = $1::timestamptz, record = jsonb_set(jsonb_set(record, '{consumedAt}', to_jsonb($1::text), true), '{expiresAt}', to_jsonb($1::text), true) WHERE handoff_id = $2",
          [past, handoff.handoffId],
        );
      } finally {
        client.release();
      }

      const linkRepo = {
        findByDrtsPassengerId: async () => ({ status: "active" }),
      };
      const tenantPartnerRepo = {
        loadState: async () => ({
          partnerEntries: [
            {
              entrySlug: "demo-slug-exp-sess",
              status: "active",
              tenantId: null,
              partnerId: null,
              activeFlag: true,
              authMode: "partner_api_key",
            },
          ],
        }),
      };
      const auditNotificationService = { recordAuditLog: () => {} };
      const service = new TenantPartnerService(
        auditNotificationService as any,
        tenantPartnerRepo as any,
        undefined,
        undefined,
        undefined,
        linkRepo as any,
        handoffRepo,
      );
      await service.onModuleInit();

      await expect(
        service.recordReferralEmbedConsent({
          handoffId: handoff.handoffId,
          entrySlug: "demo-slug-exp-sess",
          entryHost: "demo-host.com",
          currentDrtsPassengerId: "pass-2",
          currentPartnerEntrySlug: "demo-slug-exp-sess",
          consentBundle: {
            bundleVersion: "v1",
            grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
            grantedAt: new Date().toISOString(),
          },
        }),
      ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_EXPIRED" });
    });

    it("rejects consume on session mismatch without consuming the handoff (negative cross-subject zero-write)", async () => {
      const artifact = "artifact_cross_subject";
      const handoff = await handoffRepo.issue({
        artifact,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        partnerUserRef: "user-a",
        drtsPassengerId: "pass-a",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });

      // Rejected consume by the wrong subject must not commit the UPDATE (regression
      // guard for the commit-before-mismatch-check bug: the transaction must roll
      // back so the handoff is still available for the rightful subject).
      const consumeB = await handoffRepo.consume({
        artifact,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-b",
      });
      expect(consumeB.outcome).toBe("session_mismatch");

      const client = await db.connect();
      try {
        const res = await client.query("SELECT consumed_at FROM admin.phase1_referral_embed_handoffs WHERE handoff_id = $1", [handoff.handoffId]);
        expect(res.rows[0].consumed_at).toBeNull();
      } finally {
        client.release();
      }

      const consumeA = await handoffRepo.consume({
        artifact,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-a",
      });
      expect(consumeA.outcome).toBe("consumed");

      const consumeBReplay = await handoffRepo.consume({
        artifact,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-b",
      });
      expect(consumeBReplay.outcome).toBe("replayed");
    });

    it("rejects consume on cross-entry session mismatch without consuming the handoff (negative cross-entry zero-write)", async () => {
      // Companion to the cross-subject case above: this covers
      // currentPartnerEntrySlug instead of currentDrtsPassengerId, the other
      // half of the BFF's mismatch guard, which had no real-Postgres
      // regression before this round.
      const artifact = "artifact_cross_entry";
      const handoff = await handoffRepo.issue({
        artifact,
        entrySlug: "demo-slug-entry-a",
        entryHost: "demo-host.com",
        partnerUserRef: "user-a",
        drtsPassengerId: "pass-a",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });

      const consumeFromOtherEntry = await handoffRepo.consume({
        artifact,
        entrySlug: "demo-slug-entry-a",
        entryHost: "demo-host.com",
        currentPartnerEntrySlug: "demo-slug-entry-b",
      });
      expect(consumeFromOtherEntry.outcome).toBe("session_mismatch");

      const client = await db.connect();
      try {
        const res = await client.query(
          "SELECT consumed_at FROM admin.phase1_referral_embed_handoffs WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        expect(res.rows[0].consumed_at).toBeNull();
      } finally {
        client.release();
      }

      const rightfulConsume = await handoffRepo.consume({
        artifact,
        entrySlug: "demo-slug-entry-a",
        entryHost: "demo-host.com",
        currentPartnerEntrySlug: "demo-slug-entry-a",
      });
      expect(rightfulConsume.outcome).toBe("consumed");
    });

    it("rejects a real-Postgres grant-consent replay once the identity link is revoked, writing zero additional ledger rows", async () => {
      const entrySlug = "demo-slug-pg-revoked";
      const linkStatus: { current: "active" | "revoked" } = { current: "active" };
      const linkRepo = {
        findByDrtsPassengerId: async () => ({ status: linkStatus.current }),
      };
      const tenantPartnerRepo = {
        loadState: async () => ({
          partnerEntries: [
            {
              entrySlug,
              status: "active",
              tenantId: null,
              partnerId: null,
              activeFlag: true,
              authMode: "partner_api_key",
            },
          ],
        }),
      };
      const auditNotificationService = { recordAuditLog: () => {} };
      const service = new TenantPartnerService(
        auditNotificationService as any,
        tenantPartnerRepo as any,
        undefined,
        undefined,
        undefined,
        linkRepo as any,
        handoffRepo,
      );
      await service.onModuleInit();

      const handoff = await handoffRepo.issue({
        artifact: "artifact_pg_revoked",
        entrySlug,
        entryHost: "demo-host.com",
        partnerUserRef: "user-1",
        drtsPassengerId: "pass-pg-revoked",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });
      const consumeRes = await handoffRepo.consume({
        artifact: "artifact_pg_revoked",
        entrySlug,
        entryHost: "demo-host.com",
      });
      expect(consumeRes.outcome).toBe("consumed");

      await service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug,
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-pg-revoked",
        currentPartnerEntrySlug: entrySlug,
        consentBundle: {
          bundleVersion: "v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      });

      const client = await db.connect();
      let rowCountAfterGrant: number;
      let ledgerRecordAfterGrant: unknown;
      let handoffConsentAfterGrant: {
        consent_bundle_version: string | null;
        consent_granted_at: string | null;
        record: unknown;
      };
      try {
        const res = await client.query(
          "SELECT COUNT(*)::int AS count, (array_agg(record))[1] AS record FROM admin.phase1_referral_embed_consent_ledger WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        rowCountAfterGrant = res.rows[0].count;
        ledgerRecordAfterGrant = res.rows[0].record;
        expect(rowCountAfterGrant).toBe(1);
        expect(ledgerRecordAfterGrant).toBeTruthy();

        const handoffRes = await client.query(
          "SELECT consent_bundle_version, consent_granted_at, record FROM admin.phase1_referral_embed_handoffs WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        handoffConsentAfterGrant = handoffRes.rows[0];
        expect(handoffConsentAfterGrant.consent_bundle_version).toBe("v1");
      } finally {
        client.release();
      }

      linkStatus.current = "revoked";

      await expect(
        service.recordReferralEmbedConsent({
          handoffId: handoff.handoffId,
          entrySlug,
          entryHost: "demo-host.com",
          currentDrtsPassengerId: "pass-pg-revoked",
          currentPartnerEntrySlug: entrySlug,
          consentBundle: {
            bundleVersion: "v2-replay-attempt",
            grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
            grantedAt: new Date().toISOString(),
          },
        }),
      ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_REVOKED" });

      // Not just "row count unchanged": confirm the *existing* ledger row and
      // the handoffs row's consent snapshot are byte-identical to what they
      // were right after the original grant, i.e. the rejected replay (which
      // used a different bundleVersion, so it cannot be conflated with an
      // idempotent same-bundle replay) neither inserted a new row nor
      // mutated the existing one via some other code path.
      const clientAfter = await db.connect();
      try {
        const res = await clientAfter.query(
          "SELECT COUNT(*)::int AS count, (array_agg(record))[1] AS record FROM admin.phase1_referral_embed_consent_ledger WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        expect(res.rows[0].count).toBe(rowCountAfterGrant);
        expect(res.rows[0].record).toEqual(ledgerRecordAfterGrant);

        const handoffRes = await clientAfter.query(
          "SELECT consent_bundle_version, consent_granted_at, record FROM admin.phase1_referral_embed_handoffs WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        expect(handoffRes.rows[0]).toEqual(handoffConsentAfterGrant);
      } finally {
        clientAfter.release();
      }
    });

    it("rejects a real-Postgres grant-consent replay once the entry's tenant ownership has changed, writing zero additional ledger rows", async () => {
      const entrySlug = "demo-slug-pg-owner-changed";
      const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };
      const buildTenantPartnerRepo = (tenantId: string | null) => ({
        loadState: async () => ({
          partnerEntries: [
            {
              entrySlug,
              status: "active",
              tenantId,
              partnerId: null,
              activeFlag: true,
              authMode: "partner_api_key",
            },
          ],
        }),
      });
      const auditNotificationService = { recordAuditLog: () => {} };
      const serviceAtGrantTime = new TenantPartnerService(
        auditNotificationService as any,
        buildTenantPartnerRepo(null) as any,
        undefined,
        undefined,
        undefined,
        linkRepo as any,
        handoffRepo,
      );
      await serviceAtGrantTime.onModuleInit();

      const handoff = await handoffRepo.issue({
        artifact: "artifact_pg_owner_changed",
        entrySlug,
        entryHost: "demo-host.com",
        partnerUserRef: "user-1",
        drtsPassengerId: "pass-pg-owner-changed",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });
      const consumeRes = await handoffRepo.consume({
        artifact: "artifact_pg_owner_changed",
        entrySlug,
        entryHost: "demo-host.com",
      });
      expect(consumeRes.outcome).toBe("consumed");

      await serviceAtGrantTime.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug,
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-pg-owner-changed",
        currentPartnerEntrySlug: entrySlug,
        consentBundle: {
          bundleVersion: "v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      });

      const client = await db.connect();
      let rowCountAfterGrant: number;
      let ledgerRecordAfterGrant: unknown;
      let handoffConsentAfterGrant: {
        consent_bundle_version: string | null;
        consent_granted_at: string | null;
        record: unknown;
      };
      try {
        const res = await client.query(
          "SELECT COUNT(*)::int AS count, (array_agg(record))[1] AS record FROM admin.phase1_referral_embed_consent_ledger WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        rowCountAfterGrant = res.rows[0].count;
        ledgerRecordAfterGrant = res.rows[0].record;
        expect(rowCountAfterGrant).toBe(1);
        expect(ledgerRecordAfterGrant).toBeTruthy();

        const handoffRes = await client.query(
          "SELECT consent_bundle_version, consent_granted_at, record FROM admin.phase1_referral_embed_handoffs WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        handoffConsentAfterGrant = handoffRes.rows[0];
        expect(handoffConsentAfterGrant.consent_bundle_version).toBe("v1");
      } finally {
        client.release();
      }

      const serviceAfterReassignment = new TenantPartnerService(
        auditNotificationService as any,
        buildTenantPartnerRepo("tenant-reassigned") as any,
        undefined,
        undefined,
        undefined,
        linkRepo as any,
        handoffRepo,
      );
      await serviceAfterReassignment.onModuleInit();

      await expect(
        serviceAfterReassignment.recordReferralEmbedConsent({
          handoffId: handoff.handoffId,
          entrySlug,
          entryHost: "demo-host.com",
          currentDrtsPassengerId: "pass-pg-owner-changed",
          currentPartnerEntrySlug: entrySlug,
          consentBundle: {
            bundleVersion: "v2-replay-attempt",
            grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
            grantedAt: new Date().toISOString(),
          },
        }),
      ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });

      // Not just "row count unchanged": confirm the existing ledger row and
      // the handoffs row's consent snapshot are byte-identical to right
      // after the original grant, so the rejected reassigned-tenant replay
      // (a different bundleVersion, so not an idempotent same-bundle replay)
      // neither inserted a row nor mutated the existing one.
      const clientAfter = await db.connect();
      try {
        const res = await clientAfter.query(
          "SELECT COUNT(*)::int AS count, (array_agg(record))[1] AS record FROM admin.phase1_referral_embed_consent_ledger WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        expect(res.rows[0].count).toBe(rowCountAfterGrant);
        expect(res.rows[0].record).toEqual(ledgerRecordAfterGrant);

        const handoffRes = await clientAfter.query(
          "SELECT consent_bundle_version, consent_granted_at, record FROM admin.phase1_referral_embed_handoffs WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        expect(handoffRes.rows[0]).toEqual(handoffConsentAfterGrant);
      } finally {
        clientAfter.release();
      }
    });

    it("rejects a real-Postgres grant-consent for a handoff that has not been consumed yet, writing zero ledger rows", async () => {
      const entrySlug = "demo-slug-pg-not-consumed";
      const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };
      const tenantPartnerRepo = {
        loadState: async () => ({
          partnerEntries: [
            {
              entrySlug,
              status: "active",
              tenantId: null,
              partnerId: null,
              activeFlag: true,
              authMode: "partner_api_key",
            },
          ],
        }),
      };
      const auditNotificationService = { recordAuditLog: () => {} };
      const service = new TenantPartnerService(
        auditNotificationService as any,
        tenantPartnerRepo as any,
        undefined,
        undefined,
        undefined,
        linkRepo as any,
        handoffRepo,
      );
      await service.onModuleInit();

      const handoff = await handoffRepo.issue({
        artifact: "artifact_pg_not_consumed",
        entrySlug,
        entryHost: "demo-host.com",
        partnerUserRef: "user-1",
        drtsPassengerId: "pass-pg-not-consumed",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });
      // Deliberately skipped: handoffRepo.consume(...)

      await expect(
        service.recordReferralEmbedConsent({
          handoffId: handoff.handoffId,
          entrySlug,
          entryHost: "demo-host.com",
          currentDrtsPassengerId: "pass-pg-not-consumed",
          currentPartnerEntrySlug: entrySlug,
          consentBundle: {
            bundleVersion: "v1",
            grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
            grantedAt: new Date().toISOString(),
          },
        }),
      ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_NOT_CONSUMED" });

      const client = await db.connect();
      try {
        const res = await client.query(
          "SELECT COUNT(*)::int AS count FROM admin.phase1_referral_embed_consent_ledger WHERE handoff_id = $1",
          [handoff.handoffId],
        );
        expect(res.rows[0].count).toBe(0);
      } finally {
        client.release();
      }
    });
  },
);
