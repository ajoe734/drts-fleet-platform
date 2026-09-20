import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";

describe("SR-PARTNER-NOTIFY-NAV-20260917", () => {
  let controller: TenantPartnerController;
  let mockIdentityLinkRepo: any;
  let mockNavRepo: any;
  let mockTenantPartnerService: any;

  beforeEach(() => {
    process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY = "test-handoff-key";
    mockIdentityLinkRepo = {
      find: vi.fn(),
      findByDrtsPassengerId: vi.fn(),
    };
    mockNavRepo = {
      resolveRoute: vi.fn(),
    };
    mockTenantPartnerService = {
      getPartnerEntry: vi.fn(),
      authenticateTenantApiKey: vi.fn(),
      authenticatePartnerBootstrap: vi.fn(),
      getLatestReferralEmbedConsent: vi.fn(),
      issueReferralEmbedHandoffArtifact: vi.fn(),
      consumeReferralEmbedHandoffArtifact: vi.fn(),
    };

    controller = new TenantPartnerController(
      mockTenantPartnerService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockIdentityLinkRepo,
      mockNavRepo,
    );
  });

  afterEach(() => {
    delete process.env.DRTS_REFERRAL_EMBED_HANDOFF_KEY;
  });

  describe("resolvePartnerNotificationNavigation", () => {
    it("returns 403 when navigation route does not exist", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        tenantId: "tenant1",
      });
      mockNavRepo.resolveRoute.mockResolvedValue(null);

      try {
        await controller.resolvePartnerNotificationNavigation(
          "entry1",
          { rideRef: "invalid", partnerUserRef: "user1" },
          { headers: { "x-api-key": "test-key" } },
        );
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(403);
      }
    });

    it("returns 403 on cross-tenant access", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        tenantId: "tenant1",
        partnerId: "partner1",
      });
      mockNavRepo.resolveRoute.mockResolvedValue({
        tenantId: "tenant2",
        partnerId: "partner1",
      });

      try {
        await controller.resolvePartnerNotificationNavigation(
          "entry1",
          { rideRef: "ride1", partnerUserRef: "user1" },
          { headers: { "x-api-key": "test-key" } },
        );
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(403);
      }
    });

    it("returns 403 when identity link is revoked (logout)", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        tenantId: "tenant1",
        partnerId: "partner1",
      });
      mockNavRepo.resolveRoute.mockResolvedValue({
        tenantId: "tenant1",
        partnerId: "partner1",
        drtsPassengerId: "p1",
      });
      mockIdentityLinkRepo.find.mockResolvedValue({
        status: "revoked",
      });

      try {
        await controller.resolvePartnerNotificationNavigation(
          "entry1",
          { rideRef: "ride1", partnerUserRef: "user1" },
          { headers: { "x-api-key": "test-key" } },
        );
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(403);
      }
    });

    it("returns 403 when passenger ID mismatches (account switch)", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        tenantId: "tenant1",
        partnerId: "partner1",
      });
      mockNavRepo.resolveRoute.mockResolvedValue({
        tenantId: "tenant1",
        partnerId: "partner1",
        drtsPassengerId: "p1",
      });
      mockIdentityLinkRepo.find.mockResolvedValue({
        status: "active",
        drtsPassengerId: "p2", // Mismatch!
      });

      try {
        await controller.resolvePartnerNotificationNavigation(
          "entry1",
          { rideRef: "ride1", partnerUserRef: "user1" },
          { headers: { "x-api-key": "test-key" } },
        );
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(403);
      }
    });

    it("issues handoff artifact successfully", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        tenantId: "tenant1",
        partnerId: "partner1",
        entryHost: "https://partner.com",
      });
      mockNavRepo.resolveRoute.mockResolvedValue({
        tenantId: "tenant1",
        partnerId: "partner1",
        drtsPassengerId: "p1",
        orderId: "order1",
        status: "assigned",
        consentBundleVersion: "v1",
      });
      mockIdentityLinkRepo.find.mockResolvedValue({
        status: "active",
        drtsPassengerId: "p1",
      });
      mockTenantPartnerService.authenticatePartnerBootstrap.mockResolvedValue({
        success: true,
      });
      mockTenantPartnerService.issueReferralEmbedHandoffArtifact.mockResolvedValue(
        {
          artifact: "artifact1",
        },
      );

      const response = await controller.resolvePartnerNotificationNavigation(
        "entry1",
        { rideRef: "ride1", partnerUserRef: "user1" },
        { headers: { "x-api-key": "test-key" } },
      );

      expect(response.data.destinationUrl).toContain("artifact=artifact1");
      expect(
        mockTenantPartnerService.issueReferralEmbedHandoffArtifact,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          navigationContext: { orderId: "order1", screen: "trip" },
        }),
        undefined,
        { allowInternalBootstrap: false },
      );
    });
  });
});
