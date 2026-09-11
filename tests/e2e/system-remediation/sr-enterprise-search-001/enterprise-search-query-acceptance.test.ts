import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import { OwnedMobilityController } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import {
  buildEnterpriseBookingSearchQuery,
  DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
  hasActiveEnterpriseBookingFilters,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-booking-search";

// This suite proves the exact link SR-BOOKING-VERIFY's own acceptance could
// not: that the enterprise-dispatch-web frontend's real query-composition
// function (buildEnterpriseBookingSearchQuery), not a hand-written raw query
// object, drives the real, unmocked OwnedMobilityController/Service against
// a real migrated PostgreSQL and returns combined-filter/clear/pagination/
// empty-state totals that are internally consistent. It does not start an
// HTTP listener or a browser — see docs/04-uat/system-remediation-20260906/
// SR-ENTERPRISE-SEARCH-001.md for why a full browser/HTTP acceptance runner
// was scoped out of this task and what evidence gap that leaves.

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

// Ordinary unit/smoke jobs expose an unmigrated shared DATABASE_URL. Real
// acceptance is guarded by a dedicated URL, explicitly provided by the
// enterprise-search-acceptance workflow only.
const dbUrl = process.env.DRTS_ENTERPRISE_SEARCH_DATABASE_URL;
const isDbConfigured = Boolean(dbUrl);

describe("SR-ENTERPRISE-SEARCH-001 Frontend Query -> Real Backend Acceptance", () => {
  it.skipIf(!isDbConfigured)(
    "combined passenger/status/date filters, clear, pagination, and empty state all resolve to authoritative server totals",
    async () => {
      const pool = new Pool({ connectionString: dbUrl });

      try {
        const tableCheck = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'ops' AND table_name = 'phase1_owned_orders'`,
        );
        if (tableCheck.rowCount === 0) {
          throw new Error(
            "ops.phase1_owned_orders does not exist. Migrations must be run before this test.",
          );
        }

        const TENANT = "tenant-ent-search-integ";

        await pool.query(
          `DELETE FROM ops.phase1_owned_orders WHERE tenant_id = $1 OR order_id LIKE 'entq-ord-%'`,
          [TENANT],
        );

        const seedOrders = [
          {
            orderId: "entq-ord-1",
            bookingId: "bkq-ent-1",
            status: "dispatched", // -> booking status "active"
            passengerName: "Alice Search",
            reservationWindowStart: "2026-09-10T08:00:00.000Z",
            createdAt: "2026-09-09T10:00:00.000Z",
          },
          {
            orderId: "entq-ord-2",
            bookingId: "bkq-ent-2",
            status: "completed",
            passengerName: "Bob Search",
            reservationWindowStart: "2026-09-11T09:00:00.000Z",
            createdAt: "2026-09-09T11:00:00.000Z",
          },
          {
            orderId: "entq-ord-3",
            bookingId: "bkq-ent-3",
            status: "cancelled",
            passengerName: "Carol Search",
            reservationWindowStart: "2026-09-12T09:00:00.000Z",
            createdAt: "2026-09-09T12:00:00.000Z",
          },
          {
            orderId: "entq-ord-4",
            bookingId: "bkq-ent-4",
            status: "dispatched",
            passengerName: "Dave Other",
            reservationWindowStart: "2026-09-20T09:00:00.000Z",
            createdAt: "2026-09-09T13:00:00.000Z",
          },
          {
            orderId: "entq-ord-5",
            bookingId: "bkq-ent-5",
            status: "dispatched",
            passengerName: "Eve Search",
            reservationWindowStart: "2026-09-11T10:00:00.000Z",
            createdAt: "2026-09-09T14:00:00.000Z",
          },
        ];

        for (const ord of seedOrders) {
          const record = {
            orderId: ord.orderId,
            orderNo: `ORD-${ord.orderId}`,
            status: ord.status,
            tenantId: TENANT,
            bookingId: ord.bookingId,
            bookingType: "oneway",
            serviceBucket: "business_dispatch",
            dispatchSemantics: "reservation",
            orderSource: "portal",
            orderDomain: "owned",
            businessDispatchSubtype: "enterprise_dispatch",
            pickup: { address: "100 Innovation Way" },
            dropoff: { address: "200 Terminal Blvd" },
            passenger: {
              passengerId: `pax-${ord.bookingId}`,
              name: ord.passengerName,
              phone: "+1555000",
            },
            reservationWindowStart: ord.reservationWindowStart,
            reservationWindowEnd: ord.reservationWindowStart,
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
              `ORD-${ord.orderId}`,
              ord.status,
              ord.createdAt,
              ord.createdAt,
              JSON.stringify(record),
            ],
          );
        }

        process.env.DATABASE_URL = dbUrl;
        const dbService = new DatabaseService();
        const repository = new OwnedMobilityRepository(dbService);
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
        const identity = makeTenantIdentity(TENANT);

        async function search(
          filters: Parameters<typeof buildEnterpriseBookingSearchQuery>[0],
          page: number,
          pageSize: number,
        ) {
          const query = buildEnterpriseBookingSearchQuery(
            filters,
            page,
            pageSize,
            "Asia/Taipei",
          );
          const response = await controller.listTenantBookings(
            query,
            identity,
            TENANT,
            "req-ent-search",
          );
          return response.data;
        }

        // 1. Clear filters: the frontend's "no filters" state must return the
        // full authoritative total, not a page-local subset masquerading as
        // global truth.
        expect(hasActiveEnterpriseBookingFilters(
          DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
        )).toBe(false);
        const cleared = await search(
          DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
          1,
          20,
        );
        expect(cleared.pagination.totalItems).toBe(5);
        expect(cleared.items).toHaveLength(5);

        // 2. Passenger-only filter.
        const passengerOnly = await search(
          { ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS, passenger: "Search" },
          1,
          20,
        );
        expect(passengerOnly.pagination.totalItems).toBe(4);
        expect(
          passengerOnly.items.map((b) => b.bookingId).sort(),
        ).toEqual(
          ["bkq-ent-1", "bkq-ent-2", "bkq-ent-3", "bkq-ent-5"].sort(),
        );

        // 3. Status-only filter.
        const cancelledOnly = await search(
          { ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS, status: "cancelled" },
          1,
          20,
        );
        expect(cancelledOnly.pagination.totalItems).toBe(1);
        expect(cancelledOnly.items[0]?.bookingId).toBe("bkq-ent-3");

        // 4. Combined passenger + status + date-range filter (calendar dates
        // converted to explicit start-inclusive/end-exclusive instants by
        // the frontend's own query builder — not hand-crafted here).
        const combined = await search(
          {
            passenger: "Search",
            status: "active",
            dateFrom: "2026-09-10",
            dateTo: "2026-09-11",
          },
          1,
          20,
        );
        expect(combined.pagination.totalItems).toBe(2);
        expect(combined.items.map((b) => b.bookingId).sort()).toEqual(
          ["bkq-ent-1", "bkq-ent-5"].sort(),
        );

        // 5. Pagination over the combined result set: stable DESC-by-date
        // ordering, correct totals on every page, no duplicate/omitted rows.
        const combinedFilters = {
          passenger: "Search",
          status: "active" as const,
          dateFrom: "2026-09-10",
          dateTo: "2026-09-11",
        };
        const page1 = await search(combinedFilters, 1, 1);
        expect(page1.items).toHaveLength(1);
        expect(page1.pagination.totalItems).toBe(2);
        expect(page1.pagination.totalPages).toBe(2);
        expect(page1.items[0]?.bookingId).toBe("bkq-ent-5");

        const page2 = await search(combinedFilters, 2, 1);
        expect(page2.items).toHaveLength(1);
        expect(page2.pagination.totalItems).toBe(2);
        expect(page2.items[0]?.bookingId).toBe("bkq-ent-1");

        // 6. Filtered empty state: zero rows but the total stays exact (0),
        // never crashes or falls back to an unfiltered list.
        const noMatch = await search(
          { ...DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS, passenger: "NoSuchPassengerXYZ" },
          1,
          20,
        );
        expect(noMatch.items).toHaveLength(0);
        expect(noMatch.pagination.totalItems).toBe(0);
        expect(noMatch.pagination.totalPages).toBe(0);

        // 7. Clearing again after filtering restores the full total exactly
        // (round-trip: filter -> clear must not leak stale filtered state).
        const clearedAgain = await search(
          DEFAULT_ENTERPRISE_BOOKING_SEARCH_FILTERS,
          1,
          20,
        );
        expect(clearedAgain.pagination.totalItems).toBe(5);

        await pool.query(
          `DELETE FROM ops.phase1_owned_orders WHERE tenant_id = $1 OR order_id LIKE 'entq-ord-%'`,
          [TENANT],
        );
        await dbService.onModuleDestroy();
      } finally {
        await pool.end();
      }
    },
  );
});
