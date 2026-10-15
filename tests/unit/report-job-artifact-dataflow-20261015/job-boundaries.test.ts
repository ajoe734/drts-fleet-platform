import { describe, expect, it, vi } from "vitest";
import type { DispatchDailyRecord } from "@drts/contracts";
import { ReportingFilingService } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { ReportingFilingRepository } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import type { EvidenceAccessIdentity } from "../../../apps/api/src/common/evidence-governance";
import { assertArtifactRecords } from "./artifact-readers";

const ops: EvidenceAccessIdentity = {
  actorId: "ops-test",
  actorType: "ops_user",
  realm: "ops",
  scopes: [],
  tenantId: null,
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const daily: DispatchDailyRecord = {
  serviceDate: "2026-10-15",
  orderId: "ORDER-DAILY-1",
  orderNo: "DAILY-1",
  orderSource: "ops_console",
  tenantId: null,
  partnerId: null,
  serviceProductCode: "MT-STD",
  requestedAt: "2026-10-15T01:00:00Z",
  reservationTime: null,
  pickupAddressSnapshot: "Station",
  dropoffAddressSnapshot: null,
  firstDispatchAt: null,
  firstAssignedAt: null,
  finalDriverId: null,
  finalVehicleId: null,
  finalPlateNo: null,
  etaSecondsAtAssignment: null,
  arrivedPickupAt: null,
  tripStartedAt: null,
  tripCompletedAt: null,
  finalStatus: "completed",
  redispatchCount: 0,
  cancellationReason: null,
  complaintCount: 0,
  generatedAt: "2026-10-15T02:00:00Z",
};

describe("report job record routing boundaries", () => {
  it.each(["csv", "xlsx", "pdf"] as const)(
    "keeps legitimate empty revenue and generic daily records (%s)",
    async (format) => {
      const audit = new AuditNotificationService();
      const service = new ReportingFilingService(audit);
      const provider = vi.fn(() => [daily]);
      service.registerDailyDispatchRecordProvider(provider);
      for (const jobType of [
        "revenue_summary",
        "daily_dispatch_record",
      ] as const) {
        const filters = {
          serviceDateFrom: "2026-10-15",
          orderSource: "ops_console",
        };
        const accepted = service.createReportJob({ jobType, format, filters });
        await tick();
        const job = service.getReportJob(accepted.jobId, undefined, ops);
        expect(job.status).toBe("completed");
        expect(job.filters).toEqual(filters);
        expect(job.partnerRevenueRows).toEqual([]);
        const rows = jobType === "revenue_summary" ? [] : [daily];
        expect(job.rows).toEqual(rows);
        const manifest = job.artifact?.manifestHash;
        const artifact = await service.renderReportArtifact(
          job.jobId,
          undefined,
          ops,
        );
        await assertArtifactRecords(artifact, format, rows);
        expect(service.getReportJob(job.jobId).artifact?.manifestHash).toBe(
          manifest,
        );
        expect(
          audit
            .listAuditLogs()
            .find(
              (entry) =>
                entry.actionName === "download_report_artifact" &&
                entry.newValuesSummary?.jobId === job.jobId,
            )?.newValuesSummary,
        ).toMatchObject({ rowCount: rows.length });
      }
      expect(provider).toHaveBeenCalledWith({
        serviceDateFrom: "2026-10-15",
        orderSource: "ops_console",
      });
    },
  );

  it("refuses not-ready, failed, missing and persisted expired jobs", async () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    let finish!: (rows: DispatchDailyRecord[]) => void;
    service.registerDailyDispatchRecordProvider(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const accepted = service.createReportJob({
      jobType: "daily_dispatch_record",
      format: "csv",
    });
    expect(() =>
      service.renderReportArtifact(accepted.jobId, undefined, ops),
    ).toThrowError(
      expect.objectContaining({ code: "REPORT_ARTIFACT_NOT_READY" }),
    );
    await tick();
    expect(service.getReportJob(accepted.jobId).status).toBe("running");
    expect(() =>
      service.renderReportArtifact(accepted.jobId, undefined, ops),
    ).toThrowError(
      expect.objectContaining({ code: "REPORT_ARTIFACT_NOT_READY" }),
    );
    finish([]);
    await tick();
    service.registerOrderFeedProvider(() => {
      throw new Error("feed unavailable");
    });
    const failed = service.createReportJob({
      jobType: "revenue_summary",
      format: "csv",
    });
    await tick();
    expect(service.getReportJob(failed.jobId).status).toBe("failed");
    expect(() =>
      service.renderReportArtifact(failed.jobId, undefined, ops),
    ).toThrowError(
      expect.objectContaining({ code: "REPORT_ARTIFACT_NOT_READY" }),
    );
    expect(() =>
      service.renderReportArtifact("missing", undefined, ops),
    ).toThrowError(expect.objectContaining({ code: "REPORT_JOB_NOT_FOUND" }));
    // Only the persistence boundary is mocked; production hydration/guards execute.
    const expired = {
      ...service.getReportJob(accepted.jobId),
      status: "expired",
    };
    const repository = {
      loadState: async () => ({ reportJobs: [expired], filingPackages: [] }),
    } as unknown as ReportingFilingRepository;
    const restored = new ReportingFilingService(
      new AuditNotificationService(),
      repository,
    );
    await restored.onModuleInit();
    expect(() =>
      restored.renderReportArtifact(accepted.jobId, undefined, ops),
    ).toThrowError(
      expect.objectContaining({ code: "REPORT_ARTIFACT_NOT_READY" }),
    );
  });

  it("preserves tenant/evidence/role denials and a legitimate scoped download", async () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    const accepted = service.createReportJob({
      jobType: "revenue_summary",
      format: "csv",
      filters: { tenantId: "tenant-a" },
    });
    await tick();
    const tenant: EvidenceAccessIdentity = {
      actorId: "tenant-user",
      actorType: "tenant_admin",
      realm: "tenant",
      scopes: ["reports:read"],
      tenantId: "tenant-a",
    };
    expect(
      (
        await service.renderReportArtifact(
          accepted.jobId,
          undefined,
          tenant,
          "tenant-a",
        )
      ).buffer,
    ).toHaveLength(0);
    expect(() =>
      service.renderReportArtifact(
        accepted.jobId,
        undefined,
        tenant,
        "tenant-b",
      ),
    ).toThrowError(
      expect.objectContaining({ code: "REPORT_JOB_TENANT_SCOPE_FORBIDDEN" }),
    );
    for (const identity of [
      { ...tenant, tenantId: "tenant-b" },
      { ...tenant, scopes: ["unrelated:read"] },
      { ...tenant, actorType: "tenant_user" },
    ]) {
      expect(() =>
        service.renderReportArtifact(
          accepted.jobId,
          undefined,
          identity,
          "tenant-a",
        ),
      ).toThrowError(
        expect.objectContaining({ code: "EVIDENCE_ACCESS_FORBIDDEN" }),
      );
    }
  });
});
