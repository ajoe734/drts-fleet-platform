import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolloutStatus } from "@drts/contracts";
import { PlatformAdminController } from "../../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.types";

describe("SR-ADMIN-ADAPTER-001 — Platform Admin Adapter Registry API & Service", () => {
  let service: PlatformAdminService;
  let controller: PlatformAdminController;
  let recordedAudits: any[];
  let mockAuditNotificationService: any;

  const platformAdminIdentity: BootstrapRequestIdentity = {
    authMode: "bootstrap_headers",
    actorId: "platform-admin-01",
    actorType: "platform_operator",
    realm: "platform",
    roles: ["platform_admin"],
    roleFamilies: ["platform"],
    scopes: ["foundation:read", "foundation:write"],
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    membershipId: null,
    principalId: "principal-01",
    sessionId: "session-01",
    tokenVersion: 1,
    authTime: "2026-09-08T00:00:00.000Z",
    amr: ["password"],
    acr: "aal2",
    requestId: "req-sr-admin-001",
  };

  const systemIdentity: BootstrapRequestIdentity = {
    ...platformAdminIdentity,
    actorId: "system-sync-daemon",
    realm: "system",
    actorType: "system_agent",
    scopes: ["foundation:read"],
  };

  const driverIdentity: BootstrapRequestIdentity = {
    ...platformAdminIdentity,
    actorId: "driver-999",
    realm: "driver",
    actorType: "driver",
    scopes: [],
  };

  const tenantIdentity: BootstrapRequestIdentity = {
    ...platformAdminIdentity,
    actorId: "tenant-admin-12",
    realm: "tenant",
    actorType: "tenant_admin",
    scopes: ["tenant:admin"],
  };

  const readOnlyPlatformIdentity: BootstrapRequestIdentity = {
    ...platformAdminIdentity,
    actorId: "platform-auditor",
    scopes: ["foundation:read"],
  };

  beforeEach(() => {
    recordedAudits = [];
    mockAuditNotificationService = {
      recordAuditLog: vi.fn((input: any) => {
        const record = {
          ...input,
          auditId: `audit-${recordedAudits.length + 1}`,
          createdAt: new Date().toISOString(),
        };
        recordedAudits.push(record);
        return record;
      }),
    };

    service = new PlatformAdminService(mockAuditNotificationService as any);
    controller = new PlatformAdminController(service);
  });

  describe("Seed Data & Baseline Invariants", () => {
    it("seeds authoritative platform adapters including required production and legacy adapters", () => {
      const adapters = service.listPlatformAdapters();
      expect(adapters.length).toBeGreaterThanOrEqual(6);

      const ids = adapters.map((a) => a.id);
      expect(ids).toContain("owned-dispatch");
      expect(ids).toContain("cityride-forwarder");
      expect(ids).toContain("srx-v3");
      expect(ids).toContain("gocab-v1");
      expect(ids).toContain("mof-bgmt");
      expect(ids).toContain("grab_taiwan");
    });

    it("unconfigured adapters have credentialExpiresAt: null without fake fixture dates", () => {
      const mof = service.getPlatformAdapter("mof-bgmt");
      expect(mof).toBeDefined();
      expect(mof?.credentialExpiresAt).toBeNull();
      expect(mof?.credentialStatus).toBe("NOT_CONFIGURED");

      const srx = service.getPlatformAdapter("srx-v3");
      expect(srx).toBeDefined();
      expect(srx?.credentialExpiresAt).toBeNull();
    });

    it("native dispatch has valid credential status and null expiry", () => {
      const owned = service.getPlatformAdapter("owned-dispatch");
      expect(owned).toBeDefined();
      expect(owned?.credentialStatus).toBe("VALID");
      expect(owned?.credentialExpiresAt).toBeNull();
    });
  });

  describe("Controller GET /adapters & GET /adapters/:id", () => {
    it("allows platform realm with foundation:read to list adapters", () => {
      const envelope = controller.listPlatformAdapters(platformAdminIdentity, "req-1");
      expect(envelope.data.items).toBeInstanceOf(Array);
      expect(envelope.data.items.length).toBeGreaterThanOrEqual(6);
      expect(envelope.meta.requestId).toBe("req-1");
    });

    it("allows system realm with foundation:read to list adapters", () => {
      const envelope = controller.listPlatformAdapters(systemIdentity, "req-2");
      expect(envelope.data.items.length).toBeGreaterThanOrEqual(6);
    });

    it("rejects unauthorized realms (driver, tenant) with 403 PLATFORM_ADMIN_FORBIDDEN", () => {
      expect(() =>
        controller.listPlatformAdapters(driverIdentity, "req-unauth-1"),
      ).toThrowError(ApiRequestError);

      try {
        controller.listPlatformAdapters(driverIdentity, "req-unauth-1");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("PLATFORM_ADMIN_FORBIDDEN");
      }

      try {
        controller.listPlatformAdapters(tenantIdentity, "req-unauth-2");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("PLATFORM_ADMIN_FORBIDDEN");
      }
    });

    it("rejects unauthenticated requests (null identity) with 401 PLATFORM_ADMIN_IDENTITY_REQUIRED", () => {
      expect(() =>
        controller.listPlatformAdapters(null, "req-no-identity"),
      ).toThrowError(ApiRequestError);

      try {
        controller.listPlatformAdapters(null, "req-no-identity");
      } catch (err: any) {
        expect(err.getStatus()).toBe(401);
        expect(err.code).toBe("PLATFORM_ADMIN_IDENTITY_REQUIRED");
      }
    });

    it("allows platform admin to retrieve specific adapter by id", () => {
      const envelope = controller.getPlatformAdapter("owned-dispatch", platformAdminIdentity, "req-3");
      expect(envelope.data.id).toBe("owned-dispatch");
      expect(envelope.data.name).toBe("DRTS Native Dispatch");
    });

    it("returns 404 PLATFORM_ADAPTER_NOT_FOUND when adapter id does not exist", () => {
      expect(() =>
        controller.getPlatformAdapter("non-existent-id", platformAdminIdentity, "req-4"),
      ).toThrowError(ApiRequestError);

      try {
        controller.getPlatformAdapter("non-existent-id", platformAdminIdentity, "req-4");
      } catch (err: any) {
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("PLATFORM_ADAPTER_NOT_FOUND");
      }
    });
  });

  describe("Controller PATCH /adapters/:id & Write Governance", () => {
    it("updates adapter configuration, policies, and rollout with accurate readback", () => {
      const initial = service.getPlatformAdapter("owned-dispatch");
      expect(initial?.config.isEnabled).toBe(true);

      const updateCommand = {
        config: { isEnabled: false },
        rolloutStatus: RolloutStatus.IN_PROGRESS,
        policies: {
          serviceBuckets: ["vip-fleet", "express-tier"],
          maxCandidates: 12,
          acceptTimeoutSeconds: 45,
          manualFallbackThresholdSeconds: 90,
          financeAuthorityMode: "OWNED" as const,
        },
      };

      const patchResponse = controller.updatePlatformAdapter(
        "owned-dispatch",
        updateCommand,
        platformAdminIdentity,
        "req-patch-1",
      );

      expect(patchResponse.data.config.isEnabled).toBe(false);
      expect(patchResponse.data.rolloutStatus).toBe(RolloutStatus.IN_PROGRESS);
      expect(patchResponse.data.policies.serviceBuckets).toEqual(["vip-fleet", "express-tier"]);
      expect(patchResponse.data.policies.maxCandidates).toBe(12);

      // Verify subsequent GET readback reflects updated values
      const readback = controller.getPlatformAdapter("owned-dispatch", platformAdminIdentity, "req-readback-1");
      expect(readback.data.config.isEnabled).toBe(false);
      expect(readback.data.rolloutStatus).toBe(RolloutStatus.IN_PROGRESS);
      expect(readback.data.policies.serviceBuckets).toEqual(["vip-fleet", "express-tier"]);
      expect(readback.data.policies.maxCandidates).toBe(12);
    });

    it("rejects writes from callers with foundation:read only (missing foundation:write)", () => {
      expect(() =>
        controller.updatePlatformAdapter(
          "owned-dispatch",
          { config: { isEnabled: false } },
          readOnlyPlatformIdentity,
          "req-nowrite",
        ),
      ).toThrowError(ApiRequestError);

      try {
        controller.updatePlatformAdapter(
          "owned-dispatch",
          { config: { isEnabled: false } },
          readOnlyPlatformIdentity,
          "req-nowrite",
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("PLATFORM_ADMIN_FORBIDDEN");
      }
    });

    it("rejects writes from unauthorized realms (driver, tenant) with 403", () => {
      expect(() =>
        controller.updatePlatformAdapter(
          "owned-dispatch",
          { config: { isEnabled: false } },
          driverIdentity,
          "req-driver-write",
        ),
      ).toThrowError(ApiRequestError);
    });

    it("returns 404 when attempting to PATCH a non-existent adapter", () => {
      expect(() =>
        controller.updatePlatformAdapter(
          "non-existent-adapter",
          { config: { isEnabled: true } },
          platformAdminIdentity,
          "req-notfound-patch",
        ),
      ).toThrowError(ApiRequestError);

      try {
        controller.updatePlatformAdapter(
          "non-existent-adapter",
          { config: { isEnabled: true } },
          platformAdminIdentity,
          "req-notfound-patch",
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("PLATFORM_ADAPTER_NOT_FOUND");
      }
    });

    it("records audit log when adapter is updated", () => {
      const logsBefore = recordedAudits.length;

      controller.updatePlatformAdapter(
        "srx-v3",
        { config: { isEnabled: true }, rolloutStatus: RolloutStatus.COMPLETED },
        platformAdminIdentity,
        "req-audit-test",
      );

      expect(recordedAudits.length).toBe(logsBefore + 1);
      const latestLog = recordedAudits[recordedAudits.length - 1];
      expect(latestLog.resourceType).toBe("platform_adapter");
      expect(latestLog.resourceId).toBe("srx-v3");
      expect(latestLog.actorId).toBe("platform-admin-01");
    });
  });

  describe("Controller POST /adapters", () => {
    it("creates a new adapter and makes it immediately readable", () => {
      const newAdapterPayload = {
        id: "tw-metro-transit",
        platformCode: "METRO_TW",
        name: "台灣都會捷運整合轉接器",
        version: "1.0.0",
        credentialExpiresAt: "2026-11-30T00:00:00.000Z",
      };

      const createResponse = controller.createPlatformAdapter(
        newAdapterPayload,
        platformAdminIdentity,
        "req-create-1",
      );

      expect(createResponse.data.id).toBe("tw-metro-transit");
      expect(createResponse.data.platformCode).toBe("METRO_TW");
      expect(createResponse.data.credentialExpiresAt).toBe("2026-11-30T00:00:00.000Z");

      // Verify list includes the new adapter
      const listResponse = controller.listPlatformAdapters(platformAdminIdentity, "req-list-after-create");
      expect(listResponse.data.items.some((a) => a.id === "tw-metro-transit")).toBe(true);
    });

    it("rejects adapter creation by unauthorized caller", () => {
      expect(() =>
        controller.createPlatformAdapter(
          { id: "rogue-adapter", platformCode: "ROGUE", name: "Rogue" },
          driverIdentity,
          "req-rogue",
        ),
      ).toThrowError(ApiRequestError);
    });
  });

  describe("Multi-Instance Synchronization & Persistence", () => {
    it("synchronizes adapter updates across independent service instances within process", () => {
      const serviceA = new PlatformAdminService(mockAuditNotificationService as any);
      const controllerA = new PlatformAdminController(serviceA);

      const serviceB = new PlatformAdminService(mockAuditNotificationService as any);
      const controllerB = new PlatformAdminController(serviceB);

      // Mutate via controllerA
      controllerA.updatePlatformAdapter(
        "cityride-forwarder",
        {
          config: { isEnabled: false },
          policies: {
            serviceBuckets: ["express-sync-test"],
            maxCandidates: 8,
            acceptTimeoutSeconds: 30,
            manualFallbackThresholdSeconds: 60,
            financeAuthorityMode: "OWNED" as const,
          },
        },
        platformAdminIdentity,
        "req-sync-1",
      );

      // Read back via controllerB / serviceB
      const readbackB = controllerB.getPlatformAdapter(
        "cityride-forwarder",
        platformAdminIdentity,
        "req-sync-readback",
      );
      expect(readbackB.data.config.isEnabled).toBe(false);
      expect(readbackB.data.policies.serviceBuckets).toEqual(["express-sync-test"]);

      const listB = serviceB.listPlatformAdapters();
      const cityrideInB = listB.find((a) => a.id === "cityride-forwarder");
      expect(cityrideInB?.config.isEnabled).toBe(false);
    });

    it("persists created adapter and preserves it across onModuleInit reloads", async () => {
      const service1 = new PlatformAdminService(mockAuditNotificationService as any);
      const controller1 = new PlatformAdminController(service1);

      const newId = "kura-bus-adapter";
      controller1.createPlatformAdapter(
        {
          id: newId,
          platformCode: "KURA_BUS",
          name: "Kura Bus Fleet Adapter",
          version: "1.0.0",
          credentialExpiresAt: "2026-12-31T00:00:00.000Z",
        },
        platformAdminIdentity,
        "req-persist-create",
      );

      // Create service2 and simulate module reload
      const service2 = new PlatformAdminService(mockAuditNotificationService as any);
      await service2.onModuleInit();

      const retrieved = service2.getPlatformAdapter(newId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.platformCode).toBe("KURA_BUS");
      expect(retrieved?.credentialExpiresAt).toBe("2026-12-31T00:00:00.000Z");
    });
  });
});
