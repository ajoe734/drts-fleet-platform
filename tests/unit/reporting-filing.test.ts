import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import {
  IMPLEMENTED_REPORT_JOB_TYPES,
  REGULATORY_REPORT_JOB_TYPES,
} from "@drts/contracts";
import type {
  DriverRosterRowRecord,
  VehicleRosterRowRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

function expectApiErrorCode(call: () => unknown, code: string) {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}, but the call succeeded`);
}

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { ComplaintService } from "../../apps/api/src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ReportingFilingRepository } from "../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

async function flushReportingQueue() {
  await Promise.resolve();
  await Promise.resolve();
}

function createServices() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    auditService,
    new DriverProfileService(auditService),
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    new OpsDispatchEventsService(new EventEmitter() as never),
  );
  const complaintService = new ComplaintService(auditService);
  const reportingFilingService = new ReportingFilingService(auditService);

  reportingFilingService.registerOrderFeedProvider(() =>
    ownedMobilityService.listOrders(),
  );
  reportingFilingService.registerVehicleRegistryFeedProvider(() =>
    regulatoryRegistryService.listVehicles(),
  );
  reportingFilingService.registerDriverRegistryFeedProvider(() =>
    regulatoryRegistryService.listDrivers(),
  );
  reportingFilingService.registerVehicleContractFeedProvider(() =>
    regulatoryRegistryService.listContracts(),
  );
  reportingFilingService.registerInsurancePolicyFeedProvider(() =>
    regulatoryRegistryService.listPolicies(),
  );
  reportingFilingService.registerComplaintCaseFeedProvider(() =>
    complaintService.listComplaintCases(),
  );

  ownedMobilityService.registerCallRecordingListeners();
  return {
    auditService,
    callcenterService,
    complaintService,
    ownedMobilityService,
    regulatoryRegistryService,
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
    const generateAudit = auditService
      .listAuditLogs()
      .find(
        (entry) => entry.actionName === "generate_filing_package_completed",
      );
    expect(generateAudit).toBeDefined();
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

    type JobRow = NonNullable<typeof job.rows>[number];
    const hasOrderId = (
      row: JobRow,
    ): row is Extract<JobRow, { orderId: string }> => "orderId" in row;

    const missingRow = job.rows?.find(
      (row) => hasOrderId(row) && row.orderId === missingRecordingOrder.orderId,
    );
    const boundRow = job.rows?.find(
      (row) => hasOrderId(row) && row.orderId === recordingBoundOrder.orderId,
    );

    // Recording-index rows mask sensitive identifiers (callId / recordingId)
    // via maskOpaqueToken(value, 8, 4) — "<first8>...<last4>".
    expect(missingRow).toEqual(
      expect.objectContaining({
        orderNo: missingRecordingOrder.orderNo,
        callId: "CALL-202...0100",
        recordingId: null,
        missingRecording: true,
      }),
    );
    expect(boundRow).toEqual(
      expect.objectContaining({
        orderNo: recordingBoundOrder.orderNo,
        callId: "CALL-202...0101",
        recordingId: "REC-2026...0101",
        missingRecording: false,
      }),
    );
    expect(
      auditService
        .listAuditLogs()
        .some((entry) => entry.actionName === "complete_report_job"),
    ).toBe(true);
  });

  it("exports partner benefit revenue rows for airport-transfer review", async () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);
    const verification = await tenantPartnerService.verifyPartnerEligibility({
      entrySlug: "bank-demo-alpha-airport",
      cardLast4: "2468",
    });
    const callcenterService = new CallcenterService(auditService);
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      auditService,
      new DriverProfileService(auditService),
    );
    const ownedMobilityService = new OwnedMobilityService(
      regulatoryRegistryService,
      auditService,
      callcenterService,
      new OwnedMobilityTaskEventsService(new EventEmitter() as never),
      new OpsDispatchEventsService(new EventEmitter() as never),
      undefined,
      tenantPartnerService,
    );
    const reportingFilingService = new ReportingFilingService(auditService);
    reportingFilingService.registerOrderFeedProvider(() =>
      ownedMobilityService.listOrders(),
    );

    const created = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerEntrySlug: "bank-demo-alpha-airport",
        eligibilityVerificationId: verification.eligibilityVerificationId,
        direction: "pickup",
        pickup: { address: "桃園機場第二航廈" },
        dropoff: { address: "台北市信義區松高路11號" },
        reservationWindowStart: "2026-04-18T10:00:00Z",
        reservationWindowEnd: "2026-04-18T10:20:00Z",
        passenger: {
          name: "陳小姐",
          phone: "0900123456",
        },
        flightNo: "CI-001",
      },
      "tenant-demo-001",
    );

    await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: { address: "台中市政府" },
        dropoff: { address: "台中高鐵站" },
        reservationWindowStart: "2026-04-18T12:00:00Z",
        reservationWindowEnd: "2026-04-18T12:20:00Z",
        passenger: {
          name: "一般企業乘客",
          phone: "0900000000",
        },
      },
      "tenant-demo-001",
    );

    const accepted = reportingFilingService.createReportJob({
      jobType: "revenue_summary",
      format: "xlsx",
    });

    await flushReportingQueue();

    const job = reportingFilingService.getReportJob(accepted.jobId);
    expect(job.status).toBe("completed");
    // Revenue rows mask issuerAuthorizationRef / benefitReference via
    // maskOpaqueToken(value, 8, 4) — "<first8>...<last4>".
    expect(job.partnerRevenueRows).toEqual([
      expect.objectContaining({
        orderId: created.orderId,
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-alpha",
        partnerEntrySlug: "bank-demo-alpha-airport",
        eligibilityVerificationId: verification.eligibilityVerificationId,
        issuerAuthorizationRef: "issuer-a...2468",
        benefitReference: "benefit-...2468",
        businessDispatchSubtype: "credit_card_airport_transfer",
      }),
    ]);
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

const OPERATIONAL_TYPES = [
  "trip_summary",
  "monthly_trip_report",
  "revenue_summary",
  "incident_register",
  "maintenance_overview",
  "daily_dispatch_record",
  "six_month_operations_summary",
] as const;

describe("report builder registry", () => {
  // The defect these cover: a report type nobody built did not fail. It reached
  // `completed` with `rows: []`, a manifest and a checksum, so "never
  // implemented" and "no data this period" produced byte-identical results.

  it("rejects a declared-but-unbuilt report instead of completing it empty", () => {
    const { reportingFilingService } = createServices();

    // `vehicle_monthly_delta` needs vehicle lifecycle history that the registry
    // does not keep, so it is still declared and unbuilt (REG-RPT-004).
    expectApiErrorCode(
      () =>
        reportingFilingService.createReportJob({
          jobType: "vehicle_monthly_delta",
          format: "csv",
        }),
      "REPORT_TYPE_NOT_IMPLEMENTED",
    );

    expect(reportingFilingService.listReportJobs()).toHaveLength(0);
  });

  it("rejects a job type that is not declared at all", () => {
    const { reportingFilingService } = createServices();

    // The old validation was `assertNonBlank`, so this string produced a
    // completed job exactly like a real report type did.
    expectApiErrorCode(
      () =>
        reportingFilingService.createReportJob({
          jobType: "not_a_report",
          format: "csv",
        }),
      "REPORT_TYPE_UNKNOWN",
    );
  });

  it("points multi-taxi trip records at the endpoint that records a purpose", () => {
    const { reportingFilingService } = createServices();

    expectApiErrorCode(
      () =>
        reportingFilingService.createReportJob({
          jobType: "multi_taxi_trip_records",
          format: "csv",
        }),
      "REPORT_TYPE_REQUIRES_DEDICATED_ENDPOINT",
    );
  });

  it("keeps the contract's implemented list and the service registry in step", () => {
    const { reportingFilingService } = createServices();

    // Surfaces read IMPLEMENTED_REPORT_JOB_TYPES to decide what to offer; the
    // service decides what to accept. If those two ever disagree, a console
    // offers a report that always errors, or hides one that works.
    const accepted = [...REGULATORY_REPORT_JOB_TYPES, ...OPERATIONAL_TYPES]
      .filter((jobType) => {
        try {
          reportingFilingService.createReportJob({ jobType, format: "csv" });
          return true;
        } catch {
          return false;
        }
      })
      .sort();

    expect(accepted).toEqual([...IMPLEMENTED_REPORT_JOB_TYPES].sort());
  });

  it("either builds or refuses every regulatory report, never both nor neither", () => {
    const { reportingFilingService } = createServices();

    // PRD 9.10.1 lists nine. Whichever are not built yet must reject; the ones
    // that are must accept. A type that does neither is the original bug.
    for (const jobType of REGULATORY_REPORT_JOB_TYPES) {
      let accepted = false;
      try {
        reportingFilingService.createReportJob({ jobType, format: "csv" });
        accepted = true;
      } catch (error) {
        expect((error as ApiRequestError).code).toBe(
          "REPORT_TYPE_NOT_IMPLEMENTED",
        );
      }

      if (accepted) {
        expect(reportingFilingService.listReportJobs()[0]?.jobType).toBe(
          jobType,
        );
      }
    }
  });
});

describe("PRD 9.10.1 regulatory rosters", () => {
  async function runReport(jobType: string) {
    const services = createServices();
    const accepted = services.reportingFilingService.createReportJob({
      jobType,
      format: "csv",
    });
    await flushReportingQueue();
    const job = services.reportingFilingService.getReportJob(accepted.jobId);
    return { services, job };
  }

  it("reports the vehicles the registry actually holds", async () => {
    const { services, job } = await runReport("vehicle_roster");

    expect(job.status).toBe("completed");
    const rows = (job.rows ?? []) as VehicleRosterRowRecord[];
    // The point of the report is that its row count tracks the registry. An
    // empty roster used to be the only possible answer.
    expect(rows).toHaveLength(
      services.regulatoryRegistryService.listVehicles().length,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      vehicleId: expect.any(String),
      plateNo: expect.any(String),
      exportedAt: expect.any(String),
    });
    // One export, one timestamp: rows must not disagree about when they were
    // taken.
    expect(new Set(rows.map((row) => row.exportedAt)).size).toBe(1);
  });

  it("reports drivers with the lifecycle the registry tracks", async () => {
    const { services, job } = await runReport("driver_roster");

    const rows = (job.rows ?? []) as DriverRosterRowRecord[];
    expect(rows).toHaveLength(
      services.regulatoryRegistryService.listDrivers().length,
    );
    expect(rows[0]).toMatchObject({
      driverId: expect.any(String),
      lifecycleStatus: expect.any(String),
      dispatchEligible: expect.any(Boolean),
    });
  });

  it("reports contracts and insurance policies", async () => {
    const contractReport = await runReport("contract_roster");
    expect(contractReport.job.rows).toHaveLength(
      contractReport.services.regulatoryRegistryService.listContracts().length,
    );

    const insuranceReport = await runReport("insurance_roster");
    expect(insuranceReport.job.rows).toHaveLength(
      insuranceReport.services.regulatoryRegistryService.listPolicies().length,
    );
  });

  it("reports complaint cases with the call id masked", async () => {
    const { services, job } = await runReport("complaint_case_detail");

    expect(job.rows).toHaveLength(
      services.complaintService.listComplaintCases().length,
    );
    for (const row of (job.rows ?? []) as Array<{
      relatedCallId: string | null;
    }>) {
      // Same treatment as the dispatch recording index: the report indexes what
      // exists, and a call id is the key to a recording.
      if (row.relatedCallId) {
        expect(row.relatedCallId).toContain("...");
      }
    }
  });

  it("refuses to produce a platform-wide regulatory report inside a tenant scope", () => {
    const { reportingFilingService } = createServices();

    // None of these sources carry a tenant -- VehicleRegistryRecord has no
    // tenantId to filter on -- so a roster produced "for" a tenant is every
    // tenant's data. The tenant endpoint stamps filters.tenantId, which is what
    // job listing filters on, so the requester could read it back.
    for (const jobType of REGULATORY_REPORT_JOB_TYPES) {
      expectApiErrorCode(
        () =>
          reportingFilingService.createReportJob(
            { jobType, format: "csv" },
            "req-tenant-scope",
            "tenant-demo-001",
          ),
        (IMPLEMENTED_REPORT_JOB_TYPES as readonly string[]).includes(jobType)
          ? "REPORT_TYPE_NOT_TENANT_SCOPED"
          : "REPORT_TYPE_NOT_IMPLEMENTED",
      );
    }
  });

  it("still allows a tenant-scoped operational report", () => {
    const { reportingFilingService } = createServices();

    const accepted = reportingFilingService.createReportJob(
      { jobType: "monthly_trip_report", format: "csv" },
      "req-tenant-ok",
      "tenant-demo-001",
    );

    expect(accepted.status).toBe("queued");
  });
});
