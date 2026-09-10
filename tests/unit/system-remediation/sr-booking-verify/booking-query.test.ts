import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { OwnedMobilityController } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import type {
  BookingRecord,
  CreateTenantBookingCommand,
  OwnedOrderRecord,
} from "@drts/contracts";
import {
  BOOKING_STATUSES,
  convertCalendarRangeToInstantRange,
  DEFAULT_PRODUCT_TIMEZONE,
  isIso8601InstantWithTimezone,
} from "@drts/contracts";
import { DrtsApiClient } from "../../../../packages/api-client/src";

function makeTenantIdentity(
  tenantId: string,
  actorId = "user-001",
  actorType = "tenant_admin",
  realm: "tenant" | "platform" = "tenant",
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType,
    actorId,
    realm,
    tenantId,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    roleFamilies: [realm],
    roles: [actorType],
    scopes: ["tenant:read", "tenant:write"],
    drtsPassengerId: null,
    requestId: "req-unit-test",
  };
}

function makePlatformIdentity(
  actorId = "super-admin",
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId,
    realm: "platform",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    roleFamilies: ["platform"],
    roles: ["superadmin"],
    scopes: ["foundation:read", "foundation:write", "tenant:read"],
    drtsPassengerId: null,
    requestId: "req-platform-test",
  };
}

function createSampleBookingCommand(
  overrides?: Partial<CreateTenantBookingCommand>,
): CreateTenantBookingCommand {
  return {
    bookingType: "oneway",
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: "2026-09-10T10:00:00.000Z",
    reservationWindowEnd: "2026-09-10T11:00:00.000Z",
    pickup: {
      address: "100 Innovation Way, Taipei",
      addressLine1: "100 Innovation Way",
      city: "Taipei",
      postalCode: "100",
      country: "TW",
    },
    dropoff: {
      address: "200 Terminal Blvd, Taoyuan",
      addressLine1: "200 Terminal Blvd",
      city: "Taoyuan",
      postalCode: "337",
      country: "TW",
    },
    passenger: {
      passengerId: "pass-001",
      name: "Alice Wang",
      phone: "+886912345678",
    },
    costCenter: "CC-ENGINEERING",
    ...overrides,
  };
}

