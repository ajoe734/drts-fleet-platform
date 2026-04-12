import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
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
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        placardVersions: [
          expect.objectContaining({
            versionCode: "placard-2026-q3",
            publicInfoVersionId: "public-info-persisted-001",
          }),
        ],
      }),
    );
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "generate_placard_version",
    );
  });
});
