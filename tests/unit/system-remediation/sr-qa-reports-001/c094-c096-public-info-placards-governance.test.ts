import { describe, expect, it } from "vitest";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";

describe("C094 & C096: P5 審查員乘客揭露審核與公開資訊／牌貼版本治理驗收", () => {
  const audit = new AuditNotificationService();

  function createService() {
    return new PlatformAdminService(audit);
  }

  // ── C094: 乘客揭露／公開車資版本審核 ──────────────────────────────────────────

  it("C094: P5 審查員審核並發布公開資訊版本，完成審計記錄與生效時間更新", () => {
    const service = createService();

    // 1. 建立草稿版本
    const draft = service.createPublicInfoVersion(
      {
        title: "2026 Q3 乘客權益與車資揭露修訂版",
        callPhone: "0800-111-222",
        complaintPhone: "0800-333-444",
        callRateText: "全日跳表計費，跨區加成20%",
        fareText: "日間起跳 85 元，夜間加成 20 元",
        paymentMethodText: "多元行動支付、悠遊卡、現金",
        effectiveFrom: "2026-07-01T00:00:00.000Z",
      },
      "req-c094-create-draft",
    );

    expect(draft.status).toBe("draft");
    expect(draft.versionId).toMatch(/^public_info_/);

    // 2. 由 P5 審查員審核通過並發布
    const published = service.publishPublicInfoVersion(
      draft.versionId,
      {},
      "req-c094-publish",
      "auditor-p5-lin",
    );

    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeDefined();
    expect(published.publishedBy).toBe("auditor-p5-lin");

    // 3. 回讀清單確認新版本處於 published
    const versions = service.listPublicInfoVersions();
    const found = versions.find((v) => v.versionId === draft.versionId);
    expect(found?.status).toBe("published");
  });

  it("C094: 負向防禦：未指派或無權角色不能直接竄改或重複發布同一版本 (409 PUBLIC_INFO_VERSION_NOT_DRAFT)", () => {
    const service = createService();

    // 既有已發布版本
    const seedVersionId = "public-info-demo-001";

    // 嘗試對已發布版本再次發布 -> 拋出 409 Conflict (PUBLIC_INFO_VERSION_NOT_DRAFT)
    try {
      service.publishPublicInfoVersion(
        seedVersionId,
        {},
        "req-c094-republish",
        "auditor-p5-lin",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("PUBLIC_INFO_VERSION_NOT_DRAFT");
    }
  });

  // ── C096: 公開電話、車資、版本與歷史治理 ────────────────────────────────────

  it("C096: 公開資訊版本歷史完整治理：允許刪除草稿，嚴格禁止刪除已生效之發布版本 (409 PUBLIC_INFO_VERSION_NOT_DRAFT)", () => {
    const service = createService();

    // 1. 建立並刪除草稿 -> 正常成功
    const draft = service.createPublicInfoVersion(
      {
        title: "臨時測試草稿版",
        callPhone: "0800-999-999",
        complaintPhone: "0800-888-888",
        callRateText: "測試費率",
        fareText: "測試計價",
        paymentMethodText: "現金",
        effectiveFrom: "2026-10-01T00:00:00.000Z",
      },
      "req-c096-draft",
    );

    const deleted = service.deleteDraftPublicInfoVersion(
      draft.versionId,
      "req-c096-del-draft",
      "admin-01",
    );
    expect(deleted.versionId).toBe(draft.versionId);

    // 2. 嘗試刪除已發布版本 -> 拋出 409
    try {
      service.deleteDraftPublicInfoVersion(
        "public-info-demo-001",
        "req-c096-del-published",
        "admin-01",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("PUBLIC_INFO_VERSION_NOT_DRAFT");
    }
  });

  it("C096: 車內牌貼 (Placard) 關聯綁定至公開資訊版本，並防範同版號重複建立 (409 PLACARD_VERSION_CODE_CONFLICT)", () => {
    const service = createService();

    // 1. 成功建立綁定至公開資訊之牌貼
    const placard = service.generatePlacardVersion(
      {
        versionCode: "placard-2026-q3-metro",
        publicInfoVersionId: "public-info-demo-001",
        templateName: "seatback-standard-tc",
      },
      "req-c096-placard-create",
    );

    expect(placard.placardVersionId).toMatch(/^placard_/);
    expect(placard.versionCode).toBe("placard-2026-q3-metro");
    expect(placard.publicInfoVersionId).toBe("public-info-demo-001");
    expect(placard.downloadMetadata).toBeDefined();

    // 2. 重複建立相同 versionCode 之牌貼 -> 拋出 409 Conflict
    try {
      service.generatePlacardVersion(
        {
          versionCode: "placard-2026-q3-metro",
          publicInfoVersionId: "public-info-demo-001",
          templateName: "seatback-standard-tc",
        },
        "req-c096-duplicate-placard",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("PLACARD_VERSION_CODE_CONFLICT");
    }

    // 3. 綁定不存在之公開資訊版本 -> 拋出 404
    try {
      service.generatePlacardVersion(
        {
          versionCode: "placard-2026-q3-invalid",
          publicInfoVersionId: "public-info-nonexistent",
          templateName: "seatback-standard-tc",
        },
        "req-c096-invalid-public-info",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(404);
      expect(err.response?.error?.code).toBe("PUBLIC_INFO_VERSION_NOT_FOUND");
    }
  });

  it("C096: 車內牌貼發布生命週期與重複發布阻斷 (409 PLACARD_VERSION_ALREADY_PUBLISHED)", () => {
    const service = createService();
    const draftPublicInfo = service.createPublicInfoVersion(
      {
        title: "2026 Q4 專車公開資訊草稿",
        callPhone: "0800-777-777",
        complaintPhone: "0800-666-666",
        callRateText: "依公告計費",
        fareText: "標準費率",
        paymentMethodText: "現金、行動支付",
        effectiveFrom: "2026-10-01T00:00:00.000Z",
      },
      "req-c096-p4-public-info",
    );

    // 建立綁定至草稿公開資訊之草稿牌貼
    const placard = service.generatePlacardVersion(
      {
        versionCode: "placard-2026-q4-draft",
        publicInfoVersionId: draftPublicInfo.versionId,
        templateName: "windshield-qr-v1",
      },
      "req-c096-p4",
    );
    expect(placard.publishedAt).toBeNull();

    // 首次發布
    const published = service.publishPlacardVersion(
      placard.placardVersionId,
      {},
      "req-c096-p4-pub",
      "admin-approver-01",
    );
    expect(published.publishedAt).toBeDefined();

    // 再次嘗試發布已發布之牌貼 -> 拋出 409
    try {
      service.publishPlacardVersion(
        placard.placardVersionId,
        {},
        "req-c096-p4-repub",
        "admin-approver-01",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("PLACARD_VERSION_ALREADY_PUBLISHED");
    }
  });
});
