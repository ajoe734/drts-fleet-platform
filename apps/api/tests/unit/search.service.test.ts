import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { SearchController } from "../../src/modules/search/search.controller";
import { SearchService } from "../../src/modules/search/search.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-demo-001";

async function createHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
  );
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
  );
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
  };
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService as never,
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
    opsDispatchEventsService,
    undefined,
    tenantPartnerService,
  );
  const billingSettlementService = new BillingSettlementService(
    auditNotificationService,
  );
  const searchService = new SearchService(
    ownedMobilityService,
    tenantPartnerService,
    billingSettlementService,
  );

  tenantPartnerService.upsertPassenger(TENANT_ID, {
    passengerId: "passenger-search-tenant",
    fullName: "Tenant Search Passenger",
    employeeNo: "TEN-SEARCH-001",
    departmentName: "Tenant Search",
    mobile: "0911-123-456",
    email: "tenant-search-passenger@acme.example",
    activeFlag: true,
    metadata: {},
    roles: ["passenger"],
  });
  tenantPartnerService.upsertAddress(TENANT_ID, {
    addressId: "address-search-tenant",
    ownerPassengerId: "passenger-search-tenant",
    addressName: "Tenant Search HQ",
    addressText: "Tenant Search Street 1",
    sensitiveFlag: false,
    geocodeSource: "manual",
    lat: 25.04,
    lng: 121.56,
    tags: ["tenant-search"],
    activeFlag: true,
  });
  tenantPartnerService.upsertCostCenter(TENANT_ID, {
    code: "CC-TENANT-SEARCH",
    name: "Tenant Search Cost Center",
    description: "Tenant search coverage",
    ownerUserId: null,
    ownerName: "Tenant Search Owner",
    activeFlag: true,
  });

  ownedMobilityService.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: "2026-06-01T09:00:00.000Z",
      reservationWindowEnd: "2026-06-01T10:00:00.000Z",
      pickupAddressId: "address-search-tenant",
      pickup: {
        address: "Tenant Search HQ",
        lat: 25.04,
        lng: 121.56,
      },
      dropoff: {
        address: "Tenant Search Branch",
        lat: 25.05,
        lng: 121.57,
      },
      passengerId: "passenger-search-tenant",
      passenger: {
        name: "Tenant Search Passenger",
        phone: "0911-123-456",
      },
      bookedBy: {
        name: "Tenant Search Booker",
        email: "tenant-search-booker@acme.example",
      },
      onsiteContact: null,
      costCenter: "CC-TENANT-SEARCH",
      vehiclePreference: null,
      benefitReference: null,
      direction: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: "Tenant search booking",
      minPhotoCount: 1,
      signoffRequired: false,
      expenseProofRequired: false,
    },
    TENANT_ID,
  );

  await billingSettlementService.generateTenantInvoice(TENANT_ID, {
    tenantId: TENANT_ID,
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
  });

  return {
    searchService,
    controller: new SearchController(searchService),
    cleanup: () => tenantPartnerService.onModuleDestroy(),
  };
}

describe("SearchService.searchTenant", () => {
  it("returns grouped cross-entity results for tenant search", async () => {
    const { searchService, cleanup } = await createHarness();

    try {
      const result = searchService.searchTenant(TENANT_ID, TENANT_ID);

      expect(result.query).toBe(TENANT_ID);
      expect(result.groups.map((group) => group.category)).toEqual([
        "bookings",
        "passengers",
        "addresses",
        "cost-centers",
        "invoices",
      ]);
      expect(result.totalResults).toBeGreaterThanOrEqual(5);

      const bookingGroup = result.groups.find(
        (group) => group.category === "bookings",
      );
      expect(bookingGroup?.items[0]).toEqual(
        expect.objectContaining({
          resourceType: "booking",
          link: expect.objectContaining({
            route: expect.stringContaining("/bookings/"),
          }),
        }),
      );

      const invoiceGroup = result.groups.find(
        (group) => group.category === "invoices",
      );
      expect(invoiceGroup?.items[0]).toEqual(
        expect.objectContaining({
          resourceType: "tenant_invoice",
          matchedFields: expect.arrayContaining(["tenantId"]),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it("filters results to the requested categories", async () => {
    const { searchService, cleanup } = await createHarness();

    try {
      const result = searchService.searchTenant(
        TENANT_ID,
        TENANT_ID,
        "passengers,invoices",
      );

      expect(result.types).toEqual(["passengers", "invoices"]);
      expect(result.groups.map((group) => group.category)).toEqual([
        "passengers",
        "invoices",
      ]);
    } finally {
      cleanup();
    }
  });

  it("rejects blank search queries", async () => {
    const { searchService, cleanup } = await createHarness();

    try {
      expect(() => searchService.searchTenant(TENANT_ID, "   ")).toThrowError(
        ApiRequestError,
      );

      try {
        searchService.searchTenant(TENANT_ID, "   ");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toEqual(
          expect.objectContaining({
            error: expect.objectContaining({
              code: "SEARCH_QUERY_REQUIRED",
            }),
          }),
        );
      }
    } finally {
      cleanup();
    }
  });
});

describe("SearchController.searchTenant", () => {
  it("wraps grouped search results in the API success envelope", async () => {
    const { controller, cleanup } = await createHarness();

    try {
      const response = controller.searchTenant(
        TENANT_ID,
        TENANT_ID,
        "bookings,cost-centers",
        "req-search-tenant-001",
      );

      expect(response.meta.requestId).toBe("req-search-tenant-001");
      expect(response.data.groups.map((group) => group.category)).toEqual([
        "bookings",
        "cost-centers",
      ]);
    } finally {
      cleanup();
    }
  });
});
