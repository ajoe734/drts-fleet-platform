import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import { PlatformAdminController } from "../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminRepository } from "../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { PlatformAdminService } from "../../apps/api/src/modules/platform-admin/platform-admin.service";

describe("platform admin service", () => {
  it("publishes a public info version with immutable audit evidence", () => {
    const auditService = new AuditNotificationService();
    const platformAdminService = new PlatformAdminService(auditService);

    const draftVersion = platformAdminService.createPublicInfoVersion(
      {
        title: "2026 Q3 公開資訊版",
        callPhone: "0800-123-456",
        complaintPhone: "0800-456-789",
      },
      "public-info-create-request",
    );
    const publishedVersion = platformAdminService.publishPublicInfoVersion(
      draftVersion.versionId,
      {
        publishedBy: "platform-admin-001",
        effectiveFrom: "2026-07-01T00:00:00Z",
      },
      "public-info-publish-request",
    );

    expect(publishedVersion.status).toBe("published");
    expect(
      platformAdminService
        .listPublicInfoVersions()
        .filter((version) => version.status === "published"),
    ).toHaveLength(1);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "publish_public_info_version",
    );
    expect(auditService.listAuditLogs()[0]?.newValuesSummary).toEqual(
      expect.objectContaining({
        newVersionId: draftVersion.versionId,
      }),
    );
  });

  it("prefers the verified publisher actorId over the request body when publishing", () => {
    const auditService = new AuditNotificationService();
    const platformAdminService = new PlatformAdminService(auditService);

    const draftVersion = platformAdminService.createPublicInfoVersion(
      {
        title: "2026 Q4 公開資訊版",
      },
      "public-info-create-request",
    );
    const publishedVersion = platformAdminService.publishPublicInfoVersion(
      draftVersion.versionId,
      {
        publishedBy: "forged-body-actor",
      },
      "public-info-publish-request",
      "platform-admin-jwt-007",
    );

    expect(publishedVersion.publishedBy).toBe("platform-admin-jwt-007");
    expect(auditService.listAuditLogs()[0]).toEqual(
      expect.objectContaining({
        actorId: "platform-admin-jwt-007",
      }),
    );
    expect(auditService.listAuditLogs()[0]?.newValuesSummary).toEqual(
      expect.objectContaining({
        newVersionId: draftVersion.versionId,
        publishedBy: "platform-admin-jwt-007",
      }),
    );
  });

  it("controller forwards the verified identity actorId to publish public info", () => {
    const service = {
      publishPublicInfoVersion: vi.fn(() => ({
        versionId: "public-info-001",
        status: "published",
      })),
    } as unknown as PlatformAdminService;
    const controller = new PlatformAdminController(service);
    const identity: BootstrapRequestIdentity = {
      authMode: "bootstrap_headers",
      actorType: "platform_admin",
      actorId: "platform-admin-jwt-001",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["platform:write"],
      requestId: "req-123",
    };

    controller.publishPublicInfoVersion(
      "public-info-001",
      { publishedBy: "body-actor" },
      identity,
      "req-123",
    );

    expect(service.publishPublicInfoVersion).toHaveBeenCalledWith(
      "public-info-001",
      { publishedBy: "body-actor" },
      "req-123",
      "platform-admin-jwt-001",
    );
  });
  it("rehydrates persisted platform-admin state and writes placard changes through the repository", async () => {
    const auditService = new AuditNotificationService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        publicInfoVersions: [
          {
            versionId: "public-info-persisted-001",
            title: "Persisted Version",
            callPhone: "0800-000-001",
            complaintPhone: "0800-000-002",
            callRateText: "依表計費",
            fareText: "依公告",
            paymentMethodText: "現金",
            status: "published",
            effectiveFrom: "2026-04-01T00:00:00Z",
            effectiveTo: null,
            publishedBy: "platform-admin-001",
            publishedAt: "2026-04-01T00:00:00Z",
            createdAt: "2026-03-25T00:00:00Z",
            updatedAt: "2026-04-01T00:00:00Z",
          },
        ],
        placardVersions: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;
    const platformAdminService = new PlatformAdminService(
      auditService,
      repository,
    );

    await platformAdminService.onModuleInit();

    const placard = platformAdminService.generatePlacardVersion(
      {
        versionCode: "placard-2026-q3",
        publicInfoVersionId: "public-info-persisted-001",
        templateName: "seatback-updated",
      },
      "placard-generate-request",
    );

    await Promise.resolve();

    expect(placard.publicInfoVersionId).toBe("public-info-persisted-001");
    expect(placard.publishedAt).toBe("2026-04-01T00:00:00Z");
    expect(placard.artifactManifestHash).toBeTruthy();
    expect(placard.artifactDownloadUrl).toContain("sig=");
    expect(placard.artifactExpiresAt).toBeTruthy();
    expect(placard.downloadMetadata?.kind).toBe("placard");
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        placardVersions: [
          expect.objectContaining({
            versionCode: "placard-2026-q3",
            publicInfoVersionId: "public-info-persisted-001",
            artifactManifestHash: expect.any(String),
            artifactDownloadUrl: expect.stringContaining("sig="),
            artifactExpiresAt: expect.any(String),
          }),
        ],
      }),
    );
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "generate_placard_version",
    );
  });

  it("backfills signed placard artifact metadata for legacy persisted records", async () => {
    const auditService = new AuditNotificationService();
    const repository = {
      loadState: vi.fn(async () => ({
        publicInfoVersions: [
          {
            versionId: "public-info-persisted-002",
            title: "Legacy Published Version",
            callPhone: "0800-010-001",
            complaintPhone: "0800-010-002",
            callRateText: "依表計費",
            fareText: "依公告",
            paymentMethodText: "現金",
            status: "published",
            effectiveFrom: "2026-05-01T00:00:00Z",
            effectiveTo: null,
            publishedBy: "platform-admin-legacy",
            publishedAt: "2026-05-01T00:00:00Z",
            createdAt: "2026-04-20T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          },
        ],
        placardVersions: [
          {
            placardVersionId: "placard-legacy-001",
            versionCode: "placard-legacy-q2",
            publicInfoVersionId: "public-info-persisted-002",
            templateName: "seatback-legacy",
            artifactFileId: "artifact-legacy-001",
            publishedAt: "2026-05-01T00:00:00Z",
            createdAt: "2026-04-20T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          } as any,
        ],
      })),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;
    const platformAdminService = new PlatformAdminService(
      auditService,
      repository,
    );

    await platformAdminService.onModuleInit();

    const placard = platformAdminService.listPlacardVersions()[0];

    expect(placard).toEqual(
      expect.objectContaining({
        placardVersionId: "placard-legacy-001",
        artifactManifestHash: expect.any(String),
        artifactDownloadUrl: expect.stringContaining("sig="),
        artifactExpiresAt: expect.any(String),
      }),
    );
    expect(placard?.downloadMetadata?.kind).toBe("placard");
    expect(placard?.downloadMetadata?.manifestHash).toBe(
      placard?.artifactManifestHash,
    );
  });
});
