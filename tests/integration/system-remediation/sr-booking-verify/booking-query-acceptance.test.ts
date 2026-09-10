import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import type { TenantBookingListQuery } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import { OwnedMobilityController } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityModule } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.module";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");

function makeTenantIdentity(tenantId: string): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    realm: "tenant",
    actorType: "tenant_user",
    actorId: `user-${tenantId}`,
    tenantId,
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: [],
    requestId: "req-test-auth",
  };
}

const dbUrl =
  process.env.DRTS_BOOKING_VERIFY_DATABASE_URL || process.env.DATABASE_URL;

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

      expect(
        typeof OwnedMobilityController.prototype.listTenantBookings,
      ).toBe("function");
    });
  });

  describe("Real PostgreSQL Acceptance Matrix", () => {
    it.runIf(Boolean(dbUrl))(
      "executes real PostgreSQL multi-tenant booking query with filtering, sorting, pagination, and second-instance mutation observation",
      async () => {
        const pool = new Pool({ connectionString: dbUrl });

        try {
          // 1. Prepare schema and test table
          await pool.query(`CREATE SCHEMA IF NOT EXISTS ops;`);
          await pool.query(`
            CREATE TABLE IF NOT EXISTS ops.phase1_owned_orders (
              order_id varchar(100) PRIMARY KEY,
              order_no varchar(100) NOT NULL UNIQUE,
              status varchar(50) NOT NULL,
              order_source varchar(50) NOT NULL,
              service_bucket varchar(50) NOT NULL,
              dispatch_semantics varchar(50) NOT NULL,
              created_at timestamptz NOT NULL,
              updated_at timestamptz NOT NULL,
              record jsonb NOT NULL,
              tenant_id varchar(100) GENERATED ALWAYS AS (NULLIF(record ->> 'tenantId', '')) STORED,
              booking_id varchar(100) GENERATED ALWAYS AS (NULLIF(record ->> 'bookingId', '')) STORED
            );
            CREATE INDEX IF NOT EXISTS idx_phase1_owned_orders_tenant_booking
              ON ops.phase1_owned_orders (tenant_id, booking_id, updated_at DESC)
              WHERE booking_id IS NOT NULL;
          `);

          const TENANT_A = "corp-tenant-a";
          const TENANT_B = "corp-tenant-b";

          // Clean up any test records from prior runs
          await pool.query(
            `DELETE FROM ops.phase1_owned_orders WHERE tenant_id IN ($1, $2) OR order_id LIKE 'integ-ord-%'`,
            [TENANT_A, TENANT_B],
          );

          // Seed test orders for Tenant A and Tenant B
          const seedOrders = [
            {
              orderId: "integ-ord-1",
              orderNo: "ORD-NO-001",
              status: "dispatched",
              tenantId: TENANT_A,
              bookingId: "bk-integ-001",
              passenger: {
                passengerId: "pax-alice",
                name: "Alice Wonderland",
                phone: "+886911111111",
              },
              reservationWindowStart: "2026-09-10T10:00:00.000Z",
              reservationWindowEnd: "2026-09-10T11:00:00.000Z",
              createdAt: "2026-09-09T01:00:00.000Z",
            },
            {
              orderId: "integ-ord-2",
              orderNo: "ORD-NO-002",
              status: "completed",
              tenantId: TENANT_A,
              bookingId: "bk-integ-002",
              passenger: {
                passengerId: "pax-bob",
                name: "Bob Builder",
                phone: "+886922222222",
              },
              reservationWindowStart: "2026-09-11T14:00:00.000Z",
              reservationWindowEnd: "2026-09-11T15:00:00.000Z",
              createdAt: "2026-09-09T02:00:00.000Z",
            },
            {
              orderId: "integ-ord-3",
              orderNo: "ORD-NO-003",
              status: "cancelled",
              tenantId: TENANT_A,
              bookingId: "bk-integ-003",
              passenger: {
                passengerId: "pax-charlie",
                name: "Charlie 100% Specialist",
                phone: "+886933333333",
              },
              reservationWindowStart: "2026-09-12T08:00:00.000Z",
              reservationWindowEnd: "2026-09-12T09:00:00.000Z",
              createdAt: "2026-09-09T03:00:00.000Z",
            },
            {
              orderId: "integ-ord-4",
              orderNo: "ORD-NO-004",
              status: "assigned",
              tenantId: TENANT_B,
              bookingId: "bk-integ-004",
              passenger: {
                passengerId: "pax-david",
                name: "David TenantB",
                phone: "+886944444444",
              },
              reservationWindowStart: "2026-09-10T12:00:00.000Z",
              reservationWindowEnd: "2026-09-10T13:00:00.000Z",
              createdAt: "2026-09-09T04:00:00.000Z",
            },
          ];

          for (const ord of seedOrders) {
            const record = {
              orderId: ord.orderId,
              orderNo: ord.orderNo,
              status: ord.status,
              tenantId: ord.tenantId,
              bookingId: ord.bookingId,
              businessDispatchSubtype: "enterprise_dispatch",
              pickup: { address: "100 Innovation Way" },
              dropoff: { address: "200 Terminal Blvd" },
              passenger: ord.passenger,
              reservationWindowStart: ord.reservationWindowStart,
              reservationWindowEnd: ord.reservationWindowEnd,
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
          expect(repository.isDatabaseEnabled()).toBe(true);

          const service = new OwnedMobilityService(
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
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
          expect(wildcardSearchRes.data.items[0]?.bookingId).toBe("bk-integ-003");

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
  });
});
