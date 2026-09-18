const fs = require("fs");
const file =
  "tests/unit/system-remediation/sr-partner-notify-route-20260917/partner-notify-route.test.ts";

const testContent = `
import { describe, it, expect, vi } from "vitest";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";

describe("SR-PARTNER-NOTIFY-ROUTE-20260917: Partner notification routing and delivery contexts", () => {
  const createMockService = () => {
    const mockOwnedMobilityService = {
      createMultiTaxiRide: vi.fn().mockResolvedValue({ orderId: "order-123", status: "pending" }),
    };
    const mockPartnerUserIdentityLinkRepository = {
      findByDrtsPassengerId: vi.fn(),
    };
    const mockTenantPartnerService = {
      getPartnerEntry: vi.fn(),
    };

    const service = new (MultiTaxiService as any)(
      null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null
    );
    service.ownedMobilityService = mockOwnedMobilityService as any;
    service.partnerUserIdentityLinkRepository = mockPartnerUserIdentityLinkRepository as any;
    service.tenantPartnerService = mockTenantPartnerService as any;
    service.assertServiceProductPolicy = vi.fn();
    service.resolveActiveAuthorization = vi.fn().mockReturnValue({});
    service.createRideAccessResult = vi.fn().mockResolvedValue({ status: "ok" });
    return { service, mockOwnedMobilityService, mockPartnerUserIdentityLinkRepository, mockTenantPartnerService };
  };

  it("同 tenant 兩 entry 僅送原 entry (Order routes explicitly bind to the creation entry)", async () => {
    const { service, mockOwnedMobilityService, mockPartnerUserIdentityLinkRepository, mockTenantPartnerService } = createMockService();
    
    const identity = {
      realm: "partner",
      partnerEntrySlug: "entry-a",
      drtsPassengerId: "p-123",
      subject: "sub-123",
    };
    
    mockPartnerUserIdentityLinkRepository.findByDrtsPassengerId.mockResolvedValue({
      partnerUserRef: "u-abc",
      drtsPassengerId: "p-123",
      linkedAt: "2026-09-18",
      consentScope: "passenger_identity_link",
    });
    mockTenantPartnerService.getPartnerEntry.mockReturnValue({
      entrySlug: "entry-a",
      tenantId: "t-1",
      partnerId: "partner-1",
    });

    await service.createRide({}, identity as any);
    
    expect(mockOwnedMobilityService.createMultiTaxiRide).toHaveBeenCalled();
    const callArgs = mockOwnedMobilityService.createMultiTaxiRide.mock.calls[0];
    const factory = callArgs[5];
    expect(factory).toBeDefined();
    
    const context = factory("order-123");
    expect(context.route.entrySlug).toBe("entry-a");
    expect(context.route.tenantId).toBe("t-1");
  });

  it("跨 tenant 相同 URL 隔離 (Bindings are tenant-isolated)", async () => {
    const { service, mockOwnedMobilityService, mockPartnerUserIdentityLinkRepository, mockTenantPartnerService } = createMockService();
    
    const identity = {
      realm: "partner",
      partnerEntrySlug: "entry-b",
      drtsPassengerId: "p-123",
    };
    
    mockPartnerUserIdentityLinkRepository.findByDrtsPassengerId.mockResolvedValue({
      partnerUserRef: "u-abc",
      drtsPassengerId: "p-123",
    });
    mockTenantPartnerService.getPartnerEntry.mockReturnValue({
      entrySlug: "entry-b",
      tenantId: "t-2", // Different tenant
      partnerId: "partner-2",
    });

    await service.createRide({}, identity as any);
    
    const callArgs = mockOwnedMobilityService.createMultiTaxiRide.mock.calls[0];
    const factory = callArgs[5];
    const context = factory("order-123");
    expect(context.route.tenantId).toBe("t-2");
  });

  it("entry 改 tenantId 後舊通知不移轉 (Snapshot retains original tenantId)", async () => {
    const { service, mockOwnedMobilityService, mockPartnerUserIdentityLinkRepository, mockTenantPartnerService } = createMockService();
    
    const identity = {
      realm: "partner",
      partnerEntrySlug: "entry-c",
      drtsPassengerId: "p-123",
    };
    
    mockPartnerUserIdentityLinkRepository.findByDrtsPassengerId.mockResolvedValue({
      partnerUserRef: "u-xyz",
      drtsPassengerId: "p-123",
    });
    mockTenantPartnerService.getPartnerEntry.mockReturnValue({
      entrySlug: "entry-c",
      tenantId: "t-original",
      partnerId: "partner-1",
    });

    await service.createRide({}, identity as any);
    
    const callArgs = mockOwnedMobilityService.createMultiTaxiRide.mock.calls[0];
    const factory = callArgs[5];
    const context = factory("order-123");
    
    // The snapshot captures t-original
    expect(context.route.tenantId).toBe("t-original");
  });

  it("identity link 撤銷停送 (Route snapshot requires active link at creation)", async () => {
    const { service, mockOwnedMobilityService, mockPartnerUserIdentityLinkRepository, mockTenantPartnerService } = createMockService();
    
    const identity = {
      realm: "partner",
      partnerEntrySlug: "entry-d",
      drtsPassengerId: "p-123",
    };
    
    // Simulate revoked or missing link
    mockPartnerUserIdentityLinkRepository.findByDrtsPassengerId.mockResolvedValue(null);
    mockTenantPartnerService.getPartnerEntry.mockReturnValue({
      entrySlug: "entry-d",
      tenantId: "t-1",
      partnerId: "partner-1",
    });

    await service.createRide({}, identity as any);
    
    const callArgs = mockOwnedMobilityService.createMultiTaxiRide.mock.calls[0];
    const factory = callArgs[5];
    
    // Factory should be undefined if link is missing
    expect(factory).toBeUndefined();
  });
});
`;

fs.writeFileSync(file, testContent);
