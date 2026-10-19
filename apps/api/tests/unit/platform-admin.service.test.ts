import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { PlatformAdminService } from "../../src/modules/platform-admin/platform-admin.service";
import { PlatformAdminRepository } from "../../src/modules/platform-admin/platform-admin.repository";
import type { DatabaseService } from "../../src/common/db";
import { PublicInfoSqlWire } from "../../../../tests/unit/public-info-version-canonical-ack-20261015/wire-fixture";

function createService() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const preparation = new PlatformAdminService(
    auditNotificationService as never,
  );
  const wire = new PublicInfoSqlWire(preparation.listPublicInfoVersions());
  const platformAdminRepository = new PlatformAdminRepository(
    wire as unknown as DatabaseService,
  );
  vi.spyOn(platformAdminRepository, "persistChanges");
  // These original service cases retain their existing placard boundary;
  // public-info commands now exercise the real configured Repository SQL.
  vi.spyOn(platformAdminRepository, "claimPlacardPublish").mockResolvedValue({
    claimed: true,
    currentRecord: null,
  });
  vi.spyOn(platformAdminRepository, "finalizePlacardPublish").mockResolvedValue(
    true,
  );
  vi.spyOn(
    platformAdminRepository,
    "releasePlacardPublishClaim",
  ).mockResolvedValue(true);
  vi.spyOn(
    platformAdminRepository,
    "getPlacardVersionRecord",
  ).mockResolvedValue(null);

  const service = new PlatformAdminService(
    auditNotificationService as never,
    platformAdminRepository as never,
  );

  return {
    service,
    auditNotificationService,
    platformAdminRepository,
    wire,
  };
}

describe("PlatformAdminService.deleteDraftPublicInfoVersion", () => {
  it("deletes only draft public info versions and persists the removal", async () => {
    const { service, auditNotificationService, wire } = createService();
    const draft = await service.createPublicInfoVersion({
      title: "Draft version to delete",
      callPhone: null,
      complaintPhone: null,
      callRateText: null,
      fareText: null,
      paymentMethodText: null,
      effectiveFrom: null,
      effectiveTo: null,
    });

    const deleted = await service.deleteDraftPublicInfoVersion(
      draft.versionId,
      "req-delete-draft",
      "platform-admin-jwt-011",
    );

    expect(deleted.versionId).toBe(draft.versionId);
    expect(
      service
        .listPublicInfoVersions()
        .some((version) => version.versionId === draft.versionId),
    ).toBe(false);
    // The old mock-call check is now an actual committed canonical removal.
    expect(wire.records.has(draft.versionId)).toBe(false);
    expect(wire.statements).toContain("COMMIT");
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-delete-draft",
        actorId: "platform-admin-jwt-011",
        actionName: "delete_draft_public_info_version",
        resourceId: draft.versionId,
      }),
    );
  });

  it("rejects deleting published public info versions", async () => {
    const { service, platformAdminRepository } = createService();
    const published = service
      .listPublicInfoVersions()
      .find((version) => version.status === "published");

    expect(published).toBeDefined();
    await expect(
      service.deleteDraftPublicInfoVersion(published!.versionId),
    ).rejects.toThrowError(ApiRequestError);
    expect(platformAdminRepository.persistChanges).not.toHaveBeenCalledWith(
      expect.objectContaining({
        deletedPublicInfoVersionIds: [published!.versionId],
      }),
    );
  });
});

describe("PlatformAdminService.publishPlacardVersion", () => {
  it("records the verified publisher actorId in placard publish audit logs", async () => {
    const { service, auditNotificationService, platformAdminRepository } =
      createService();
    const draftPublicInfo = await service.createPublicInfoVersion({
      title: "Draft disclosure for placard publish",
      callPhone: null,
      complaintPhone: null,
      callRateText: null,
      fareText: null,
      paymentMethodText: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    const placard = await service.generatePlacardVersion(
      {
        versionCode: "placard-2026-q4",
        publicInfoVersionId: draftPublicInfo.versionId,
        templateName: "seatback-v2",
        publishedAt: null,
      },
      "req-generate-placard",
    );

    const published = await service.publishPlacardVersion(
      placard.placardVersionId,
      {},
      "req-publish-placard",
      "platform-admin-jwt-022",
    );

    expect(published.publishedAt).toEqual(expect.any(String));
    // Publish commits through the fenced, awaited
    // `finalizePlacardPublish` path, not the fire-and-forget
    // `persistChanges` used by other mutations (see R7-followthrough).
    expect(platformAdminRepository.finalizePlacardPublish).toHaveBeenCalledWith(
      expect.objectContaining({ placardVersionId: placard.placardVersionId }),
      expect.any(String),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-publish-placard",
        actorId: "platform-admin-jwt-022",
        actionName: "publish_placard_version",
        resourceId: placard.placardVersionId,
      }),
    );
  });
});
