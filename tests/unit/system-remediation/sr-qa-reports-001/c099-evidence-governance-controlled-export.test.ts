import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  assertEvidenceAccess,
  getEvidenceGovernanceCatalog,
  getEvidenceRetentionPolicy,
  listEvidenceRetentionPolicies,
  type EvidenceAccessIdentity,
} from "../../../../apps/api/src/common/evidence-governance";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";

describe("C099: 證據清單治理、逐 Family 授權邊界、法律保留與多維匯出驗收", () => {
  const audit = new AuditNotificationService();
  const platformAdminIdentity: EvidenceAccessIdentity = {
    actorType: "platform_admin",
    actorId: "admin-sec-001",
    realm: "platform",
    scopes: ["audit:read", "reports:read", "multi_taxi_records:export"],
    tenantId: null,
  };

  const tenantAdminIdentity: EvidenceAccessIdentity = {
    actorType: "tenant_admin",
    actorId: "tenant-lead-001",
    realm: "tenant",
    scopes: ["reports:read", "audit:read", "tenant:webhooks:read", "tenant:read"],
    tenantId: "tenant-metro-001",
  };

  const opsDispatcherIdentity: EvidenceAccessIdentity = {
    actorType: "ops_user",
    actorId: "ops-user-001",
    realm: "ops",
    scopes: ["audit:read"],
    tenantId: null,
  };

  it("證據治理目錄涵蓋完整 Phase 1 證據家族與法律保留工作流程規範", () => {
    const catalog = getEvidenceGovernanceCatalog();

    expect(catalog.version).toBe("phase1-2026-04-29");
    expect(catalog.policies.length).toBe(12);

    const families = catalog.policies.map((p) => p.family);
    expect(families).toContain("call_recording");
    expect(families).toContain("report_artifact");
    expect(families).toContain("filing_package");
    expect(families).toContain("audit_log");
    expect(families).toContain("webhook_delivery");
    expect(families).toContain("eligibility_verification");
    expect(families).toContain("proof_bundle");

    // 驗證法律保留共通規範
    expect(catalog.legalHoldWorkflow).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Platform admin or ops places the hold"),
        expect.stringContaining("Archive and deletion workers must skip held evidence"),
        expect.stringContaining("Tenant-visible surfaces may note that evidence is under hold"),
      ]),
    );

    // 驗證 Phase 1 家族法律保留支援
    for (const family of ["call_recording", "report_artifact", "filing_package", "audit_log", "webhook_delivery", "eligibility_verification", "proof_bundle"]) {
      const policy = catalog.policies.find((p) => p.family === family);
      expect(policy).toBeDefined();
      expect(policy?.legalHold.supported).toBe(true);
      expect(policy?.legalHold.deletionSuppressed).toBe(true);
      expect(policy?.legalHold.releaseActors).toContain("platform_admin");
    }
  });

  it("逐 Family 授權邊界：驗證平臺管理員、營運人員、租戶管理員之合法存取與越權阻斷", () => {
    // 1. call_recording: 平臺管理員與營運人員允許；租戶管理員嚴格禁止 (403)
    const callRecPolicy = assertEvidenceAccess({
      family: "call_recording",
      identity: platformAdminIdentity,
    });
    expect(callRecPolicy.family).toBe("call_recording");

    expect(() =>
      assertEvidenceAccess({
        family: "call_recording",
        identity: tenantAdminIdentity,
        tenantId: "tenant-metro-001",
      }),
    ).toThrowError(ApiRequestError);

    try {
      assertEvidenceAccess({
        family: "call_recording",
        identity: tenantAdminIdentity,
        tenantId: "tenant-metro-001",
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err.status).toBe(403);
      expect(err.response?.error?.code).toBe("EVIDENCE_ACCESS_FORBIDDEN");
    }

    // 2. report_artifact: 租戶在同租戶 ID 下允許；跨租戶或無 reports:read 時禁止
    const tenantReportPolicy = assertEvidenceAccess({
      family: "report_artifact",
      identity: tenantAdminIdentity,
      tenantId: "tenant-metro-001",
    });
    expect(tenantReportPolicy.family).toBe("report_artifact");

    // 跨租戶存取拒絕
    expect(() =>
      assertEvidenceAccess({
        family: "report_artifact",
        identity: tenantAdminIdentity,
        tenantId: "tenant-different-corp",
      }),
    ).toThrowError(ApiRequestError);

    // 缺乏 reports:read scope 拒絕
    const unprivilegedTenant: EvidenceAccessIdentity = {
      ...tenantAdminIdentity,
      scopes: ["unrelated:scope"],
    };
    expect(() =>
      assertEvidenceAccess({
        family: "report_artifact",
        identity: unprivilegedTenant,
        tenantId: "tenant-metro-001",
      }),
    ).toThrowError(ApiRequestError);

    // 3. audit_log: 租戶需具備 audit:read 且租戶對齊
    const tenantAuditPolicy = assertEvidenceAccess({
      family: "audit_log",
      identity: tenantAdminIdentity,
      tenantId: "tenant-metro-001",
    });
    expect(tenantAuditPolicy.family).toBe("audit_log");
  });

  it("多變數防呆：查詢不存在或非法之證據家族時拋出 404 NOT_FOUND", () => {
    try {
      getEvidenceRetentionPolicy("non_existent_family" as any);
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(404);
      expect(err.response?.error?.code).toBe("EVIDENCE_POLICY_NOT_FOUND");
    }
  });

  it("多元計程車營運匯出 (Multi-Taxi Export)：預覽計數、格式要求與權限校驗", () => {
    const service = new ReportingFilingService(audit);

    // 1. 具備 multi_taxi_records:export 之平臺管理員成功預覽
    const preview = service.previewMultiTaxiTripExport(
      { month: "2026-09" },
      42,
      platformAdminIdentity,
      "req-preview-001",
    );
    expect(preview.scope.month).toBe("2026-09");
    expect(preview.recordCount).toBe(42);
    expect(preview.format).toBe("csv");
    expect(preview.purposeRequired).toBe(true);

    // 2. 租戶管理員或非平臺身分嘗試預覽 -> 拋出 403 MULTI_TAXI_EXPORT_FORBIDDEN
    try {
      service.previewMultiTaxiTripExport(
        { month: "2026-09" },
        10,
        tenantAdminIdentity,
        "req-preview-denied",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(403);
      expect(err.response?.error?.code).toBe("MULTI_TAXI_EXPORT_FORBIDDEN");
    }

    // 3. 非法月份格式防呆 -> 拋出 400 MULTI_TAXI_EXPORT_MONTH_INVALID
    try {
      service.previewMultiTaxiTripExport(
        { month: "2026/09" }, // 非 YYYY-MM
        10,
        platformAdminIdentity,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("MULTI_TAXI_EXPORT_MONTH_INVALID");
    }
  });

  it("多元計程車匯出任務建立：冪等重試支援、變更衝突拒絕 (409) 與缺少必填欄位防呆 (400)", () => {
    const service = new ReportingFilingService(audit);

    const exportCommand = {
      scope: { month: "2026-09" },
      purpose: "2026年9月份監理機關例行營運抽檢檔案匯出",
      idempotencyKey: "idemp-mtx-export-001",
    };

    // 1. 建立匯出任務
    const accepted = service.createMultiTaxiTripExportJob(
      exportCommand,
      [],
      platformAdminIdentity,
      "req-export-create-001",
    );
    expect(accepted.jobId).toBeDefined();
    expect(accepted.status).toBe("pending");
    expect(accepted.idempotentReplay).toBe(false);

    // 2. 使用相同 idempotencyKey 重送 -> 冪等重放 (idempotentReplay: true)
    const replayed = service.createMultiTaxiTripExportJob(
      exportCommand,
      [],
      platformAdminIdentity,
      "req-export-replay-001",
    );
    expect(replayed.jobId).toBe(accepted.jobId);
    expect(replayed.idempotentReplay).toBe(true);

    // 3. 使用相同 idempotencyKey 但不同 payload (如不同 purpose) -> 拋出 409 Conflict
    try {
      service.createMultiTaxiTripExportJob(
        {
          ...exportCommand,
          purpose: "完全不同之匯出目的，意圖篡改任務參數",
        },
        [],
        platformAdminIdentity,
        "req-export-conflict",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("MULTI_TAXI_EXPORT_IDEMPOTENCY_CONFLICT");
    }

    // 4. 缺少必填 purpose 時拋出 400 BAD_REQUEST
    try {
      service.createMultiTaxiTripExportJob(
        {
          ...exportCommand,
          purpose: "",
          idempotencyKey: "idemp-mtx-export-no-purpose",
        },
        [],
        platformAdminIdentity,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("MULTI_TAXI_EXPORT_FIELD_REQUIRED");
    }
  });
});
