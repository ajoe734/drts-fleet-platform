import { describe, expect, it } from "vitest";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { EvidenceAccessIdentity } from "../../../../apps/api/src/common/evidence-governance";

async function flushBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setImmediate(resolve));
}

function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const unquote = (cell: string) => {
    const trimmed = cell.startsWith('"')
      ? cell.slice(1, -1).replaceAll('""', '"')
      : cell;
    return trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;
  };
  const splitRow = (line: string) =>
    line.split(",").map((c) => unquote(c.trim()));
  const [headerLine, ...dataLines] = lines;
  return {
    headers: splitRow(headerLine ?? ""),
    rows: dataLines.map(splitRow),
  };
}

const PLATFORM_ADMIN_IDENTITY: EvidenceAccessIdentity = {
  actorId: "usr-platform-admin-01",
  actorType: "platform_admin",
  realm: "platform",
  scopes: ["reports:read", "reports:export"],
  tenantId: null,
};

const TENANT_A_IDENTITY: EvidenceAccessIdentity = {
  actorId: "usr-tenant-a-01",
  actorType: "tenant_admin",
  realm: "tenant",
  scopes: ["reports:read"],
  tenantId: "tenant-alpha",
};

describe("C090: 營運報表使用者 - 營運報表查詢、產生與 CSV 下載驗收", () => {
  const audit = new AuditNotificationService();

  function createTestService() {
    const service = new ReportingFilingService(audit);

    // Register test feeds
    service.registerOrderFeedProvider((() => [
      {
        orderId: "ORD-001",
        tenantId: "tenant-alpha",
        status: "completed",
        fareAmount: 350,
        createdAt: "2026-09-01T08:00:00Z",
        completedAt: "2026-09-01T08:30:00Z",
        driverId: "DRV-001",
        vehicleId: "VEH-001",
      },
      {
        orderId: "ORD-002",
        tenantId: "tenant-alpha",
        status: "completed",
        fareAmount: 520,
        createdAt: "2026-09-01T09:00:00Z",
        completedAt: "2026-09-01T09:45:00Z",
        driverId: "DRV-002",
        vehicleId: "VEH-002",
      },
      {
        orderId: "ORD-003",
        tenantId: "tenant-beta",
        status: "cancelled",
        fareAmount: 0,
        createdAt: "2026-09-02T10:00:00Z",
        completedAt: null,
        driverId: "DRV-003",
        vehicleId: "VEH-003",
      },
    ]) as any);

    service.registerDriverRegistryFeedProvider((() => [
      {
        driverId: "DRV-001",
        name: "王小明",
        supportedServiceBuckets: ["standard"],
        workState: "idle",
        lifecycleStatus: "active",
        phone: "0912345678",
      },
      {
        driverId: "DRV-002",
        name: "陳美玲",
        supportedServiceBuckets: ["standard", "business"],
        workState: "busy",
        lifecycleStatus: "active",
        phone: "0923456789",
      },
    ]) as any);

    service.registerDailyDispatchRecordProvider((async () => [
      {
        dispatchDate: "2026-09-01",
        bookingId: "BKG-001",
        tenantId: "tenant-alpha",
        driverId: "DRV-001",
        vehicleId: "VEH-001",
        requestedAt: "2026-09-01T08:00:00Z",
        pickupEta: "2026-09-01T08:10:00Z",
        actualPickupTime: "2026-09-01T08:12:00Z",
        dropoffTime: "2026-09-01T08:35:00Z",
        finalStatus: "completed",
        totalFareTwd: 350,
      },
    ]) as any);

    return service;
  }

  it("正常流程：建立營運報表 job，完成後下載 CSV 並回算資料筆數與內容正確", async () => {
    const service = createTestService();

    // 1. 建立報表任務
    const accepted = service.createReportJob(
      {
        jobType: "daily_dispatch_record",
        format: "csv",
        filters: {},
      },
      "req-c090-001",
    );

    expect(accepted.jobId).toMatch(/^JOB-/);
    expect(accepted.status).toBe("queued");

    // 2. 等待非同步背景任務處理完成
    await flushBackgroundWork();

    // 3. 查詢 job 狀態與回讀
    const job = service.getReportJob(accepted.jobId, undefined, PLATFORM_ADMIN_IDENTITY);
    expect(job.status).toBe("completed");
    expect(job.artifact).toBeDefined();
    expect(job.artifact?.artifactId).toMatch(/^ART-/);
    expect(job.artifact?.artifactType).toBe("report");
    expect(job.artifact?.downloadUrl).toBeDefined();
    expect(job.artifact?.manifestHash).toBeDefined();

    // 4. 下載 artifact bytes 並解析 CSV
    const artifact = await service.renderReportArtifact(
      accepted.jobId,
      "req-c090-download",
      PLATFORM_ADMIN_IDENTITY,
    );

    expect(artifact.contentType).toBe("text/csv; charset=utf-8");
    expect(artifact.fileName).toBe(`daily_dispatch_record-${accepted.jobId}.csv`);
    expect(artifact.buffer.byteLength).toBeGreaterThan(0);

    const parsed = parseCsv(artifact.buffer.toString("utf8"));
    expect(parsed.headers.length).toBeGreaterThan(0);
    expect(parsed.rows.length).toBeGreaterThan(0);

    // 5. 驗證 artifact 的 downloadUrl 與 downloadMetadata 簽名資料
    expect(job.artifact?.downloadUrl).toBe(
      `/reports/${encodeURIComponent(accepted.jobId)}/artifact`,
    );
    expect(job.artifact?.downloadMetadata).toBeDefined();
    expect(job.artifact?.downloadMetadata.downloadUrl).toContain("/downloads/report/");
    expect(job.artifact?.downloadMetadata.downloadUrl).toContain("sig=");
    expect(job.artifact?.downloadMetadata.downloadUrl).toContain("manifest_hash=");
    expect(job.artifact?.downloadMetadata.expiresAt).toBeDefined();
  });

  it("關鍵負向：job 未完成時嘗試下載 artifact 必須被拒絕 (409 Conflict REPORT_ARTIFACT_NOT_READY)", async () => {
    const service = createTestService();

    // 建立任務但尚未完成
    const accepted = service.createReportJob(
      {
        jobType: "daily_dispatch_record",
        format: "csv",
      },
      "req-c090-pending",
    );

    // 人為設置 status 為 processing / pending 來驗證拒絕邏輯
    const rawJob = (service as any).reportJobs.find((j: any) => j.jobId === accepted.jobId);
    rawJob.status = "processing";

    expect(() => {
      service.renderReportArtifact(accepted.jobId, undefined, PLATFORM_ADMIN_IDENTITY);
    }).toThrowError(ApiRequestError);

    try {
      service.renderReportArtifact(accepted.jobId, undefined, PLATFORM_ADMIN_IDENTITY);
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("REPORT_ARTIFACT_NOT_READY");
      expect(err.response?.error?.details?.status).toBe("processing");
    }
  });

  it("關鍵負向：查詢或下載不存在之 jobId 拋出 404 (REPORT_JOB_NOT_FOUND)", () => {
    const service = createTestService();

    expect(() => {
      service.getReportJob("JOB-nonexistent-001", undefined, PLATFORM_ADMIN_IDENTITY);
    }).toThrowError(ApiRequestError);

    try {
      service.getReportJob("JOB-nonexistent-001", undefined, PLATFORM_ADMIN_IDENTITY);
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(404);
      expect(err.response?.error?.code).toBe("REPORT_JOB_NOT_FOUND");
    }

    try {
      service.renderReportArtifact("JOB-nonexistent-001", undefined, PLATFORM_ADMIN_IDENTITY);
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(404);
      expect(err.response?.error?.code).toBe("REPORT_JOB_NOT_FOUND");
    }
  });

  it("租戶隔離防禦：租戶身分建立報表時若指定衝突之 tenantId 拋出 400 (REPORT_TENANT_SCOPE_MISMATCH)", () => {
    const service = createTestService();

    expect(() => {
      service.createReportJob(
        {
          jobType: "monthly_trip_report",
          format: "csv",
          filters: { tenantId: "tenant-other-beta" },
        },
        "req-c090-mismatch",
        "tenant-alpha", // x-tenant-id
      );
    }).toThrowError(ApiRequestError);

    try {
      service.createReportJob(
        {
          jobType: "monthly_trip_report",
          format: "csv",
          filters: { tenantId: "tenant-other-beta" },
        },
        "req-c090-mismatch",
        "tenant-alpha",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("REPORT_TENANT_SCOPE_MISMATCH");
    }
  });

  it("跨租戶讀取防禦：Tenant A 無法存取 Tenant B 專屬之已完成報表 artifact (403 REPORT_JOB_TENANT_MISMATCH)", async () => {
    const service = createTestService();

    const accepted = service.createReportJob(
      {
        jobType: "monthly_trip_report",
        format: "csv",
        filters: { tenantId: "tenant-beta" },
      },
      "req-c090-tenant-b",
      "tenant-beta",
    );

    await flushBackgroundWork();

    // Tenant A 嘗試下載 Tenant B 的報表
    expect(() => {
      service.renderReportArtifact(
        accepted.jobId,
        "req-c090-tenant-a-read-b",
        TENANT_A_IDENTITY,
        "tenant-alpha",
      );
    }).toThrowError(ApiRequestError);

    try {
      service.renderReportArtifact(
        accepted.jobId,
        "req-c090-tenant-a-read-b",
        TENANT_A_IDENTITY,
        "tenant-alpha",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(403);
      expect(err.response?.error?.code).toBe("REPORT_JOB_TENANT_SCOPE_FORBIDDEN");
    }
  });
});
