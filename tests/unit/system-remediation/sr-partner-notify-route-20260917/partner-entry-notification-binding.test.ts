import { describe, it, expect, vi, beforeEach } from "vitest";

import { PartnerEntryNotificationBindingService } from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.service";
import { PartnerEntryNotificationBindingController } from "../../../../apps/api/src/modules/tenant-partner/partner-entry-notification-binding.controller";

describe("SR-PARTNER-NOTIFY-ROUTE-20260917: entry_binding_crud_with_version_and_scope", () => {
  let mockBindingRepository: any;
  let mockTenantPartnerService: any;
  let service: PartnerEntryNotificationBindingService;
  let controller: PartnerEntryNotificationBindingController;

  beforeEach(() => {
    mockBindingRepository = {
      findByEntrySlug: vi.fn(),
      persist: vi.fn().mockResolvedValue(true),
      updateWithVersion: vi.fn().mockResolvedValue(true),
    };
    mockTenantPartnerService = {
      getPartnerEntry: vi.fn(),
      getWebhookEndpoint: vi.fn(),
    };
    service = new PartnerEntryNotificationBindingService(
      mockBindingRepository,
      mockTenantPartnerService
    );
    controller = new PartnerEntryNotificationBindingController(
      service,
      mockTenantPartnerService
    );
  });

  describe("Service - CRUD and Versioning (409)", () => {
    it("should create a new binding if it does not exist", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        entrySlug: "entry-1",
        tenantId: "tenant-1",
        partnerId: "partner-1",
      });
      mockBindingRepository.findByEntrySlug.mockResolvedValue(null);

      const result = await service.updateBinding("entry-1", {
        webhookId: "wh-1",
        eventTypes: ["passenger.eta_changed.v1"] as any,
      });

      expect(result.version).toBe(1);
      expect(result.state).toBe("test_pending");
      expect(mockBindingRepository.persist).toHaveBeenCalled();
    });

    it("should update an existing binding and increment version", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        entrySlug: "entry-1",
      });
      mockBindingRepository.findByEntrySlug.mockResolvedValue({
        version: 1,
        state: "ready",
        validatedEndpointFingerprint: "old-fp",
      });

      const result = await service.updateBinding("entry-1", {
        webhookId: "wh-2",
        eventTypes: [],
      });

      expect(result.version).toBe(2);
      expect(result.state).toBe("test_pending");
      expect(result.validatedEndpointFingerprint).toBeNull();
      expect(mockBindingRepository.updateWithVersion).toHaveBeenCalledWith(
        expect.objectContaining({ version: 2 }),
        1
      );
    });

    it("should throw ConflictException on version mismatch (OCC failure)", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        entrySlug: "entry-1",
      });
      mockBindingRepository.findByEntrySlug.mockResolvedValue({
        version: 2,
      });

      await expect(
        service.updateBinding("entry-1", {
          webhookId: "wh-2",
          eventTypes: [],
          expectedVersion: 1, // Mismatch
        })
      ).rejects.toThrowError("Binding version mismatch");

      expect(mockBindingRepository.updateWithVersion).not.toHaveBeenCalled();
    });

    it("should throw ConflictException if updateWithVersion returns false", async () => {
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({
        entrySlug: "entry-1",
      });
      mockBindingRepository.findByEntrySlug.mockResolvedValue({
        version: 1,
      });
      mockBindingRepository.updateWithVersion.mockResolvedValue(false); // Simulate concurrent update

      await expect(
        service.updateBinding("entry-1", {
          webhookId: "wh-2",
          eventTypes: [],
          expectedVersion: 1,
        })
      ).rejects.toThrowError("Binding version mismatch");
    });
  });

  describe("Service - Test Gate and Enable/Disable", () => {
    it("should test binding and set validated fingerprint", async () => {
      const binding = {
        tenantId: "t-1",
        webhookId: "wh-1",
        validatedEndpointFingerprint: null,
      };
      mockBindingRepository.findByEntrySlug.mockResolvedValue(binding);
      mockTenantPartnerService.getWebhookEndpoint.mockReturnValue({
        url: "https://example.com/webhook",
        secretVersion: 42,
      });

      await service.testBinding("entry-1");

      expect(binding.validatedEndpointFingerprint).toBe("https://example.com/webhook|42");
      expect(mockBindingRepository.persist).toHaveBeenCalled();
    });

    it("should throw ConflictException when enabling a binding with mismatched fingerprint", async () => {
      mockBindingRepository.findByEntrySlug.mockResolvedValue({
        tenantId: "t-1",
        webhookId: "wh-1",
        validatedEndpointFingerprint: "old-fp",
        validatedAt: new Date().toISOString(),
      });
      mockTenantPartnerService.getWebhookEndpoint.mockReturnValue({
        url: "https://example.com/webhook",
        secretVersion: 42,
      });

      await expect(service.enableBinding("entry-1")).rejects.toThrow();
    });

    it("should successfully enable binding if fingerprint matches", async () => {
      const binding = {
        tenantId: "t-1",
        webhookId: "wh-1",
        validatedEndpointFingerprint: "https://example.com/webhook|42",
        validatedAt: new Date().toISOString(),
        state: "test_pending",
      };
      mockBindingRepository.findByEntrySlug.mockResolvedValue(binding);
      mockTenantPartnerService.getWebhookEndpoint.mockReturnValue({
        url: "https://example.com/webhook",
        secretVersion: 42,
      });

      const result = await service.enableBinding("entry-1");
      expect(result.state).toBe("ready");
    });
  });

  describe("Controller - Scope Validation", () => {
    it("allows platform realm access", async () => {
      mockBindingRepository.findByEntrySlug.mockResolvedValue({ id: 1 });
      const req = { identity: { realm: "platform" } };
      await expect(controller.getBinding("entry-1", req)).resolves.toBeDefined();
    });

    it("rejects missing identity", async () => {
      const req = { identity: null };
      await expect(controller.getBinding("entry-1", req)).rejects.toThrow();
    });

    it("rejects cross-tenant access", async () => {
      const req = { identity: { realm: "tenant", tenantId: "t-1" } };
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({ tenantId: "t-2" });
      
      await expect(controller.getBinding("entry-1", req)).rejects.toThrow();
    });

    it("allows same-tenant access", async () => {
      const req = { identity: { realm: "tenant", tenantId: "t-1" } };
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({ tenantId: "t-1" });
      mockBindingRepository.findByEntrySlug.mockResolvedValue({ id: 1 });
      
      await expect(controller.getBinding("entry-1", req)).resolves.toBeDefined();
    });

    it("rejects cross-entry partner access", async () => {
      const req = { 
        identity: { realm: "partner", tenantId: "t-1", partnerEntrySlug: "entry-A" } 
      };
      mockTenantPartnerService.getPartnerEntry.mockResolvedValue({ tenantId: "t-1" });
      
      await expect(controller.getBinding("entry-B", req)).rejects.toThrow();
    });
  });
});
