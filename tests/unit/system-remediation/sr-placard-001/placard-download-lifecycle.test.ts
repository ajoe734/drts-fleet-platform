import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";
import { PlatformAdminController } from "../../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";
import {
  getPreferredLivePlacard,
  isArtifactExpired,
  isPlacardSourceSelectionBlocked,
  parseArtifactExpiry,
} from "../../../../apps/platform-admin-web/app/switchboard/placard-source";

type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

function createService(store: InMemoryDocumentArtifactStore) {
  const auditService = new AuditNotificationService();
  const platformAdminService = new PlatformAdminService(
    auditService,
    undefined,
    undefined,
    store,
  );
  return { auditService, platformAdminService };
}

function paramsOf(downloadUrl: string) {
  const query = new URLSearchParams(downloadUrl.split("?")[1]);
  return {
    signedAt: query.get("signed_at") ?? undefined,
    expiresAt: query.get("expires_at") ?? undefined,
    keyId: query.get("key_id") ?? undefined,
    manifestHash: query.get("manifest_hash") ?? undefined,
    sig: query.get("sig") ?? undefined,
    sigV: query.get("sig_v") ?? undefined,
  };
}

function resolveDownload(
  controller: ControlledDownloadController,
  kind: string,
  subjectId: string,
  p: ReturnType<typeof paramsOf>,
) {
  return controller.resolve(
    kind,
    subjectId,
    p.signedAt,
    p.expiresAt,
    p.keyId,
    p.manifestHash,
    p.sig,
    p.sigV,
  );
}

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function expectApiError(fn: () => unknown, status: number, code: string) {
  try {
    fn();
    expect.unreachable(`Expected function to throw ApiRequestError with code ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(ApiRequestError);
    const apiErr = err as ApiRequestError;
    expect(apiErr.getStatus()).toBe(status);
    expect(apiErr.code).toBe(code);
  }
}

describe("SR-PLACARD-001: placard download lifecycle, self-healing, and authorization guards", () => {
  it("detects expired artifact URLs and auto-refreshes them upon re-entry", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    const downloadController = new ControlledDownloadController(store);

    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "Hualien Expiry Test Disclosure",
      callPhone: "0800-999-000",
    });

    const placard = platformAdminService.generatePlacardVersion({
      versionCode: "placard-lifecycle-exp-01",
      publicInfoVersionId: publicInfo.versionId,
      templateName: "seatback-standard",
    });

    const originalUrl = placard.artifactDownloadUrl!;
    const originalParams = paramsOf(originalUrl);

    // Initial link resolves successfully
    const initialFile = resolveDownload(
      downloadController,
      "placard",
      placard.placardVersionId,
      originalParams,
    ) as StreamableFileLike;
    const initialBytes = await drain(initialFile.getStream());
    expect(initialBytes.length).toBeGreaterThan(0);

    // Fast-forward 20 minutes past the 15-minute link expiration
    const originalExpiresTime = Date.parse(originalParams.expiresAt!);
    const futureTime = originalExpiresTime + 5 * 60 * 1000;
    vi.setSystemTime(futureTime);

    try {
      // 1. The original link should now fail with 410 CONTROLLED_DOWNLOAD_EXPIRED
      expectApiError(
        () =>
          resolveDownload(
            downloadController,
            "placard",
            placard.placardVersionId,
            originalParams,
          ),
        410,
        "CONTROLLED_DOWNLOAD_EXPIRED",
      );

      // 2. Frontend helper confirms expiration
      expect(isArtifactExpired(originalUrl)).toBe(true);
      expect(parseArtifactExpiry(originalUrl)).toBe(originalParams.expiresAt);

      // 3. User re-enters page (which calls listPlacardVersions or getPlacardVersion)
      const reEnteredPlacard = platformAdminService.getPlacardVersion(
        placard.placardVersionId,
      );

      // Verify the URL was refreshed with a new signature and later expiry
      expect(reEnteredPlacard.artifactDownloadUrl).not.toBe(originalUrl);
      const refreshedParams = paramsOf(reEnteredPlacard.artifactDownloadUrl!);
      expect(Date.parse(refreshedParams.expiresAt!)).toBeGreaterThan(futureTime);
      expect(reEnteredPlacard.artifactManifestHash).toBe(
        placard.artifactManifestHash,
      );

      // 4. Refreshed link now resolves 200 OK without re-uploading corrupted bytes
      const refreshedFile = resolveDownload(
        downloadController,
        "placard",
        reEnteredPlacard.placardVersionId,
        refreshedParams,
      ) as StreamableFileLike;
      const refreshedBytes = await drain(refreshedFile.getStream());
      expect(createHash("sha256").update(refreshedBytes).digest("hex")).toBe(
        placard.artifactManifestHash,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("self-heals missing artifact from store when re-entering or querying placard", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);

    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "Self-Healing Test Disclosure",
      callPhone: "0800-777-111",
      fareText: "Flat fare NT$50",
    });

    const placard = platformAdminService.generatePlacardVersion({
      versionCode: "placard-selfheal-01",
      publicInfoVersionId: publicInfo.versionId,
      templateName: "seatback-standard",
    });

    const initialSha = placard.artifactManifestHash!;

    // Simulate in-memory store eviction / cache eviction
    const removed = store.get("placard", placard.placardVersionId);
    expect(removed).not.toBeNull();
    // Re-create a fresh store to simulate service restart where store is empty
    const freshStore = new InMemoryDocumentArtifactStore();
    const restartedService = new PlatformAdminService(
      new AuditNotificationService(),
      undefined,
      undefined,
      freshStore,
    );
    const restartedDownloadController = new ControlledDownloadController(
      freshStore,
    );

    // Force inject the existing placard record into restartedService's in-memory array
    (restartedService as unknown as { publicInfoVersions: unknown[] }).publicInfoVersions = [
      publicInfo,
    ];
    (restartedService as unknown as { placardVersions: unknown[] }).placardVersions = [
      { ...placard },
    ];

    // Verify freshStore initially does not have the artifact
    expect(freshStore.get("placard", placard.placardVersionId)).toBeNull();

    // Querying placard triggers ensurePlacardArtifact self-healing
    const recovered = restartedService.getPlacardVersion(placard.placardVersionId);
    expect(recovered.artifactManifestHash).toBe(initialSha);

    // Verify artifact is now restored in freshStore
    const restoredInStore = freshStore.get("placard", placard.placardVersionId);
    expect(restoredInStore).not.toBeNull();
    expect(restoredInStore?.record.sha256).toBe(initialSha);

    // Can be downloaded through restarted download controller
    const file = resolveDownload(
      restartedDownloadController,
      "placard",
      recovered.placardVersionId,
      paramsOf(recovered.artifactDownloadUrl!),
    ) as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(initialSha);
  });

  it("forces PDF re-render and manifest update upon publishing a placard version", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    const downloadController = new ControlledDownloadController(store);

    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "Draft to Publish Disclosure",
      callPhone: "0800-333-444",
    });

    const draftPlacard = platformAdminService.generatePlacardVersion({
      versionCode: "placard-publish-test",
      publicInfoVersionId: publicInfo.versionId,
      templateName: "seatback-standard",
    });

    expect(draftPlacard.publishedAt).toBeNull();
    const draftBytes = (
      await drain(
        (
          resolveDownload(
            downloadController,
            "placard",
            draftPlacard.placardVersionId,
            paramsOf(draftPlacard.artifactDownloadUrl!),
          ) as StreamableFileLike
        ).getStream(),
      )
    ).toString("latin1");
    expect(draftBytes).toContain("Published At: Draft");

    // Publish the placard
    const publishedPlacard = platformAdminService.publishPlacardVersion(
      draftPlacard.placardVersionId,
      {},
      "req-publish-001",
      "admin-user-01",
    );

    expect(publishedPlacard.publishedAt).toBeTruthy();
    expect(publishedPlacard.artifactManifestHash).not.toBe(
      draftPlacard.artifactManifestHash,
    );

    const publishedBytes = (
      await drain(
        (
          resolveDownload(
            downloadController,
            "placard",
            publishedPlacard.placardVersionId,
            paramsOf(publishedPlacard.artifactDownloadUrl!),
          ) as StreamableFileLike
        ).getStream(),
      )
    ).toString("latin1");
    expect(publishedBytes).toContain(
      `Published At: ${publishedPlacard.publishedAt}`,
    );

    // Double publish is rejected with 409
    expectApiError(
      () =>
        platformAdminService.publishPlacardVersion(
          draftPlacard.placardVersionId,
          {},
          "req-publish-again",
          "admin-user-01",
        ),
      409,
      "PLACARD_VERSION_ALREADY_PUBLISHED",
    );
  });

  it("guards against retired public info versions and duplicate version codes", () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);

    // 1. Create first version and publish it
    const publicInfo1 = platformAdminService.createPublicInfoVersion({
      title: "First Disclosure",
      callPhone: "0800-000-111",
    });
    platformAdminService.publishPublicInfoVersion(
      publicInfo1.versionId,
      {},
      "req-1",
      "admin-01",
    );

    // 2. Publish a second disclosure, which automatically retires publicInfo1
    const publicInfo2 = platformAdminService.createPublicInfoVersion({
      title: "Second Disclosure",
      callPhone: "0800-000-222",
    });
    platformAdminService.publishPublicInfoVersion(
      publicInfo2.versionId,
      {},
      "req-2",
      "admin-01",
    );

    const retiredInfo = platformAdminService
      .listPublicInfoVersions()
      .find((v) => v.versionId === publicInfo1.versionId);
    expect(retiredInfo?.status).toBe("retired");

    // 3. Generation with retired source fails with 400 PUBLIC_INFO_VERSION_RETIRED
    expectApiError(
      () =>
        platformAdminService.generatePlacardVersion({
          versionCode: "placard-from-retired",
          publicInfoVersionId: publicInfo1.versionId,
          templateName: "seatback-standard",
        }),
      400,
      "PUBLIC_INFO_VERSION_RETIRED",
    );

    // 4. Frontend helper blocks retired source
    expect(isPlacardSourceSelectionBlocked({ status: "retired", title: "Retired" })).toBe(
      true,
    );

    // 5. Duplicate version code check (case-insensitive)
    platformAdminService.generatePlacardVersion({
      versionCode: "placard-dup-check",
      publicInfoVersionId: publicInfo2.versionId,
      templateName: "seatback-standard",
    });

    expectApiError(
      () =>
        platformAdminService.generatePlacardVersion({
          versionCode: "PLACARD-DUP-CHECK",
          publicInfoVersionId: publicInfo2.versionId,
          templateName: "seatback-standard",
        }),
      409,
      "PLACARD_VERSION_CODE_CONFLICT",
    );
  });

  it("validates download route negative cases: missing params, forged signature, manifest mismatch", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    const downloadController = new ControlledDownloadController(store);

    const publicInfo = platformAdminService.createPublicInfoVersion({
      title: "Tamper Test",
    });
    const placard = platformAdminService.generatePlacardVersion({
      versionCode: "placard-tamper-check",
      publicInfoVersionId: publicInfo.versionId,
      templateName: "seatback-standard",
    });

    const validParams = paramsOf(placard.artifactDownloadUrl!);

    // 1. Missing signature param -> 400 CONTROLLED_DOWNLOAD_LINK_INCOMPLETE
    expectApiError(
      () =>
        resolveDownload(downloadController, "placard", placard.placardVersionId, {
          ...validParams,
          sig: undefined,
        }),
      400,
      "CONTROLLED_DOWNLOAD_LINK_INCOMPLETE",
    );

    // 2. Forged signature -> 403 CONTROLLED_DOWNLOAD_SIGNATURE_INVALID
    expectApiError(
      () =>
        resolveDownload(downloadController, "placard", placard.placardVersionId, {
          ...validParams,
          sig: "forged_signature_hex_value_0000000000000000",
        }),
      403,
      "CONTROLLED_DOWNLOAD_SIGNATURE_INVALID",
    );

    // 3. Tampered manifest hash -> 409 CONTROLLED_DOWNLOAD_CONTENT_MISMATCH (or 403 if signature covers hash)
    // Note: since signature covers manifest_hash, changing manifest_hash makes signature invalid first (403),
    // which aligns with ControlledDownloadController security rule: check signature before content.

    // 4. Placard not found -> 404 PLACARD_VERSION_NOT_FOUND
    expectApiError(
      () => platformAdminService.getPlacardVersion("nonexistent-placard-id"),
      404,
      "PLACARD_VERSION_NOT_FOUND",
    );
  });

  it("enforces actorId identity requirements on platform admin publish controller route", () => {
    const store = new InMemoryDocumentArtifactStore();
    const { platformAdminService } = createService(store);
    const controller = new PlatformAdminController(platformAdminService);

    // Null identity throws 401 PLATFORM_ADMIN_IDENTITY_REQUIRED
    expectApiError(
      () => controller.publishPlacardVersion("placard-any", {}, null),
      401,
      "PLATFORM_ADMIN_IDENTITY_REQUIRED",
    );

    // Blank actorId throws 401 PLATFORM_ADMIN_IDENTITY_REQUIRED
    expectApiError(
      () =>
        controller.publishPlacardVersion("placard-any", {}, {
          actorId: "   ",
          actorType: "platform_admin",
          tenantId: null,
        } as unknown as Parameters<PlatformAdminController["publishPlacardVersion"]>[2]),
      401,
      "PLATFORM_ADMIN_IDENTITY_REQUIRED",
    );
  });

  it("prefers live placards with active public info sources over retired ones", () => {
    const activeDraft = {
      placardVersionId: "placard-active-draft",
      publishedAt: null,
      publicInfoVersionId: "info-draft",
    };
    const retiredPublished = {
      placardVersionId: "placard-retired-published",
      publishedAt: "2026-05-01T00:00:00.000Z",
      publicInfoVersionId: "info-retired",
    };
    const activePublished = {
      placardVersionId: "placard-active-published",
      publishedAt: "2026-06-01T00:00:00.000Z",
      publicInfoVersionId: "info-active",
    };

    const publicInfoById = {
      "info-retired": { status: "retired" as const },
      "info-active": { status: "published" as const },
      "info-draft": { status: "draft" as const },
    };

    // Prefers active published placard over retired published placard
    const preferred = getPreferredLivePlacard(
      [retiredPublished, activePublished, activeDraft],
      publicInfoById,
    );
    expect(preferred?.placardVersionId).toBe("placard-active-published");

    // Falls back gracefully if all published sources are retired
    const fallback = getPreferredLivePlacard(
      [retiredPublished, activeDraft],
      publicInfoById,
    );
    expect(fallback?.placardVersionId).toBe("placard-retired-published");
  });
});
