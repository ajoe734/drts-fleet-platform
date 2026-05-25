import { describe, expect, it, vi } from "vitest";

import { TenantSearchService } from "../../src/modules/search/tenant-search.service";

function createTenantSearchService() {
  const ownedMobilityService = {
    listTenantBookings: vi.fn(() => ({
      items: [
        {
          bookingId: "BK-ACME-001",
          orderId: "ORD-ACME-001",
          passenger: {
            name: "Acme Booker",
            phone: "0911222333",
          },
          pickup: {
            address: "Acme Tower Lobby",
          },
          dropoff: {
            address: "Airport Terminal 1",
          },
          costCenter: "CC-ACME-001",
          notes: "VIP Acme traveler",
        },
      ],
    })),
  };
  const tenantPartnerService = {
    listPassengers: vi.fn(() => [
      {
        passengerId: "passenger-acme-001",
        fullName: "Alice Example",
        employeeNo: "EMP-001",
        departmentName: "Acme Finance",
        mobile: "0900111222",
        email: "alice@example.com",
      },
    ]),
    listAddresses: vi.fn(() => [
      {
        addressId: "address-acme-001",
        addressName: "Acme HQ",
        addressText: "台北市信義區 Acme 大樓 1 樓",
        normalizedAddressText: "台北市信義區acme大樓1樓",
        tags: ["vip", "hq"],
        ownerPassengerId: "passenger-acme-001",
      },
    ]),
    listCostCenters: vi.fn(() => [
      {
        code: "CC-ACME-001",
        name: "Acme Finance",
        description: "Acme corporate travel budget",
        ownerName: "Alice Example",
        ownerUserId: "user-acme-001",
      },
    ]),
  };
  const billingSettlementService = {
    listTenantInvoices: vi.fn(() => [
      {
        invoiceId: "INV-ACME-001",
        periodStart: "2026-04-01T00:00:00.000Z",
        periodEnd: "2026-04-30T23:59:59.999Z",
        status: "issued",
        lines: [
          {
            orderId: "ORD-ACME-001",
          },
        ],
      },
    ]),
  };

  const service = new TenantSearchService(
    ownedMobilityService as never,
    tenantPartnerService as never,
    billingSettlementService as never,
  );

  return {
    service,
    ownedMobilityService,
    tenantPartnerService,
    billingSettlementService,
  };
}

describe("TenantSearchService", () => {
  it("returns empty requested groups for a blank query without loading sources", () => {
    const {
      service,
      ownedMobilityService,
      tenantPartnerService,
      billingSettlementService,
    } = createTenantSearchService();

    expect(
      service.searchTenant("tenant-demo-001", {
        q: "   ",
        types: ["bookings", "invoices"],
      }),
    ).toEqual({
      query: "",
      groups: [
        {
          category: "bookings",
          items: [],
        },
        {
          category: "invoices",
          items: [],
        },
      ],
    });
    expect(ownedMobilityService.listTenantBookings).not.toHaveBeenCalled();
    expect(tenantPartnerService.listPassengers).not.toHaveBeenCalled();
    expect(tenantPartnerService.listAddresses).not.toHaveBeenCalled();
    expect(tenantPartnerService.listCostCenters).not.toHaveBeenCalled();
    expect(billingSettlementService.listTenantInvoices).not.toHaveBeenCalled();
  });

  it("returns grouped matches in canonical tenant-console categories", () => {
    const { service } = createTenantSearchService();

    const response = service.searchTenant("tenant-demo-001", {
      q: "Acme",
    });

    expect(response.query).toBe("Acme");
    expect(response.groups.map((group) => group.category)).toEqual([
      "bookings",
      "passengers",
      "addresses",
      "cost-centers",
      "invoices",
    ]);
    expect(response.groups).toEqual([
      {
        category: "bookings",
        items: [
          expect.objectContaining({
            category: "bookings",
            resourceType: "booking",
            resourceId: "BK-ACME-001",
            primaryLabel: "BK-ACME-001",
            secondaryLabel:
              "Acme Booker · Acme Tower Lobby → Airport Terminal 1",
            matchedFields: expect.arrayContaining([
              "bookingId",
              "orderId",
              "passenger.name",
              "pickup.address",
              "costCenter",
              "notes",
            ]),
            link: {
              targetApp: "tenant-console",
              route: "/bookings/BK-ACME-001",
              resourceType: "booking",
              resourceId: "BK-ACME-001",
              openMode: "same_tab",
              label: "Open booking detail",
            },
          }),
        ],
      },
      {
        category: "passengers",
        items: [
          expect.objectContaining({
            category: "passengers",
            resourceType: "passenger",
            resourceId: "passenger-acme-001",
            primaryLabel: "Alice Example",
            secondaryLabel: "EMP-001 · Acme Finance · 0900111222",
            matchedFields: expect.arrayContaining([
              "passengerId",
              "departmentName",
            ]),
            link: expect.objectContaining({
              route: "/passengers?passengerId=passenger-acme-001",
            }),
          }),
        ],
      },
      {
        category: "addresses",
        items: [
          expect.objectContaining({
            resourceType: "address",
            resourceId: "address-acme-001",
            primaryLabel: "Acme HQ",
            secondaryLabel: "台北市信義區 Acme 大樓 1 樓",
            matchedFields: expect.arrayContaining([
              "addressName",
              "addressText",
              "normalizedAddressText",
            ]),
            link: expect.objectContaining({
              route: "/addresses?addressId=address-acme-001",
            }),
          }),
        ],
      },
      {
        category: "cost-centers",
        items: [
          expect.objectContaining({
            category: "cost-centers",
            resourceType: "cost-center",
            resourceId: "CC-ACME-001",
            primaryLabel: "CC-ACME-001",
            secondaryLabel:
              "Acme Finance · Alice Example · Acme corporate travel budget",
            matchedFields: expect.arrayContaining([
              "code",
              "name",
              "description",
              "ownerUserId",
            ]),
            link: expect.objectContaining({
              route: "/cost-centers?code=CC-ACME-001",
            }),
          }),
        ],
      },
      {
        category: "invoices",
        items: [
          expect.objectContaining({
            resourceType: "invoice",
            resourceId: "INV-ACME-001",
            primaryLabel: "INV-ACME-001",
            secondaryLabel: "2026-04 · issued",
            matchedFields: expect.arrayContaining([
              "invoiceId",
              "lines.orderId",
            ]),
            link: expect.objectContaining({
              route:
                "/invoices?period=2026-04&invoiceId=INV-ACME-001",
            }),
          }),
        ],
      },
    ]);
  });

  it("supports compact matching and category filtering", () => {
    const { service } = createTenantSearchService();

    const response = service.searchTenant("tenant-demo-001", {
      q: "emp001",
      types: ["passengers"],
    });

    expect(response).toEqual({
      query: "emp001",
      groups: [
        {
          category: "passengers",
          items: [
            expect.objectContaining({
              resourceId: "passenger-acme-001",
              matchedFields: ["employeeNo"],
            }),
          ],
        },
      ],
    });
  });
});
