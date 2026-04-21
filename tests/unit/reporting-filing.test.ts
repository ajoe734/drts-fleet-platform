import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ReportingFilingRepository } from "../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";

async function flushReportingQueue() {
  await Promise.resolve();
  await Promise.resolve();
}

function createServices() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService();
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
  );
  const reportingFilingService = new ReportingFilingService(auditService);

  reportingFilingService.registerOrderFeedProvider(() =>
    ownedMobilityService.listOrders(),
  );

  return {
    auditService,
    callcenterService,
    ownedMobilityService,
    reportingFilingService,
  };
}

describe("reporting and filing service", () => {
  it("generates an immutable filing package with manifest/hash metadata for SC-033", async () => {
    const { auditService, reportingFilingService } = createServices();

    const accepted = reportingFilingService.generateFilingPackage(
      {
        packageType: "monthly_report",
        scope: {
          month: "2026-04",
        },
      },
      "filing-request-001",
    );

    expect(accepted.status).toBe("queued");

    let filingPackage = reportingFilingService.getFilingPackage(
      accepted.packageId,
    );

    expect(filingPackage.status).toBe("queued");

    await flushReportingQueue();

    filingPackage = reportingFilingService.getFilingPackage(accepted.packageId);
    const listing = reportingFilingService.listFilingPackages();

    expect(filingPackage.status).toBe("completed");
    expect(listing).toHaveLength(1);
    expect(listing[0]?.packageId).toBe(accepted.packageId);
    expect(filingPackage.immutable).toBe(true);
    expect(filingPackage.generatedAt).toBeTruthy();
    expect(filingPackage.manifestHash).toBeTruthy();
    expect(filingPackage.artifactZipUrl).toContain("sig=");
    expect(filingPackage.artifactPdfUrl).toContain("sig=");
    expect(filingPackage.downloadMetadata?.zip.kind).toBe("filing-zip");
    expect(filingPackage.downloadMetadata?.pdf.kind).toBe("filing-pdf");
    expect(filingPackage.items.map((item) => item.itemType)).toEqual([
      "vehicle_roster",
      "driver_roster",
      "contract_roster",
      "insurance_roster",
      "statistics",
    ]);
    expect(filingPackage.manifest?.entryCount).toBe(5);
    expect(filingPackage.manifest?.checksum).toBe(filingPackage.manifestHash);

    filingPackage.items[0]!.itemType = "tampered";
    if (filingPackage.manifest) {
      filingPackage.manifest.entries[0]!.itemType = "tampered";
    }

    const reloaded = reportingFilingService.getFilingPackage(
      accepted.packageId,
    );
    expect(reloaded.items[0]?.itemType).toBe("vehicle_roster");
    expect(reloaded.manifest?.entries[0]?.itemType).toBe("vehicle_roster");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "generate_filing_package_completed",
    );
  });

  it("exports dispatch recording index rows with explicit missing-recording flags for SC-034", async () => {
    const {
      auditService,
      callcenterService,
      ownedMobilityService,
      reportingFilingService,
    } = createServices();

    const missingRecordingOrder = ownedMobilityService.createCallCenterOrder({
      callId: "CALL-20260411-000100",
      agentId: "AGENT-0091",
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "王小姐",
        phone: "0911000001",
      },
    });

    const recordingBoundOrder = ownedMobilityService.createCallCenterOrder({
      callId: "CALL-20260411-000101",
      agentId: "AGENT-0092",
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "陳先生",
        phone: "0911000002",
      },
    });

    callcenterService.attachRecordingCallback("CALL-20260411-000101", {
      recordingId: "REC-20260411-000101",
      providerRecordingRef: "cti-ref-101",
      recordingUrl: "https://recordings.example.com/REC-20260411-000101",
      agentId: "AGENT-0092",
    });

    ownedMobilityService.createPassengerOrder({
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "一般乘客",
        phone: "0911000003",
      },
    });

    const accepted = reportingFilingService.createReportJob(
      {
        jobType: "dispatch_recording_index",
        format: "csv",
        filters: {
          month: "2026-04",
        },
      },
      "report-request-001",
    );

    expect(accepted.status).toBe("queued");
    expect(reportingFilingService.listReportJobs()).toHaveLength(1);

    let job = reportingFilingService.getReportJob(accepted.jobId);

    expect(job.status).toBe("queued");

    await flushReportingQueue();

    job = reportingFilingService.getReportJob(accepted.jobId);

    expect(job.status).toBe("completed");
    expect(job.artifact?.downloadUrl).toContain("sig=");
    expect(job.artifact?.downloadMetadata.kind).toBe("report");
    expect(job.artifact?.downloadMetadata.signatureVersion).toBe(1);
    expect(job.artifact?.expiresAt).toBeTruthy();
    expect(job.rows).toHaveLength(2);

    const missingRow = job.rows?.find(
      (row) => row.orderId === missingRecordingOrder.orderId,
    );
    const boundRow = job.rows?.find(
      (row) => row.orderId === recordingBoundOrder.orderId,
    );

    expect(missingRow).toEqual(
      expect.objectContaining({
        orderNo: missingRecordingOrder.orderNo,
        callId: "CALL-20260411-000100",
        recordingId: null,
        missingRecording: true,
      }),
    );
    expect(boundRow).toEqual(
      expect.objectContaining({
        orderNo: recordingBoundOrder.orderNo,
        callId: "CALL-20260411-000101",
        recordingId: "REC-20260411-000101",
        missingRecording: false,
      }),
    );
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "complete_report_job",
    );
  });

  it("rehydrates queued reporting state and writes completed jobs through the repository", async () => {
    const auditService = new AuditNotificationService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        reportJobs: [
          {
            jobId: "JOB-persisted-001",
            jobType: "dispatch_recording_index",
            format: "csv",
            status: "queued",
            filters: {
              month: "2026-03",
            },
            artifact: null,
            rows: [],
            createdAt: "2026-04-10T00:00:00Z",
            updatedAt: "2026-04-10T00:00:00Z",
          },
        ],
        filingPackages: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as ReportingFilingRepository;
    const reportingFilingService = new ReportingFilingService(
      auditService,
      repository,
    );

    await reportingFilingService.onModuleInit();
    await flushReportingQueue();

    expect(reportingFilingService.listReportJobs()[0]?.jobId).toBe(
      "JOB-persisted-001",
    );
    expect(reportingFilingService.listReportJobs()[0]?.status).toBe(
      "completed",
    );

    reportingFilingService.createReportJob({
      jobType: "dispatch_recording_index",
      format: "csv",
      filters: {
        month: "2026-04",
      },
    });

    await flushReportingQueue();

    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        reportJobs: [
          expect.objectContaining({
            status: expect.stringMatching(/running|completed/),
            jobType: "dispatch_recording_index",
          }),
        ],
      }),
    );
  });
});
