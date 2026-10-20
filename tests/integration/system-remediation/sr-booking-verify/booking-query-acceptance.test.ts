import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import { OwnedMobilityController } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityModule } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.module";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";

type PgPoolLike = {
  query: <R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: R[]; rowCount: number | null }>;
  end: () => Promise<void>;
};

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as {
  Pool: new (options?: { connectionString?: string | undefined }) => PgPoolLike;
};

function makeTenantIdentity(tenantId: string): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    realm: "tenant",
    actorType: "tenant_admin",
    actorId: `user-${tenantId}`,
    tenantId,
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: [],
    requestId: "req-test-auth",
  };
}

// Falling back to generic DATABASE_URL is prohibited because standard CI sets DATABASE_URL
// globally before running migrations in unit test suites. Real database acceptance is guarded by
// DRTS_BOOKING_VERIFY_DATABASE_URL, which is explicitly provided in the dedicated acceptance workflow.
const dbUrl = process.env.DRTS_BOOKING_VERIFY_DATABASE_URL;

describe("SR-BOOKING-VERIFY Integration Acceptance Suite", () => {
  describe("AppModule & OwnedMobilityModule DI wiring", () => {
    it("verifies OwnedMobilityModule declarations and controller bindings", () => {
      const controllers =
        Reflect.getMetadata("controllers", OwnedMobilityModule) || [];
      expect(controllers).toContain(OwnedMobilityController);

      const providers =
        Reflect.getMetadata("providers", OwnedMobilityModule) || [];
      expect(providers).toContain(OwnedMobilityService);
      expect(providers).toContain(OwnedMobilityRepository);

      expect(typeof OwnedMobilityController.prototype.listTenantBookings).toBe(
        "function",
      );
    });
  });

  describe("Real PostgreSQL Acceptance Matrix", () => {
    const isDbConfigured = Boolean(dbUrl);

    it.skipIf(!isDbConfigured)(
      "executes real PostgreSQL multi-tenant booking query with filtering, sorting, pagination, and second-instance mutation observation",
      async () => {
        const pool = new Pool({ connectionString: dbUrl });

        try {
          // Verify schema readiness
          const tableCheck = await pool.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'ops' AND table_name = 'phase1_owned_orders'`,
          );
          if (tableCheck.rowCount === 0) {
            throw new Error(
              "ops.phase1_owned_orders does not exist. Migrations must be run before this test.",
            );
          }

          const TENANT_A = "tenant-integ-alpha";
          const TENANT_B = "tenant-integ-beta";

          // Clean up potential remnants
          await pool.query(
            `DELETE FROM ops.phase1_owned_orders WHERE tenant_id IN ($1, $2) OR order_id LIKE 'integ-ord-%'`,
            [TENANT_A, TENANT_B],
          );

          // Seed 3 orders for Tenant A and 1 order for Tenant B
          const seedOrders = [
            {
              orderId: "integ-ord-1",
              orderNo: "ORD-INTEG-001",
              bookingId: "bk-integ-001",
              tenantId: TENANT_A,
              status: "dispatched",
              passenger: {
                passengerId: "pax-alice",
                name: "Alice Smith",
                phone: "+1555001",
              },
              reservationWindowStart: "2026-09-10T08:00:00.000Z",
              reservationWindowEnd: "2026-09-10T09:00:00.000Z",
              createdAt: "2026-09-09T10:00:00.000Z",
            },
            {
              orderId: "integ-ord-2",
              orderNo: "ORD-INTEG-002",
              bookingId: "bk-integ-002",
              tenantId: TENANT_A,
              status: "completed",
              passenger: {
                passengerId: "pax-bob",
                name: "Bob Jones",
                phone: "+1555002",
              },
              reservationWindowStart: "2026-09-11T09:00:00.000Z",
              reservationWindowEnd: "2026-09-11T10:00:00.000Z",
              createdAt: "2026-09-09T11:00:00.000Z",
            },
            {
              orderId: "integ-ord-3",
              orderNo: "ORD-INTEG-003",
              bookingId: "bk-integ-003",
              tenantId: TENANT_A,
              status: "requested",
              passenger: {
                passengerId: "pax-charlie",
                name: "Charlie 100% Guaranteed",
                phone: "+1555003",
              },
              reservationWindowStart: "2026-09-12T14:00:00.000Z",
              reservationWindowEnd: "2026-09-12T15:00:00.000Z",
              createdAt: "2026-09-09T12:00:00.000Z",
            },
            {
              orderId: "integ-ord-4",
              orderNo: "ORD-INTEG-004",
              bookingId: "bk-integ-004",
              tenantId: TENANT_B,
              status: "dispatched",
              passenger: {
                passengerId: "pax-david",
                name: "David Tenant B",
                phone: "+1555004",
              },
              reservationWindowStart: "2026-09-10T08:00:00.000Z",
              reservationWindowEnd: "2026-09-10T09:00:00.000Z",
              createdAt: "2026-09-09T10:00:00.000Z",
            },
          ];

          for (const ord of seedOrders) {
            const record = {
              orderId: ord.orderId,
              orderNo: ord.orderNo,
              status: ord.status,
              tenantId: ord.tenantId,
              bookingId: ord.bookingId,
              bookingType: "oneway",
              serviceBucket: "business_dispatch",
              dispatchSemantics: "reservation",
              orderSource: "portal",
              orderDomain: "owned",
              businessDispatchSubtype: "enterprise_dispatch",
              pickup: { address: "100 Innovation Way" },
              dropoff: { address: "200 Terminal Blvd" },
              passenger: ord.passenger,
              reservationWindowStart: ord.reservationWindowStart,
              reservationWindowEnd: ord.reservationWindowEnd,
              approvalState: "not_required",
              approvalRequestIds: [],
              complianceFlags: [],
              fixedPrice: false,
              dispatchAttemptCount: 0,
              proofRequirements: {
                minPhotoCount: 0,
                signoffRequired: false,
                expenseProofRequired: false,
              },
              reservationHoldStatus: "none",
              createdAt: ord.createdAt,
              updatedAt: ord.createdAt,
            };

            await pool.query(
              `INSERT INTO ops.phase1_owned_orders (
                order_id, order_no, status, order_source, service_bucket,
                dispatch_semantics, created_at, updated_at, record
              ) VALUES ($1, $2, $3, 'enterprise', 'tenant_booking', 'scheduled', $4, $5, $6)`,
              [
                ord.orderId,
                ord.orderNo,
                ord.status,
                ord.createdAt,
                ord.createdAt,
                JSON.stringify(record),
              ],
            );
          }

          // Instantiate DatabaseService and Wired Repositories/Services
          process.env.DATABASE_URL = dbUrl;
          const dbService = new DatabaseService();
          const repository = new OwnedMobilityRepository(dbService);
          expect(repository.isEnabled()).toBe(true);
          expect(repository.isDatabaseEnabled()).toBe(true);

          const service = new OwnedMobilityService(
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined,
            repository,
          );

          const controller = new OwnedMobilityController(
            service,
            undefined as never,
          );

          const identityA = makeTenantIdentity(TENANT_A);
          const identityB = makeTenantIdentity(TENANT_B);

          // Verify Tenant Isolation
          const resA = await controller.listTenantBookings(
            {},
            identityA,
            TENANT_A,
            "req-integ-1",
          );
          expect(resA.data.pagination.totalItems).toBe(3);
          expect(resA.data.items.every((it) => it.tenantId === TENANT_A)).toBe(
            true,
          );
          expect(
            resA.data.items.some((it) => it.bookingId === "bk-integ-004"),
          ).toBe(false);

          const resB = await controller.listTenantBookings(
            {},
            identityB,
            TENANT_B,
            "req-integ-2",
          );
          expect(resB.data.pagination.totalItems).toBe(1);
          expect(resB.data.items[0]?.bookingId).toBe("bk-integ-004");
          expect(resB.data.items[0]?.tenantId).toBe(TENANT_B);

          // Verify Cross-Tenant Access Rejection
          await expect(
            controller.listTenantBookings(
              {},
              identityA,
              TENANT_B,
              "req-integ-3",
            ),
          ).rejects.toThrowError(
            expect.objectContaining({
              code: "TENANT_SCOPE_MISMATCH",
              status: 403,
            }),
          );

          // Verify Second-Instance Observation (direct DB mutation without memory cache)
          await pool.query(
            `UPDATE ops.phase1_owned_orders
             SET status = 'completed',
                 record = jsonb_set(record, '{status}', '"completed"'),
                 updated_at = now()
             WHERE order_id = 'integ-ord-1'`,
          );

          const observedRes = await controller.listTenantBookings(
            { status: "completed" },
            identityA,
            TENANT_A,
            "req-integ-4",
          );
          const completedIds = observedRes.data.items.map((i) => i.bookingId);
          expect(completedIds).toContain("bk-integ-001");
          expect(completedIds).toContain("bk-integ-002");
          expect(observedRes.data.pagination.totalItems).toBe(2);

          // Verify Date Range Filtering
          const dateFilteredRes = await controller.listTenantBookings(
            {
              dateField: "reservationStart",
              dateFrom: "2026-09-11T00:00:00.000Z",
              dateTo: "2026-09-13T00:00:00.000Z",
            },
            identityA,
            TENANT_A,
            "req-integ-5",
          );
          expect(dateFilteredRes.data.pagination.totalItems).toBe(2);
          const dateFilteredIds = dateFilteredRes.data.items.map(
            (i) => i.bookingId,
          );
          expect(dateFilteredIds).toContain("bk-integ-002");
          expect(dateFilteredIds).toContain("bk-integ-003");
          expect(dateFilteredIds).not.toContain("bk-integ-001");

          // Verify Literal Substring Search with Wildcard Escaping
          const wildcardSearchRes = await controller.listTenantBookings(
            { q: "100%" },
            identityA,
            TENANT_A,
            "req-integ-6",
          );
          expect(wildcardSearchRes.data.pagination.totalItems).toBe(1);
          expect(wildcardSearchRes.data.items[0]?.bookingId).toBe(
            "bk-integ-003",
          );

          // Verify Exact Passenger ID Filter
          const paxFilterRes = await controller.listTenantBookings(
            { passengerId: "pax-bob" },
            identityA,
            TENANT_A,
            "req-integ-7",
          );
          expect(paxFilterRes.data.pagination.totalItems).toBe(1);
          expect(paxFilterRes.data.items[0]?.bookingId).toBe("bk-integ-002");

          // Verify Pagination and Stable Ordering (DESC NULLS LAST, bookingId ASC)
          const page1 = await controller.listTenantBookings(
            { page: 1, pageSize: 2 },
            identityA,
            TENANT_A,
            "req-integ-8",
          );
          expect(page1.data.items).toHaveLength(2);
          expect(page1.data.pagination.totalItems).toBe(3);
          expect(page1.data.pagination.totalPages).toBe(2);
          expect(page1.data.items[0]?.bookingId).toBe("bk-integ-003");
          expect(page1.data.items[1]?.bookingId).toBe("bk-integ-002");

          const page2 = await controller.listTenantBookings(
            { page: 2, pageSize: 2 },
            identityA,
            TENANT_A,
            "req-integ-9",
          );
          expect(page2.data.items).toHaveLength(1);
          expect(page2.data.pagination.totalItems).toBe(3);
          expect(page2.data.pagination.totalPages).toBe(2);
          expect(page2.data.items[0]?.bookingId).toBe("bk-integ-001");

          // Out-of-range page returns empty array with intact total
          const pageOutOfRange = await controller.listTenantBookings(
            { page: 99, pageSize: 2 },
            identityA,
            TENANT_A,
            "req-integ-10",
          );
          expect(pageOutOfRange.data.items).toHaveLength(0);
          expect(pageOutOfRange.data.pagination.totalItems).toBe(3);
          expect(pageOutOfRange.data.pagination.totalPages).toBe(2);

          // Clean up seeded records
          await pool.query(
            `DELETE FROM ops.phase1_owned_orders WHERE tenant_id IN ($1, $2) OR order_id LIKE 'integ-ord-%'`,
            [TENANT_A, TENANT_B],
          );
          await dbService.onModuleDestroy();
        } finally {
          await pool.end();
        }
      },
    );

    it.skipIf(!isDbConfigured)(
      "executes representative large-corpus (1003 own + 251 foreign) real PostgreSQL pagination, tie-breaking sort, cohort filtering, tenant isolation, and rehydrated second-instance mutation observation",
      async () => {
        const pool = new Pool({ connectionString: dbUrl });
        let dbService1: DatabaseService | undefined;
        let dbService2: DatabaseService | undefined;

        const TENANT_LARGE_A = "tenant-integ-large-alpha";
        const TENANT_LARGE_B = "tenant-integ-large-beta";
        const OWN_TOTAL = 1003;
        const FOREIGN_TOTAL = 251;

        try {
          const tableCheck = await pool.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'ops' AND table_name = 'phase1_owned_orders'`,
          );
          if (tableCheck.rowCount === 0) {
            throw new Error(
              "ops.phase1_owned_orders does not exist. Migrations must be run before this test.",
            );
          }

          await pool.query(
            `DELETE FROM ops.phase1_owned_orders WHERE tenant_id IN ($1, $2) OR order_id LIKE 'integ-lrg-%'`,
            [TENANT_LARGE_A, TENANT_LARGE_B],
          );

          type SeedRow = {
            orderId: string;
            orderNo: string;
            status: string;
            createdAt: string;
            record: Record<string, unknown>;
          };

          const baseSlotMs = Date.UTC(2026, 8, 20, 0, 0, 0); // 2026-09-20T00:00:00.000Z

          const buildOwnRow = (seqNum: number): SeedRow => {
            const seq = String(seqNum).padStart(4, "0");
            const orderId = `integ-lrg-own-${seq}`;
            const orderNo = `ORD-LRG-OWN-${seq}`;
            const bookingId = `bk-lrg-own-${seq}`;
            const slot = Math.floor((seqNum - 1) / 3);
            const slotStartMs = baseSlotMs - slot * 3_600_000;
            const reservationWindowStart = new Date(slotStartMs).toISOString();
            const reservationWindowEnd = new Date(
              slotStartMs + 3_600_000,
            ).toISOString();
            const createdAt = new Date(slotStartMs - 86_400_000).toISOString();

            const status =
              seqNum <= 200
                ? "completed"
                : seqNum <= 350
                  ? "cancelled"
                  : "dispatched";
            const isVipSearchCohort = seqNum <= 65;
            const isKeyPaxCohort = seqNum <= 12;
            const businessDispatchSubtype =
              seqNum <= 120 ? "vip_dispatch" : "enterprise_dispatch";

            return {
              orderId,
              orderNo,
              status,
              createdAt,
              record: {
                orderId,
                orderNo,
                status,
                tenantId: TENANT_LARGE_A,
                bookingId,
                bookingType: "oneway",
                serviceBucket: "business_dispatch",
                dispatchSemantics: "reservation",
                orderSource: "portal",
                orderDomain: "owned",
                businessDispatchSubtype,
                pickup: { address: "100 Innovation Way" },
                dropoff: { address: "200 Terminal Blvd" },
                passenger: {
                  passengerId: isKeyPaxCohort
                    ? "pax-lrg-key-cohort"
                    : `pax-lrg-own-${seq}`,
                  name: isVipSearchCohort
                    ? `CohortVIP_100%_Member_${seq}`
                    : `Standard Passenger ${seq}`,
                  phone: `+15551${seq}`,
                },
                costCenter: isVipSearchCohort ? "CC-VIP-100%" : "CC-STD",
                reservationWindowStart,
                reservationWindowEnd,
                approvalState: "not_required",
                approvalRequestIds: [],
                complianceFlags: [],
                fixedPrice: false,
                dispatchAttemptCount: 0,
                proofRequirements: {
                  minPhotoCount: 0,
                  signoffRequired: false,
                  expenseProofRequired: false,
                },
                reservationHoldStatus: "none",
                createdAt,
                updatedAt: createdAt,
              },
            };
          };

          // Scramble insertion order within each 3-record tie slot ([3, 1, 2]) so
          // physical table order differs from canonical tie-breaker (booking_id ASC).
          const seedRows: SeedRow[] = [];
          for (let base = 1; base <= OWN_TOTAL; base += 3) {
            if (base + 2 <= OWN_TOTAL) {
              seedRows.push(buildOwnRow(base + 2));
              seedRows.push(buildOwnRow(base));
              seedRows.push(buildOwnRow(base + 1));
            } else {
              for (let seqNum = base; seqNum <= OWN_TOTAL; seqNum += 1) {
                seedRows.push(buildOwnRow(seqNum));
              }
            }
          }

          for (let seqNum = 1; seqNum <= FOREIGN_TOTAL; seqNum += 1) {
            const seq = String(seqNum).padStart(4, "0");
            const orderId = `integ-lrg-foreign-${seq}`;
            const orderNo = `ORD-LRG-FOREIGN-${seq}`;
            const bookingId = `bk-lrg-foreign-${seq}`;
            const slot = Math.floor((seqNum - 1) / 3);
            const slotStartMs = baseSlotMs - slot * 3_600_000;
            const reservationWindowStart = new Date(slotStartMs).toISOString();
            const reservationWindowEnd = new Date(
              slotStartMs + 3_600_000,
            ).toISOString();
            const createdAt = new Date(slotStartMs - 86_400_000).toISOString();
            const status = seqNum <= 100 ? "completed" : "dispatched";

            seedRows.push({
              orderId,
              orderNo,
              status,
              createdAt,
              record: {
                orderId,
                orderNo,
                status,
                tenantId: TENANT_LARGE_B,
                bookingId,
                bookingType: "oneway",
                serviceBucket: "business_dispatch",
                dispatchSemantics: "reservation",
                orderSource: "portal",
                orderDomain: "owned",
                businessDispatchSubtype: "vip_dispatch",
                pickup: { address: "100 Foreign Way" },
                dropoff: { address: "200 Foreign Blvd" },
                passenger: {
                  passengerId: "pax-lrg-key-cohort",
                  name: `CohortVIP_100%_Foreign_${seq}`,
                  phone: `+15559${seq}`,
                },
                costCenter: "CC-VIP-100%",
                reservationWindowStart,
                reservationWindowEnd,
                approvalState: "not_required",
                approvalRequestIds: [],
                complianceFlags: [],
                fixedPrice: false,
                dispatchAttemptCount: 0,
                proofRequirements: {
                  minPhotoCount: 0,
                  signoffRequired: false,
                  expenseProofRequired: false,
                },
                reservationHoldStatus: "none",
                createdAt,
                updatedAt: createdAt,
              },
            });
          }

          const batchSize = 100;
          for (let offset = 0; offset < seedRows.length; offset += batchSize) {
            const chunk = seedRows.slice(offset, offset + batchSize);
            const placeholders: string[] = [];
            const params: unknown[] = [];
            chunk.forEach((row, idx) => {
              const b = idx * 6;
              placeholders.push(
                `($${b + 1}, $${b + 2}, $${b + 3}, 'enterprise', 'tenant_booking', 'scheduled', $${b + 4}, $${b + 5}, $${b + 6}::jsonb)`,
              );
              params.push(
                row.orderId,
                row.orderNo,
                row.status,
                row.createdAt,
                row.createdAt,
                JSON.stringify(row.record),
              );
            });

            await pool.query(
              `INSERT INTO ops.phase1_owned_orders (
                order_id, order_no, status, order_source, service_bucket,
                dispatch_semantics, created_at, updated_at, record
              ) VALUES ${placeholders.join(", ")}`,
              params,
            );
          }

          process.env.DATABASE_URL = dbUrl;
          dbService1 = new DatabaseService();
          const repository1 = new OwnedMobilityRepository(dbService1);
          expect(repository1.isEnabled()).toBe(true);
          expect(repository1.isDatabaseEnabled()).toBe(true);

          const service1 = new OwnedMobilityService(
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined,
            repository1,
          );
          const controller1 = new OwnedMobilityController(
            service1,
            undefined as never,
          );

          const identityA = makeTenantIdentity(TENANT_LARGE_A);
          const identityB = makeTenantIdentity(TENANT_LARGE_B);

          // 1. Traverse all 10 full pages (100 items each) + 1 partial last page (3 items)
          const expectedOwnBookingIds = Array.from(
            { length: OWN_TOTAL },
            (_, idx) => `bk-lrg-own-${String(idx + 1).padStart(4, "0")}`,
          );
          const collectedOwnBookingIds: string[] = [];
          const collectedOwnItems: Array<{
            bookingId: string;
            tenantId: string;
            reservationWindowStart: string;
          }> = [];

          for (let page = 1; page <= 11; page += 1) {
            const pageRes = await controller1.listTenantBookings(
              { page, pageSize: 100 },
              identityA,
              TENANT_LARGE_A,
              `req-lrg-own-p${page}`,
            );
            const expectedPageLen = page < 11 ? 100 : 3;
            expect(pageRes.data.items).toHaveLength(expectedPageLen);
            expect(pageRes.data.pagination).toEqual({
              page,
              pageSize: 100,
              totalItems: OWN_TOTAL,
              totalPages: 11,
            });
            expect(pageRes.data.pageInfo).toEqual(pageRes.data.pagination);

            for (const item of pageRes.data.items) {
              expect(item.tenantId).toBe(TENANT_LARGE_A);
              expect(item.bookingId.startsWith("bk-lrg-foreign-")).toBe(false);
              collectedOwnBookingIds.push(item.bookingId);
              collectedOwnItems.push({
                bookingId: item.bookingId,
                tenantId: item.tenantId,
                reservationWindowStart: item.reservationWindowStart,
              });
            }
          }

          expect(collectedOwnBookingIds).toHaveLength(OWN_TOTAL);
          expect(new Set(collectedOwnBookingIds).size).toBe(OWN_TOTAL);
          expect(collectedOwnBookingIds).toEqual(expectedOwnBookingIds);

          // Verify tie-breaking within Page 1 (slot 0: 0001, 0002, 0003) and across Page 1->2 boundary (slot 33: 0100, 0101, 0102)
          expect(collectedOwnItems[0]?.reservationWindowStart).toBe(
            "2026-09-20T00:00:00.000Z",
          );
          expect(collectedOwnItems[1]?.reservationWindowStart).toBe(
            "2026-09-20T00:00:00.000Z",
          );
          expect(collectedOwnItems[2]?.reservationWindowStart).toBe(
            "2026-09-20T00:00:00.000Z",
          );
          expect(collectedOwnItems.slice(0, 3).map((i) => i.bookingId)).toEqual(
            ["bk-lrg-own-0001", "bk-lrg-own-0002", "bk-lrg-own-0003"],
          );

          expect(collectedOwnItems[99]?.reservationWindowStart).toBe(
            "2026-09-18T15:00:00.000Z",
          );
          expect(collectedOwnItems[100]?.reservationWindowStart).toBe(
            "2026-09-18T15:00:00.000Z",
          );
          expect(collectedOwnItems[101]?.reservationWindowStart).toBe(
            "2026-09-18T15:00:00.000Z",
          );
          expect(
            collectedOwnItems.slice(99, 102).map((i) => i.bookingId),
          ).toEqual(["bk-lrg-own-0100", "bk-lrg-own-0101", "bk-lrg-own-0102"]);

          // Out-of-range page on large corpus preserves authoritative totalItems/totalPages
          const outOfRangeOwn = await controller1.listTenantBookings(
            { page: 12, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-own-p12",
          );
          expect(outOfRangeOwn.data.items).toHaveLength(0);
          expect(outOfRangeOwn.data.pagination).toEqual({
            page: 12,
            pageSize: 100,
            totalItems: OWN_TOTAL,
            totalPages: 11,
          });

          // 2. Authoritative cohort filters, literal wildcard search, date range, and filter clear
          const completedP1 = await controller1.listTenantBookings(
            { status: "completed", page: 1, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-completed-p1",
          );
          const completedP2 = await controller1.listTenantBookings(
            { status: "completed", page: 2, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-completed-p2",
          );
          expect(completedP1.data.pagination.totalItems).toBe(200);
          expect(completedP1.data.pagination.totalPages).toBe(2);
          expect([
            ...completedP1.data.items.map((i) => i.bookingId),
            ...completedP2.data.items.map((i) => i.bookingId),
          ]).toEqual(expectedOwnBookingIds.slice(0, 200));

          const cancelledP1 = await controller1.listTenantBookings(
            { status: "cancelled", page: 1, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-cancelled-p1",
          );
          const cancelledP2 = await controller1.listTenantBookings(
            { status: "cancelled", page: 2, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-cancelled-p2",
          );
          expect(cancelledP1.data.pagination.totalItems).toBe(150);
          expect(cancelledP1.data.pagination.totalPages).toBe(2);
          expect(cancelledP1.data.items).toHaveLength(100);
          expect(cancelledP2.data.items).toHaveLength(50);
          expect([
            ...cancelledP1.data.items.map((i) => i.bookingId),
            ...cancelledP2.data.items.map((i) => i.bookingId),
          ]).toEqual(expectedOwnBookingIds.slice(200, 350));

          const activeP1 = await controller1.listTenantBookings(
            { status: "active", page: 1, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-active-p1",
          );
          expect(activeP1.data.pagination.totalItems).toBe(653);
          expect(activeP1.data.pagination.totalPages).toBe(7);
          expect(activeP1.data.items[0]?.bookingId).toBe("bk-lrg-own-0351");

          const vipSearchP1 = await controller1.listTenantBookings(
            { q: "CohortVIP_100%", page: 1, pageSize: 50 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-vip-p1",
          );
          const vipSearchP2 = await controller1.listTenantBookings(
            { q: "CohortVIP_100%", page: 2, pageSize: 50 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-vip-p2",
          );
          expect(vipSearchP1.data.pagination.totalItems).toBe(65);
          expect(vipSearchP1.data.pagination.totalPages).toBe(2);
          expect(vipSearchP1.data.items).toHaveLength(50);
          expect(vipSearchP2.data.items).toHaveLength(15);
          expect([
            ...vipSearchP1.data.items.map((i) => i.bookingId),
            ...vipSearchP2.data.items.map((i) => i.bookingId),
          ]).toEqual(expectedOwnBookingIds.slice(0, 65));

          const keyPaxRes = await controller1.listTenantBookings(
            { passengerId: "pax-lrg-key-cohort", page: 1, pageSize: 20 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-key-pax",
          );
          expect(keyPaxRes.data.pagination.totalItems).toBe(12);
          expect(keyPaxRes.data.pagination.totalPages).toBe(1);
          expect(keyPaxRes.data.items.map((i) => i.bookingId)).toEqual(
            expectedOwnBookingIds.slice(0, 12),
          );

          const dateCohortRes = await controller1.listTenantBookings(
            {
              dateField: "reservationStart",
              dateFrom: "2026-09-18T15:00:00.000Z",
              dateTo: "2026-09-20T00:00:00.000Z",
              page: 1,
              pageSize: 100,
            },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-date-cohort",
          );
          expect(dateCohortRes.data.pagination.totalItems).toBe(99);
          expect(dateCohortRes.data.pagination.totalPages).toBe(1);
          expect(dateCohortRes.data.items.map((i) => i.bookingId)).toEqual(
            expectedOwnBookingIds.slice(3, 102),
          );

          const subtypeP1 = await controller1.listTenantBookings(
            {
              subtype: "vip_dispatch",
              dateField: "createdAt",
              page: 1,
              pageSize: 100,
            },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-subtype-p1",
          );
          const subtypeP2 = await controller1.listTenantBookings(
            {
              subtype: "vip_dispatch",
              dateField: "createdAt",
              page: 2,
              pageSize: 100,
            },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-subtype-p2",
          );
          expect(subtypeP1.data.pagination.totalItems).toBe(120);
          expect(subtypeP1.data.pagination.totalPages).toBe(2);
          expect(subtypeP1.data.items).toHaveLength(100);
          expect(subtypeP2.data.items).toHaveLength(20);
          expect([
            ...subtypeP1.data.items.map((i) => i.bookingId),
            ...subtypeP2.data.items.map((i) => i.bookingId),
          ]).toEqual(expectedOwnBookingIds.slice(0, 120));

          // Clear filters (unfiltered query equivalent) restores full 1003 corpus
          const clearedRes = await controller1.listTenantBookings(
            { page: 1, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-cleared",
          );
          expect(clearedRes.data.pagination.totalItems).toBe(OWN_TOTAL);
          expect(clearedRes.data.pagination.totalPages).toBe(11);
          expect(clearedRes.data.items.map((i) => i.bookingId)).toEqual(
            expectedOwnBookingIds.slice(0, 100),
          );

          // 3. Foreign corpus pagination (251 items: 100 + 100 + 51) & cross-tenant access rejection
          const expectedForeignBookingIds = Array.from(
            { length: FOREIGN_TOTAL },
            (_, idx) => `bk-lrg-foreign-${String(idx + 1).padStart(4, "0")}`,
          );
          const collectedForeignBookingIds: string[] = [];
          for (let page = 1; page <= 3; page += 1) {
            const foreignPage = await controller1.listTenantBookings(
              { page, pageSize: 100 },
              identityB,
              TENANT_LARGE_B,
              `req-lrg-foreign-p${page}`,
            );
            expect(foreignPage.data.items).toHaveLength(page < 3 ? 100 : 51);
            expect(foreignPage.data.pagination).toEqual({
              page,
              pageSize: 100,
              totalItems: FOREIGN_TOTAL,
              totalPages: 3,
            });
            for (const item of foreignPage.data.items) {
              expect(item.tenantId).toBe(TENANT_LARGE_B);
              collectedForeignBookingIds.push(item.bookingId);
            }
          }
          expect(collectedForeignBookingIds).toEqual(expectedForeignBookingIds);

          await expect(
            controller1.listTenantBookings(
              { page: 1, pageSize: 20 },
              identityB,
              TENANT_LARGE_A,
              "req-lrg-cross-b-to-a",
            ),
          ).rejects.toThrowError(
            expect.objectContaining({
              code: "TENANT_SCOPE_MISMATCH",
              status: 403,
            }),
          );

          await expect(
            controller1.listTenantBookings(
              { page: 1, pageSize: 20 },
              identityA,
              TENANT_LARGE_B,
              "req-lrg-cross-a-to-b",
            ),
          ).rejects.toThrowError(
            expect.objectContaining({
              code: "TENANT_SCOPE_MISMATCH",
              status: 403,
            }),
          );

          // 4. Rehydrate a separate production service/repository instance and observe persisted row mutation
          await pool.query(
            `UPDATE ops.phase1_owned_orders
             SET status = 'completed',
                 record = jsonb_set(
                   jsonb_set(
                     jsonb_set(record, '{status}', '"completed"'),
                     '{reservationWindowStart}',
                     '"2026-09-21T00:00:00.000Z"'
                   ),
                   '{reservationWindowEnd}',
                   '"2026-09-21T01:00:00.000Z"'
                 ),
                 updated_at = now()
             WHERE order_id = 'integ-lrg-own-1003'`,
          );

          dbService2 = new DatabaseService();
          const repository2 = new OwnedMobilityRepository(dbService2);
          expect(repository2.isEnabled()).toBe(true);
          const service2 = new OwnedMobilityService(
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined,
            repository2,
          );
          const controller2 = new OwnedMobilityController(
            service2,
            undefined as never,
          );

          const rehydratedPage1 = await controller2.listTenantBookings(
            { page: 1, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-rehydrated-p1",
          );
          expect(rehydratedPage1.data.pagination.totalItems).toBe(OWN_TOTAL);
          expect(rehydratedPage1.data.pagination.totalPages).toBe(11);
          expect(rehydratedPage1.data.items[0]?.bookingId).toBe(
            "bk-lrg-own-1003",
          );
          expect(rehydratedPage1.data.items[0]?.status).toBe("completed");
          expect(rehydratedPage1.data.items[1]?.bookingId).toBe(
            "bk-lrg-own-0001",
          );

          const rehydratedPage11 = await controller2.listTenantBookings(
            { page: 11, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-rehydrated-p11",
          );
          expect(rehydratedPage11.data.items.map((i) => i.bookingId)).toEqual([
            "bk-lrg-own-1000",
            "bk-lrg-own-1001",
            "bk-lrg-own-1002",
          ]);

          const rehydratedCompletedP1 = await controller2.listTenantBookings(
            { status: "completed", page: 1, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-rehydrated-completed-p1",
          );
          const rehydratedCompletedP3 = await controller2.listTenantBookings(
            { status: "completed", page: 3, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-rehydrated-completed-p3",
          );
          expect(rehydratedCompletedP1.data.pagination.totalItems).toBe(201);
          expect(rehydratedCompletedP1.data.pagination.totalPages).toBe(3);
          expect(rehydratedCompletedP1.data.items[0]?.bookingId).toBe(
            "bk-lrg-own-1003",
          );
          expect(
            rehydratedCompletedP3.data.items.map((i) => i.bookingId),
          ).toEqual(["bk-lrg-own-0200"]);

          const rehydratedActive = await controller2.listTenantBookings(
            { status: "active", page: 1, pageSize: 100 },
            identityA,
            TENANT_LARGE_A,
            "req-lrg-rehydrated-active",
          );
          expect(rehydratedActive.data.pagination.totalItems).toBe(652);
          expect(rehydratedActive.data.pagination.totalPages).toBe(7);
        } finally {
          await pool.query(
            `DELETE FROM ops.phase1_owned_orders WHERE tenant_id IN ($1, $2) OR order_id LIKE 'integ-lrg-%'`,
            [TENANT_LARGE_A, TENANT_LARGE_B],
          );
          if (dbService1) {
            await dbService1.onModuleDestroy();
          }
          if (dbService2) {
            await dbService2.onModuleDestroy();
          }
          await pool.end();
        }
      },
      60_000,
    );
  });
});
