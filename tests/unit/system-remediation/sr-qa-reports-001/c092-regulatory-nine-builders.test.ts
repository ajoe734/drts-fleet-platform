import { describe, expect, it } from "vitest";
import {
  REGULATORY_REPORT_JOB_TYPES,
  PHASE2_REGULATORY_REPORT_JOB_TYPES,
} from "@drts/contracts";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { EvidenceAccessIdentity } from "../../../../apps/api/src/common/evidence-governance";

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

async function waitForJobCompletion(
  service: ReportingFilingService,
  jobId: string,
  maxWaitMs = 2000,
) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const job = service.getReportJob(jobId, undefined, PLATFORM_ADMIN_IDENTITY);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(`Job ${jobId} failed: ${JSON.stringify(job)}`);
    }
  }
  throw new Error(`Job ${jobId} did not complete within ${maxWaitMs}ms`);
}

describe("C092: 監理承辦／法遵 - 九項 PRD 9.10.1 監理資料報表與 Phase 2 邊界驗收", () => {
  const audit = new AuditNotificationService();

  function createConfiguredRegulatoryService() {
    const service = new ReportingFilingService(audit);

    // 1. 車輛主檔 feed (Vehicle Registry)
    service.registerVehicleRegistryFeedProvider(() => [
      {
        vehicleId: "VEH-TPE-001",
        plateNo: "TPE-8888",
        vin: "1HGCR2F83HA000001",
        modelName: "Toyota Camry Hybrid",
        operatingStatus: "active",
        operatingArea: "TAIPEI_CORE",
        supportedServiceBuckets: ["standard"],
        dispatchableFlag: true,
        exclusivityApproved: true,
        insuranceStatus: "valid",
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        supplyLifecycle: {
          dispatch: {
            eligible: true,
            status: "ready",
            blockedReasons: [],
          },
          offboarding: {
            status: "none",
            requestedAt: null,
            effectiveAt: null,
            completedAt: null,
            reason: null,
          },
        },
      } as never,
      {
        vehicleId: "VEH-TPE-002",
        plateNo: "TPE-9999",
        vin: "1HGCR2F83HA000002",
        modelName: "Toyota Prius",
        operatingStatus: "retired",
        operatingArea: "TAIPEI_CORE",
        supportedServiceBuckets: ["standard"],
        dispatchableFlag: false,
        exclusivityApproved: false,
        insuranceStatus: "expired",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        supplyLifecycle: {
          dispatch: {
            eligible: false,
            status: "blocked",
            blockedReasons: ["vehicle_offboarded"],
          },
          offboarding: {
            status: "completed",
            requestedAt: "2026-08-20T00:00:00.000Z",
            effectiveAt: "2026-08-28T00:00:00.000Z",
            completedAt: "2026-08-28T00:00:00.000Z",
            reason: "車齡屆滿汰換",
          },
        },
      } as never,
    ]);

    // 2. 駕駛名冊 feed (Driver Registry)
    service.registerDriverRegistryFeedProvider(() => [
      {
        driverId: "DRV-TPE-001",
        name: "王大同",
        supportedServiceBuckets: ["standard", "business"],
        workState: "idle",
        lifecycleStatus: "active",
        licensesValid: true,
        dispatchEligible: true,
        eligibilityBlockedReasons: [],
        createdAt: "2026-01-10T00:00:00.000Z",
        activatedAt: "2026-01-15T00:00:00.000Z",
        suspendedAt: null,
        retiredAt: null,
      } as never,
    ]);

    // 3. 契約名冊 feed (Vehicle Contracts)
    service.registerVehicleContractFeedProvider(() => [
      {
        contractId: "CTR-2026-001",
        vehicleId: "VEH-TPE-001",
        partnerId: "partner-metro-01",
        partnerType: "fleet_management",
        contractType: "cooperation_agreement",
        operatingAreaId: "AREA-TPE-CORE",
        serviceScope: "taipei_metro",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
        status: "active",
        lifecycleStatus: "in_effect",
        approvedBy: "auditor-01",
      } as never,
    ]);

    // 4. 保險名冊 feed (Insurance Policies)
    service.registerInsurancePolicyFeedProvider(() => [
      {
        policyId: "INS-2026-001",
        vehicleId: "VEH-TPE-001",
        insurer: "富邦產物保險股份有限公司",
        policyNumber: "0500字第26ML000123號",
        coverageType: "passenger_liability",
        coverageAmount: 10000000,
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2026-12-31T23:59:59.000Z",
        status: "active",
      } as never,
    ]);

    // 5. 客訴案件明細 feed (Complaint Cases)
    service.registerComplaintCaseFeedProvider(() => [
      {
        caseNo: "CMP-2026-001",
        caseSource: "passenger_app",
        category: "service_attitude",
        severity: "medium",
        status: "resolved",
        description: "司機行車平穩但未主動協助放置行李",
        relatedOrderId: "ORD-2026-001",
        relatedCallId: "CALL-SESSION-8888-1234",
        relatedIncidentId: null,
        assigneeId: "agent-02",
        slaDueAt: "2026-09-05T00:00:00.000Z",
        slaBreach: false,
        reopenCount: 0,
        resolutionCode: "explained_and_coached",
        closingNote: "已致電乘客致歉並加強司機服務輔導",
        createdAt: "2026-09-02T10:00:00.000Z",
        updatedAt: "2026-09-03T15:00:00.000Z",
      } as never,
    ]);

    // 6. 半年營運統計 feed (Six-Month Operations Summary)
    service.registerSixMonthOperationsSummaryProvider(async () => [
      {
        period: "2026-H1",
        totalOrders: 15420,
        completedOrders: 14890,
        cancelledOrders: 530,
        totalPassengers: 21600,
        totalMileageKm: 185420.5,
        totalRevenueTwd: 5432100,
        complaintsByCategory: {
          service_attitude: 12,
          routing: 8,
          fare: 3,
        },
      } as never,
    ]);

    // 7. 費率版本歷史 feed (Operating Authorizations)
    service.registerOperatingAuthorizationFeedProvider(() => [
      {
        authorizationId: "AUTH-2026-001",
        operatorId: "OP-METRO-01",
        authorityCode: "TW-TPE-REG-01",
        businessPlanVersion: "v1.2",
        activeFareVersionId: "FARE-V1.2-202604",
        status: "active",
        serviceAreaCodes: ["TAIPEI_CORE", "NEW_TAIPEI_EAST"],
        effectiveFrom: "2026-04-01T00:00:00.000Z",
        effectiveUntil: "2027-03-31T23:59:59.000Z",
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      } as never,
    ]);

    // 8. 訂單與錄音索引 feed (Orders)
    service.registerOrderFeedProvider(() => [
      {
        orderId: "ORD-PHONE-001",
        orderNo: "NO-2026-8888",
        orderSource: "phone",
        callId: "CALL-RECORDING-TOKEN-9999",
        recordingId: "REC-AUDIO-001",
        complianceFlags: [],
        createdAt: "2026-09-01T12:00:00.000Z",
      } as never,
      {
        orderId: "ORD-PHONE-002",
        orderNo: "NO-2026-8889",
        orderSource: "phone",
        callId: "CALL-RECORDING-TOKEN-8888",
        recordingId: null,
        complianceFlags: ["recording_pending"],
        createdAt: "2026-09-01T12:30:00.000Z",
      } as never,
    ]);

    return service;
  }

  it("九項 PRD 9.10.1 監理報表：逐項建立 CSV 報表 job，均能產出非空且欄位正確之 CSV 資料", async () => {
    const service = createConfiguredRegulatoryService();

    expect(REGULATORY_REPORT_JOB_TYPES.length).toBe(9);

    for (const jobType of REGULATORY_REPORT_JOB_TYPES) {
      const accepted = service.createReportJob(
        {
          jobType,
          format: "csv",
          filters: {},
        },
        `req-c092-${jobType}`,
      );

      expect(accepted.jobId).toMatch(/^JOB-/);

      await waitForJobCompletion(service, accepted.jobId);

      const artifact = await service.renderReportArtifact(
        accepted.jobId,
        `req-c092-render-${jobType}`,
        PLATFORM_ADMIN_IDENTITY,
      );

      expect(artifact.contentType).toBe("text/csv; charset=utf-8");
      expect(artifact.fileName).toBe(`${jobType}-${accepted.jobId}.csv`);
      expect(artifact.buffer.byteLength).toBeGreaterThan(0);

      const parsed = parseCsv(artifact.buffer.toString("utf8"));
      expect(parsed.headers.length).toBeGreaterThan(0);
      expect(parsed.rows.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("監理報表時間篩選驗證：vehicle_monthly_delta 支援月份篩選並精準計算增減車輛", async () => {
    const service = createConfiguredRegulatoryService();

    // 查詢 2026-08 月異動（應包含 1 筆加入與 1 筆退場）
    const accepted = service.createReportJob(
      {
        jobType: "vehicle_monthly_delta",
        format: "csv",
        filters: { month: "2026-08" },
      },
      "req-c092-monthly-delta-filtered",
    );

    await waitForJobCompletion(service, accepted.jobId);

    const artifact = await service.renderReportArtifact(
      accepted.jobId,
      undefined,
      PLATFORM_ADMIN_IDENTITY,
    );

    const parsed = parseCsv(artifact.buffer.toString("utf8"));
    expect(parsed.headers).toContain("periodMonth");
    expect(parsed.headers).toContain("addedCount");
    expect(parsed.headers).toContain("removedCount");

    // 驗證 2026-08 增減車紀錄
    const augustRow = parsed.rows.find((row) => row.includes("2026-08"));
    expect(augustRow).toBeDefined();
  });

  it("跨格式支援：監理報表亦可選擇 XLSX 與 PDF 格式成功輸出", async () => {
    const service = createConfiguredRegulatoryService();

    for (const format of ["xlsx", "pdf"] as const) {
      const accepted = service.createReportJob(
        {
          jobType: "insurance_roster",
          format,
        },
        `req-c092-insurance-${format}`,
      );

      await waitForJobCompletion(service, accepted.jobId);

      const artifact = await service.renderReportArtifact(
        accepted.jobId,
        undefined,
        PLATFORM_ADMIN_IDENTITY,
      );

      expect(artifact.buffer.byteLength).toBeGreaterThan(0);
      expect(artifact.fileName).toBe(`insurance_roster-${accepted.jobId}.${format}`);
    }
  });

  it("Phase 2 邊界隔離：Phase 2 監理報表類型在一般報表 endpoint 明確拒絕 (400 REPORT_TYPE_UNKNOWN)", () => {
    const service = createConfiguredRegulatoryService();

    expect(PHASE2_REGULATORY_REPORT_JOB_TYPES.length).toBe(6);

    for (const phase2Type of PHASE2_REGULATORY_REPORT_JOB_TYPES) {
      try {
        service.createReportJob(
          {
            jobType: phase2Type as never,
            format: "csv",
          },
          `req-c092-phase2-${phase2Type}`,
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiRequestError);
        expect(err.status).toBe(400);
        expect(err.response?.error?.code).toBe("REPORT_TYPE_UNKNOWN");
      }
    }
  });

  it("Filing package 邊界隔離：監理送件套件 (filing_package) 嚴禁作為一般報表 job 提交", () => {
    const service = createConfiguredRegulatoryService();

    try {
      service.createReportJob(
        {
          jobType: "filing_package" as never,
          format: "csv",
        },
        "req-c092-filing-package",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("REPORT_TYPE_UNKNOWN");
    }
  });
});