describe("SR-BOOKING-VERIFY: Unit Tests", () => {
  const TENANT_A = "tenant-alpha";
  const TENANT_B = "tenant-beta";

  describe("Calendar date helpers (@drts/contracts)", () => {
    it("converts inclusive calendar date range to explicit timezone instants", () => {
      const result = convertCalendarRangeToInstantRange(
        "2026-09-10",
        "2026-09-12",
      );
      expect(result.timeZone).toBe(DEFAULT_PRODUCT_TIMEZONE);
      expect(result.dateFrom).toBe("2026-09-10T00:00:00+08:00");
      // End date 2026-09-12 inclusive converts to next-day 2026-09-13 exclusive
      expect(result.dateTo).toBe("2026-09-13T00:00:00+08:00");
    });

    it("validates explicit ISO 8601 instant with timezone", () => {
      expect(isIso8601InstantWithTimezone("2026-09-10T00:00:00Z")).toBe(true);
      expect(isIso8601InstantWithTimezone("2026-09-10T08:00:00+08:00")).toBe(
        true,
      );
      expect(
        isIso8601InstantWithTimezone("2026-09-10T12:00:00.000-05:00"),
      ).toBe(true);

      // Ambiguous timestamps lacking timezone offset must be rejected
      expect(isIso8601InstantWithTimezone("2026-09-10")).toBe(false);
      expect(isIso8601InstantWithTimezone("2026-09-10T12:00:00")).toBe(false);
      expect(isIso8601InstantWithTimezone("invalid-date")).toBe(false);
    });
  });

  describe("Tenant isolation & authentication", () => {
    it("rejects anonymous caller with 401 AUTH_REQUIRED", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );

      await expect(
        controller.listTenantBookings(
          {},
          null, // anonymous
          TENANT_A,
          "req-1",
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "AUTH_REQUIRED",
          status: 401,
        }),
      );
    });

    it("rejects mismatched tenant JWT with 403 TENANT_SCOPE_MISMATCH", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityB = makeTenantIdentity(TENANT_B);

      await expect(
        controller.listTenantBookings(
          {},
          identityB, // Tenant B identity
          TENANT_A, // Requesting Tenant A
          "req-2",
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "TENANT_SCOPE_MISMATCH",
          status: 403,
        }),
      );
    });

    it("rejects missing x-tenant-id header with 400 TENANT_ID_REQUIRED", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await expect(
        controller.listTenantBookings(
          {},
          identityA,
          undefined, // missing header
          "req-3",
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "TENANT_ID_REQUIRED",
          status: 400,
        }),
      );
    });

    it("allows valid same-tenant caller to query bookings", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await service.createTenantBooking(
        createSampleBookingCommand(),
        TENANT_A,
        identityA,
      );

      const response = await controller.listTenantBookings(
        {},
        identityA,
        TENANT_A,
        "req-4",
      );
      expect(response.data.items).toHaveLength(1);
      expect(response.data.items[0]?.tenantId).toBe(TENANT_A);
      expect(response.data.pagination.totalItems).toBe(1);
    });

    it("allows platform admin identity to access tenant bookings", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const platformIdentity = makePlatformIdentity();

      await service.createTenantBooking(
        createSampleBookingCommand(),
        TENANT_A,
        platformIdentity,
      );

      const response = await controller.listTenantBookings(
        {},
        platformIdentity,
        TENANT_A,
        "req-5",
      );
      expect(response.data.items).toHaveLength(1);
    });
  });

  describe("Query parameter validation (HTTP 400s)", () => {
    it("rejects invalid dateField with 400 INVALID_DATE_FIELD", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await expect(
        controller.listTenantBookings(
          { dateField: "modifiedAt" as never },
          identityA,
          TENANT_A,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_DATE_FIELD",
          status: 400,
        }),
      );
    });

    it("rejects ambiguous dateFrom without timezone offset with 400 INVALID_DATE_BOUNDS", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await expect(
        controller.listTenantBookings(
          { dateFrom: "2026-09-10" },
          identityA,
          TENANT_A,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_DATE_BOUNDS",
          status: 400,
        }),
      );
    });

    it("rejects reversed date bounds (dateFrom >= dateTo) with 400 INVALID_DATE_RANGE", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await expect(
        controller.listTenantBookings(
          {
            dateFrom: "2026-09-12T00:00:00Z",
            dateTo: "2026-09-10T00:00:00Z",
          },
          identityA,
          TENANT_A,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_DATE_RANGE",
          status: 400,
        }),
      );
    });

    it("rejects non-integer or < 1 page with 400 INVALID_PAGE", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await expect(
        controller.listTenantBookings({ page: 0 }, identityA, TENANT_A),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_PAGE",
          status: 400,
        }),
      );

      await expect(
        controller.listTenantBookings({ page: "abc" }, identityA, TENANT_A),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_PAGE",
          status: 400,
        }),
      );
    });

    it("rejects pageSize < 1 or > 100 with 400 INVALID_PAGE_SIZE", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await expect(
        controller.listTenantBookings({ pageSize: 0 }, identityA, TENANT_A),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_PAGE_SIZE",
          status: 400,
        }),
      );

      await expect(
        controller.listTenantBookings({ pageSize: 101 }, identityA, TENANT_A),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_PAGE_SIZE",
          status: 400,
        }),
      );
    });

    it("rejects unrecognized status value with 400 INVALID_STATUS", async () => {
      const service = new OwnedMobilityService();
      const controller = new OwnedMobilityController(
        service,
        undefined as never,
      );
      const identityA = makeTenantIdentity(TENANT_A);

      await expect(
        controller.listTenantBookings(
          { status: "bogus_status" },
          identityA,
          TENANT_A,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "INVALID_STATUS",
          status: 400,
        }),
      );
    });
  });

  describe("Query filtering, ordering, and pagination logic", () => {
    it("filters by date boundaries with start inclusive and end exclusive", async () => {
      const service = new OwnedMobilityService();
      const identityA = makeTenantIdentity(TENANT_A);

      // Booking 1: 2026-09-10T10:00:00Z
      await service.createTenantBooking(
        createSampleBookingCommand({
          reservationWindowStart: "2026-09-10T10:00:00.000Z",
          reservationWindowEnd: "2026-09-10T11:00:00.000Z",
        }),
        TENANT_A,
        identityA,
      );
      // Booking 2: 2026-09-11T10:00:00Z
      await service.createTenantBooking(
        createSampleBookingCommand({
          reservationWindowStart: "2026-09-11T10:00:00.000Z",
          reservationWindowEnd: "2026-09-11T11:00:00.000Z",
        }),
        TENANT_A,
        identityA,
      );
      // Booking 3: 2026-09-12T10:00:00Z
      await service.createTenantBooking(
        createSampleBookingCommand({
          reservationWindowStart: "2026-09-12T10:00:00.000Z",
          reservationWindowEnd: "2026-09-12T11:00:00.000Z",
        }),
        TENANT_A,
        identityA,
      );

      // Query covering 2026-09-10 to 2026-09-12 exclusive (matches Booking 1 & 2, excludes Booking 3)
      const result = service.listTenantBookings(TENANT_A, {
        dateField: "reservationStart",
        dateFrom: "2026-09-10T00:00:00Z",
        dateTo: "2026-09-12T00:00:00Z",
      });

      expect(result.pagination.totalItems).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it("filters passenger by literal text and escapes wildcards", async () => {
      const service = new OwnedMobilityService();
      const identityA = makeTenantIdentity(TENANT_A);

      await service.createTenantBooking(
        createSampleBookingCommand({
          passenger: { name: "Special_%_Passenger", phone: "+886911111111" },
        }),
        TENANT_A,
        identityA,
      );
      await service.createTenantBooking(
        createSampleBookingCommand({
          passenger: { name: "Special 1 Passenger", phone: "+886922222222" },
        }),
        TENANT_A,
        identityA,
      );

      const result = service.listTenantBookings(TENANT_A, {
        q: "%_",
      });
      expect(result.pagination.totalItems).toBe(1);
      expect(result.items[0]?.passenger.name).toBe("Special_%_Passenger");
    });

    it("filters by booking status and distinguishes fulfillment status", async () => {
      const service = new OwnedMobilityService();
      const identityA = makeTenantIdentity(TENANT_A);

      const futureStart = new Date(Date.now() + 86400000).toISOString();
      const futureEnd = new Date(Date.now() + 86400000 + 3600000).toISOString();

      const b1 = await service.createTenantBooking(
        createSampleBookingCommand({
          reservationWindowStart: futureStart,
          reservationWindowEnd: futureEnd,
        }),
        TENANT_A,
        identityA,
      );
      const b2 = await service.createTenantBooking(
        createSampleBookingCommand({
          reservationWindowStart: futureStart,
          reservationWindowEnd: futureEnd,
        }),
        TENANT_A,
        identityA,
      );

      await service.cancelTenantBooking(
        TENANT_A,
        b2.bookingId,
        { reason: "test_cancel" },
      );

      const activeList = service.listTenantBookings(TENANT_A, {
        status: "active",
      });
      expect(activeList.pagination.totalItems).toBe(1);
      expect(activeList.items[0]?.bookingId).toBe(b1.bookingId);
      expect(activeList.items[0]?.status).toBe("active");

      const cancelledList = service.listTenantBookings(TENANT_A, {
        status: "cancelled",
      });
      expect(cancelledList.pagination.totalItems).toBe(1);
      expect(cancelledList.items[0]?.bookingId).toBe(b2.bookingId);
      expect(cancelledList.items[0]?.status).toBe("cancelled");
      expect(cancelledList.items[0]?.orderStatus).toBe("cancelled");
    });

    it("provides stable ordering: selected date DESC NULLS LAST, bookingId ASC", async () => {
      const service = new OwnedMobilityService();
      const identityA = makeTenantIdentity(TENANT_A);

      const sameTime = "2026-09-10T10:00:00.000Z";
      const b1 = await service.createTenantBooking(
        createSampleBookingCommand({ reservationWindowStart: sameTime }),
        TENANT_A,
        identityA,
      );
      const b2 = await service.createTenantBooking(
        createSampleBookingCommand({ reservationWindowStart: sameTime }),
        TENANT_A,
        identityA,
      );

      const list = service.listTenantBookings(TENANT_A, {
        dateField: "reservationStart",
        pageSize: 10,
      });

      const expectedFirst =
        b1.bookingId < b2.bookingId ? b1.bookingId : b2.bookingId;
      const expectedSecond =
        b1.bookingId < b2.bookingId ? b2.bookingId : b1.bookingId;

      expect(list.items[0]?.bookingId).toBe(expectedFirst);
      expect(list.items[1]?.bookingId).toBe(expectedSecond);
    });

    it("handles out of range page by returning empty items with unchanged filtered total", async () => {
      const service = new OwnedMobilityService();
      const identityA = makeTenantIdentity(TENANT_A);

      await service.createTenantBooking(
        createSampleBookingCommand(),
        TENANT_A,
        identityA,
      );

      const outOfRange = service.listTenantBookings(TENANT_A, {
        page: 5,
        pageSize: 10,
      });

      expect(outOfRange.items).toHaveLength(0);
      expect(outOfRange.pagination.page).toBe(5);
      expect(outOfRange.pagination.totalItems).toBe(1);
      expect(outOfRange.pagination.totalPages).toBe(1);
    });

    it("handles zero-result query with totalPages 0", async () => {
      const service = new OwnedMobilityService();
      const identityA = makeTenantIdentity(TENANT_A);

      const emptyResult = service.listTenantBookings(TENANT_A, {
        q: "nonexistent_passenger_query",
      });

      expect(emptyResult.items).toHaveLength(0);
      expect(emptyResult.pagination.totalItems).toBe(0);
      expect(emptyResult.pagination.totalPages).toBe(0);
    });
  });

  describe("API Client query method and backward compatibility", () => {
    it("DrtsApiClient queryTenantBookings builds valid query and returns envelope", async () => {
      let interceptedUrl = "";
      const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
        interceptedUrl = String(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: {
              items: [],
              pagination: {
                page: 2,
                pageSize: 15,
                totalItems: 35,
                totalPages: 3,
              },
            },
            meta: { requestId: "req-fake", timestamp: new Date().toISOString() },
          }),
        } as unknown as Response;
      });

      vi.stubGlobal("fetch", fakeFetch);
      try {
        const client = new DrtsApiClient({
          baseUrl: "http://localhost:3000",
          defaultHeaders: { "x-tenant-id": TENANT_A },
        });

        const paged = await client.queryTenantBookings({
          page: 2,
          pageSize: 15,
          status: "active",
          q: "Alice",
        });

        expect(interceptedUrl).toContain("/api/tenant/bookings?");
        expect(interceptedUrl).toContain("page=2");
        expect(interceptedUrl).toContain("pageSize=15");
        expect(interceptedUrl).toContain("status=active");
        expect(interceptedUrl).toContain("q=Alice");
        expect(paged.pagination.totalItems).toBe(35);
        expect(paged.pagination.totalPages).toBe(3);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("DrtsApiClient listTenantBookings without query loops through pages to prevent silent truncation", async () => {
      let fetchCallCount = 0;
      const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
        fetchCallCount += 1;
        const parsedUrl = new URL(String(url));
        const page = Number(parsedUrl.searchParams.get("page") || "1");

        const items =
          page === 1
            ? Array.from({ length: 100 }, (_, i) => ({
                bookingId: `bk-${i}`,
                orderId: `ord-${i}`,
                tenantId: TENANT_A,
              }))
            : Array.from({ length: 25 }, (_, i) => ({
                bookingId: `bk-${100 + i}`,
                orderId: `ord-${100 + i}`,
                tenantId: TENANT_A,
              }));

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            data: {
              items,
              pagination: {
                page,
                pageSize: 100,
                totalItems: 125,
                totalPages: 2,
              },
            },
            meta: { requestId: "req-fake", timestamp: new Date().toISOString() },
          }),
        } as unknown as Response;
      });

      vi.stubGlobal("fetch", fakeFetch);
      try {
        const client = new DrtsApiClient({
          baseUrl: "http://localhost:3000",
          defaultHeaders: { "x-tenant-id": TENANT_A },
        });

        const allBookings = await client.listTenantBookings();
        expect(fetchCallCount).toBe(2);
        expect(allBookings).toHaveLength(125);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
