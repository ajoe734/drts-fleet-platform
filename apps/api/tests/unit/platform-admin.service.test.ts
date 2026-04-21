import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { PlatformAdminService } from "../../src/modules/platform-admin/platform-admin.service";

function createService() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const platformAdminRepository = {
    persistChanges: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
  };

  const service = new PlatformAdminService(
    auditNotificationService as never,
    platformAdminRepository as never,
  );

  return {
    service,
    auditNotificationService,
    platformAdminRepository,
  };
}

describe("PlatformAdminService.deleteDraftPublicInfoVersion", () => {
  it("deletes only draft public info versions and persists the removal", () => {
    const { service, auditNotificationService, platformAdminRepository } =
      createService();
    const draft = service.createPublicInfoVersion({
      title: "Draft version to delete",
      callPhone: null,
      complaintPhone: null,
      callRateText: null,
      fareText: null,
      paymentMethodText: null,
      effectiveFrom: null,
      effectiveTo: null,
    });

    const deleted = service.deleteDraftPublicInfoVersion(
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
    expect(platformAdminRepository.persistChanges).toHaveBeenCalledWith({
      deletedPublicInfoVersionIds: [draft.versionId],
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-delete-draft",
        actorId: "platform-admin-jwt-011",
        actionName: "delete_draft_public_info_version",
        resourceId: draft.versionId,
      }),
    );
  });

  it("rejects deleting published public info versions", () => {
    const { service, platformAdminRepository } = createService();
    const published = service
      .listPublicInfoVersions()
      .find((version) => version.status === "published");

    expect(published).toBeDefined();
    expect(() =>
      service.deleteDraftPublicInfoVersion(published!.versionId),
    ).toThrowError(ApiRequestError);
    expect(platformAdminRepository.persistChanges).not.toHaveBeenCalledWith(
      expect.objectContaining({
        deletedPublicInfoVersionIds: [published!.versionId],
      }),
    );
  });
});

describe("PlatformAdminService.publishPlacardVersion", () => {
  it("records the verified publisher actorId in placard publish audit logs", () => {
    const { service, auditNotificationService, platformAdminRepository } =
      createService();
    const draftPublicInfo = service.createPublicInfoVersion({
      title: "Draft disclosure for placard publish",
      callPhone: null,
      complaintPhone: null,
      callRateText: null,
      fareText: null,
      paymentMethodText: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    const placard = service.generatePlacardVersion(
      {
        versionCode: "placard-2026-q4",
        publicInfoVersionId: draftPublicInfo.versionId,
        templateName: "seatback-v2",
        publishedAt: null,
      },
      "req-generate-placard",
    );

    const published = service.publishPlacardVersion(
      placard.placardVersionId,
      {},
      "req-publish-placard",
      "platform-admin-jwt-022",
    );

    expect(published.publishedAt).toEqual(expect.any(String));
    expect(platformAdminRepository.persistChanges).toHaveBeenCalledWith({
      placardVersions: [
        expect.objectContaining({ placardVersionId: placard.placardVersionId }),
      ],
    });
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
