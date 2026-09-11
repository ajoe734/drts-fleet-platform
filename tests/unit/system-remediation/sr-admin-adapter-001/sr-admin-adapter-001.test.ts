import { describe, expect, it, vi } from "vitest";

import { resolveRouteAuthPolicy } from "../../../../apps/api/src/common/auth";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminController } from "../../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import {
  PlatformAdapterRevisionConflictError,
  PlatformAdminRepository,
} from "../../../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";

// SR-ADMIN-ADAPTER-001: wires the platform-admin adapter registry API (which
// had no route/service implementation at all in this worktree -- every
// /platform-admin/adapters* request 404'd) and replaces the previous UI-side
// fixed "expires in 6 days / 2026-05-31" copy with a server-computed
// credential-expiry-warning state (unknown/ok/warning/expired) derived from
// each adapter's real `credentialExpiry.expiresAt`.

function getStatus(error: unknown): number {
  expect(error).toBeInstanceOf(ApiRequestError);
  return (error as ApiRequestError).getStatus();
}

describe("SR-ADMIN-ADAPTER-001 platform adapter registry", () => {
  it("lists and reads back adapters with a server-computed credential-expiry-warning per adapter", async () => {
    const service = new PlatformAdminService(new AuditNotificationService());
    await service.onModuleInit();

    const listed = service.listPlatformAdapters();
    expect(listed.length).toBeGreaterThan(0);
    for (const adapter of listed) {
      expect(adapter.credentialExpiryWarning?.state).toMatch(
        /^(unknown|ok|warning|expired)$/,
      );
    }

    const first = listed[0]!;
    const fetched = service.getPlatformAdapter(first.id);
    expect(fetched).toEqual(
      expect.objectContaining({ id: first.id, revision: first.revision }),
    );
  });

  it("resolves the four credential-expiry-warning states from real expiresAt values, not a fixed date", async () => {
    const service = new PlatformAdminService(new AuditNotificationService());
    await service.onModuleInit();
    const adapterId = service.listPlatformAdapters()[0]!.id;
    const now = Date.now();

    const unknownNullExpiry = await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: null,
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("unknown");
    expect(unknownNullExpiry?.credentialExpiryWarning?.state).toBe("unknown");

    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: {
        reference: "rot-1",
        expiresAt: new Date(now + 400 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("ok");

    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: {
        reference: "rot-2",
        expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("warning");

    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: {
        reference: "rot-3",
        expiresAt: new Date(now - 60 * 1000).toISOString(),
      },
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("expired");
  });

  it("treats an unparsable expiresAt as unknown, never as ok", async () => {
    const service = new PlatformAdminService(new AuditNotificationService());
    await service.onModuleInit();
    const adapterId = service.listPlatformAdapters()[0]!.id;

    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: { reference: "bad", expiresAt: "not-a-date" },
    });

    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("unknown");
  });

  it("404s getPlatformAdapter and the credential-expiry-warning read for an unknown adapter, never fabricating a result", async () => {
    const service = new PlatformAdminService(new AuditNotificationService());
    await service.onModuleInit();

    expect(service.getPlatformAdapter("does-not-exist")).toBeUndefined();
    expect(() =>
      service.getPlatformAdapterCredentialExpiryWarning("does-not-exist"),
    ).toThrow(ApiRequestError);

    try {
      service.getPlatformAdapterCredentialExpiryWarning("does-not-exist");
      expect.unreachable();
    } catch (error) {
      expect(getStatus(error)).toBe(404);
    }
  });

  it("controller wraps missing adapters as 404 for get and update, and 200-envelopes real results", async () => {
    const service = new PlatformAdminService(new AuditNotificationService());
    await service.onModuleInit();
    const controller = new PlatformAdminController(service);

    expect(() => controller.getPlatformAdapter("missing")).toThrow(
      ApiRequestError,
    );
    await expect(
      controller.updatePlatformAdapter(
        "missing",
        { config: { isEnabled: true } },
        null,
      ),
    ).rejects.toThrow(ApiRequestError);

    const list = controller.listPlatformAdapters();
    expect((list.data as { items: unknown[] }).items.length).toBeGreaterThan(0);
    const firstId = (list.data as { items: Array<{ id: string }> }).items[0]!
      .id;
    const single = controller.getPlatformAdapter(firstId);
    expect((single.data as { id: string }).id).toBe(firstId);
  });

  it("round-trips a config edit through updatePlatformAdapter, bumping revision and recording server-generated audit evidence with the caller's reason and actorId", async () => {
    const auditService = new AuditNotificationService();
    const service = new PlatformAdminService(auditService);
    await service.onModuleInit();
    const before = service.listPlatformAdapters()[0]!;

    const updated = await service.updatePlatformAdapter(
      before.id,
      {
        config: { isEnabled: !before.config.isEnabled },
        reason: "rotate for maintenance window",
        expectedRevision: before.revision,
      },
      "req-1",
      "principal_platform_admin_001",
    );

    expect(updated?.config.isEnabled).toBe(!before.config.isEnabled);
    expect(updated?.revision).toBe((before.revision ?? 1) + 1);
    expect(updated?.lastMutationAudit).toEqual(
      expect.objectContaining({
        reason: "rotate for maintenance window",
        actorId: "principal_platform_admin_001",
        previousRevision: before.revision ?? 1,
        newRevision: (before.revision ?? 1) + 1,
      }),
    );

    // Read-back must reflect the same state (form correctly reads back).
    const reread = service.getPlatformAdapter(before.id);
    expect(reread?.config.isEnabled).toBe(!before.config.isEnabled);
    expect(reread?.revision).toBe(updated?.revision);

    const auditEntry = auditService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "update_platform_adapter" &&
          entry.resourceId === before.id,
      );
    expect(auditEntry).toBeTruthy();
    expect(auditEntry?.actorId).toBe("principal_platform_admin_001");

    // No secret material is ever present on the record or the audit trail.
    expect(JSON.stringify(updated)).not.toMatch(/secret/i);
    expect(JSON.stringify(auditEntry)).not.toMatch(/secret/i);
  });

  it("rejects a stale expectedRevision with a 409 conflict instead of silently overwriting", async () => {
    const service = new PlatformAdminService(new AuditNotificationService());
    await service.onModuleInit();
    const before = service.listPlatformAdapters()[0]!;

    await service.updatePlatformAdapter(before.id, {
      config: { isEnabled: !before.config.isEnabled },
    });

    await expect(
      service.updatePlatformAdapter(before.id, {
        config: { isEnabled: before.config.isEnabled },
        expectedRevision: before.revision,
      }),
    ).rejects.toMatchObject({ code: "PLATFORM_ADAPTER_REVISION_CONFLICT" });

    try {
      await service.updatePlatformAdapter(before.id, {
        expectedRevision: before.revision,
      });
      expect.unreachable();
    } catch (error) {
      expect(getStatus(error)).toBe(409);
    }
  });

  it("persists adapters and survives an independent-instance reload", async () => {
    const store = new Map<string, unknown>();
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => ({
        platformTenants: [],
        publicInfoVersions: [],
        placardVersions: [],
        platformAdapters: Array.from(store.values()),
      })),
      persistChanges: vi.fn(
        async (changes: { platformAdapters?: unknown[] }) => {
          for (const adapter of changes.platformAdapters ?? []) {
            const record = adapter as { id: string };
            store.set(record.id, record);
          }
        },
      ),
      mutateAdapterWithAudit: vi.fn(
        async (
          adapterId: string,
          _expectedRevision: number,
          updatedRecord: { id: string },
        ) => {
          store.set(adapterId, updatedRecord);
        },
      ),
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;

    const firstService = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
    );
    await firstService.onModuleInit();
    const seeded = firstService.listPlatformAdapters()[0]!;

    const mutated = await firstService.updatePlatformAdapter(seeded.id, {
      config: { isEnabled: !seeded.config.isEnabled },
      reason: "durability check",
      expectedRevision: seeded.revision,
    });
    expect(mutated).toBeTruthy();
    expect(repository.mutateAdapterWithAudit).toHaveBeenCalledWith(
      seeded.id,
      seeded.revision ?? 1,
      expect.objectContaining({ id: seeded.id }),
      expect.objectContaining({ reason: "durability check" }),
    );

    const reloadedService = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
    );
    await reloadedService.onModuleInit();

    const reloaded = reloadedService.getPlatformAdapter(seeded.id);
    expect(reloaded?.config.isEnabled).toBe(!seeded.config.isEnabled);
  });

  it("logs, but does not throw to the caller, when the durable revision-guarded write conflicts (best-effort persistence sidecar)", async () => {
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => ({
        platformTenants: [],
        publicInfoVersions: [],
        placardVersions: [],
        platformAdapters: [],
      })),
      persistChanges: vi.fn(async () => undefined),
      mutateAdapterWithAudit: vi.fn(async () => {
        throw new PlatformAdapterRevisionConflictError("owned-dispatch", 1);
      }),
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;

    const service = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
    );
    await service.onModuleInit();
    const before = service.listPlatformAdapters()[0]!;

    const updated = await service.updatePlatformAdapter(before.id, {
      config: { isEnabled: !before.config.isEnabled },
    });

    expect(updated).toBeTruthy();
    expect(repository.reportPersistenceFailure).toHaveBeenCalled();
  });

  it("requires the platform realm and a foundation scope for every /platform-admin/adapters* route (unauthorized is rejected)", () => {
    const paths = [
      "/api/platform-admin/adapters",
      "/api/platform-admin/adapters/owned-dispatch",
      "/api/platform-admin/adapters/owned-dispatch/credential-expiry-warning",
    ];

    for (const path of paths) {
      const getPolicy = resolveRouteAuthPolicy("GET", path);
      expect(getPolicy?.allowedRealms).toContain("platform");
      expect(getPolicy?.requiredScopes).toContain("foundation:read");
    }

    const writePolicy = resolveRouteAuthPolicy(
      "PATCH",
      "/api/platform-admin/adapters/owned-dispatch",
    );
    expect(writePolicy?.allowedRealms).toContain("platform");
    expect(writePolicy?.requiredScopes).toContain("foundation:write");
  });

  it("registers a new adapter with an initial revision and no fabricated audit history", async () => {
    const service = new PlatformAdminService(new AuditNotificationService());
    await service.onModuleInit();

    const registered = service.registerPlatformAdapter({
      id: "new-partner",
      platformCode: "NEWP",
      name: "New Partner",
      description: "Newly registered partner adapter.",
      version: "1.0.0",
      environment: "SANDBOX" as never,
      rolloutStage: "SANDBOX" as never,
      adapterType: "EXTERNAL_REST" as never,
      isForwarded: true,
      config: { isEnabled: false },
      rolloutStatus: "NOT_STARTED" as never,
      credentialStatus: "NOT_CONFIGURED" as never,
      webhookStatus: null,
      healthStatus: {
        lastCheckTimestamp: null,
        status: "DEGRADED",
        message: null,
      },
      policies: {
        serviceBuckets: [],
        maxCandidates: 1,
        acceptTimeoutSeconds: 30,
        manualFallbackThresholdSeconds: 60,
        financeAuthorityMode: "EXTERNAL" as never,
      },
      featureFlags: {},
      supportedActions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(registered.revision).toBe(1);
    expect(registered.lastMutationAudit).toBeNull();
    expect(service.getPlatformAdapter("new-partner")).toBeTruthy();
  });
});
