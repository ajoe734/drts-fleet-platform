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
import { recordsToCsv } from "../../apps/api/src/common/csv";

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
import { IncidentService } from "../../apps/api/src/modules/incident/incident.service";
import { MaintenanceService } from "../../apps/api/src/modules/maintenance/maintenance.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ReportingFilingRepository } from "../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// Two fare versions of one authority, published in order: the shape the
// unique index on (operator, authority code, business plan version) produces.
const OPERATING_AUTHORIZATION_FIXTURE = [
  {
    authorizationId: "AUTH-002",
    operatorId: "OP-001",
    authorityCode: "TPE-MT-01",
    businessPlanVersion: "v2",
    status: "approved" as const,
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "FARE-2026-02",
    effectiveFrom: "2026-02-01T00:00:00.000Z",
    effectiveUntil: null,
    createdAt: "2026-01-20T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    authorizationId: "AUTH-001",
    operatorId: "OP-001",
    authorityCode: "TPE-MT-01",
    businessPlanVersion: "v1",
    status: "expired" as const,
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "FARE-2026-01",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2026-02-01T00:00:00.000Z",
    createdAt: "2025-12-20T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const SIX_MONTH_SUMMARY_FIXTURE = [
  {
    from: "2026-02-01T00:00:00.000Z",
    to: "2026-07-31T23:59:59.000Z",
    businessArea: "TPE",
    serviceProductCode: "MT-STD",
    demandRequestCount: 1200,
    actualDispatchCount: 1150,
    completedTripCount: 1100,
    cancelledOrderCount: 50,
    averageDispatchableVehicleCount: 42.5,
    validSnapshotCount: 180,
    expectedSnapshotCount: 180,
    snapshotCoverageRate: 1,
    complaintCount: 7,
    complaintsByCategory: { service_attitude: 4, route: 3 },
    generatedAt: "2026-08-01T00:00:00.000Z",
  },
];

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
  const incidentService = new IncidentService(auditService);
  const maintenanceService = new MaintenanceService(auditService);
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
  reportingFilingService.registerSixMonthOperationsSummaryProvider(() =>
    SIX_MONTH_SUMMARY_FIXTURE.map((row) => ({ ...row })),
  );
  reportingFilingService.registerIncidentFeedProvider(() =>
    incidentService.listIncidents(),
  );
  reportingFilingService.registerMaintenanceFeedProvider(() =>
    maintenanceService.listMaintenanceLogs(),
  );
  reportingFilingService.registerOperatingAuthorizationFeedProvider(
    () => OPERATING_AUTHORIZATION_FIXTURE,
  );

  ownedMobilityService.registerCallRecordingListeners();
  return {
    auditService,
    callcenterService,
    complaintService,
    incidentService,
    maintenanceService,
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
    // The link a caller follows now addresses the route that streams the file.
    // The signed reference stays on downloadMetadata, where it is a governance
    // record rather than something anyone is invited to click.
    expect(job.artifact?.downloadUrl).toBe(
      `/reports/${accepted.jobId}/artifact`,
    );
    expect(job.artifact?.downloadMetadata.downloadUrl).toContain("sig=");
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
      // Was "xlsx", which has no renderer and is now rejected at creation.
      format: "csv",
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

    // Every declared report type is built now, so the only way to be refused is
    // to ask for one that was never declared.
    expectApiErrorCode(
      () =>
        reportingFilingService.createReportJob({
          jobType: "not_declared_anywhere",
          format: "csv",
        }),
      "REPORT_TYPE_UNKNOWN",
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

  it("builds every one of PRD 9.10.1's nine reports", () => {
    const { reportingFilingService } = createServices();

    // The section lists nine. All nine must now be accepted and produce a job;
    // a type that is declared and does neither is the original bug.
    for (const jobType of REGULATORY_REPORT_JOB_TYPES) {
      const accepted = reportingFilingService.createReportJob({
        jobType,
        format: "csv",
      });
      expect(accepted.status).toBe("queued");
      expect(reportingFilingService.listReportJobs()[0]?.jobType).toBe(jobType);
    }

    expect(REGULATORY_REPORT_JOB_TYPES.length).toBe(9);
  });
});

describe("PRD 9.10.1 regulatory rosters", () => {
  async function runReport(jobType: string) {
    const services = createServices();
    const accepted = services.reportingFilingService.createReportJob({
      jobType,
      format: "csv",
    });
    // An async builder settles a microtask later than a synchronous one, so
    // this waits for the slowest shape rather than the fastest.
    await flushReportingQueue();
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

  it("reports the six-month statistics under the name PRD 9.10.1 uses", async () => {
    const { services, job } = await runReport("six_month_statistics");

    expect(job.status).toBe("completed");
    // The four figures PRD 9.10.1 names for 六個月統計. They existed already,
    // behind the operational job type; only the regulatory name was unbound.
    const operational = await runReport("six_month_operations_summary");
    expect(job.rows).toEqual(operational.job.rows);
    expect(services).toBeDefined();
  });

  it("reports the fare version history the authorization rows already hold", async () => {
    const { job } = await runReport("fare_version_history");

    expect(job.status).toBe("completed");
    const rows = (job.rows ?? []) as Array<{
      businessPlanVersion: string;
      fareVersionId: string;
      effectiveFrom: string;
    }>;
    // A new fare version is a new authorization row, not an edited one: the
    // table is unique on (operator, authority code, business plan version) and
    // only a draft is editable. So the history is these rows in order.
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index]!.effectiveFrom >= rows[index - 1]!.effectiveFrom).toBe(
        true,
      );
    }
  });

  it("counts a vehicle in the month it joined and the month it was offboarded", async () => {
    const services = createServices();
    const vehicles = services.regulatoryRegistryService.listVehicles();
    const target = vehicles[0]!;

    services.regulatoryRegistryService.initiateVehicleOffboarding(
      target.vehicleId,
      {
        reason: "sold",
        effectiveAt: "2026-05-20T00:00:00.000Z",
        debrandingRequired: false,
      },
    );

    const accepted = services.reportingFilingService.createReportJob({
      jobType: "vehicle_monthly_delta",
      format: "csv",
    });
    await flushReportingQueue();
    await flushReportingQueue();
    const job = services.reportingFilingService.getReportJob(accepted.jobId);
    const rows = (job.rows ?? []) as Array<{
      periodMonth: string;
      addedCount: number;
      removedCount: number;
      netChange: number;
      closingCount: number;
      removed: Array<{ vehicleId: string; reason: string | null }>;
    }>;

    const may = rows.find((row) => row.periodMonth === "2026-05");
    expect(may?.removedCount).toBe(1);
    expect(may?.removed[0]).toMatchObject({
      vehicleId: target.vehicleId,
      reason: "sold",
    });

    // Every vehicle in the registry is counted as an addition somewhere.
    const totalAdded = rows.reduce((sum, row) => sum + row.addedCount, 0);
    expect(totalAdded).toBe(vehicles.length);

    // netChange and closingCount must agree with the entries, not be computed
    // separately from them.
    for (const row of rows) {
      expect(row.netChange).toBe(row.addedCount - row.removedCount);
    }
    expect(rows[rows.length - 1]!.closingCount).toBe(vehicles.length - 1);
  });

  it("does not count a lapsed insurance policy as a vehicle leaving the fleet", async () => {
    const services = createServices();
    const target = services.regulatoryRegistryService.listVehicles()[0]!;

    // This is the failure mode worth guarding: dispatchableFlag is effective
    // dispatchability and drops whenever insurance lapses, a contract expires
    // or an operator holds the vehicle -- all recoverable. Reading it as 減車
    // would report the fleet shrinking every time a policy renewed late.
    services.regulatoryRegistryService.updateVehicleCompliance(
      target.vehicleId,
      { dispatchableFlag: false },
    );

    const accepted = services.reportingFilingService.createReportJob({
      jobType: "vehicle_monthly_delta",
      format: "csv",
    });
    await flushReportingQueue();
    await flushReportingQueue();
    const job = services.reportingFilingService.getReportJob(accepted.jobId);
    const rows = (job.rows ?? []) as Array<{ removedCount: number }>;

    expect(rows.reduce((sum, row) => sum + row.removedCount, 0)).toBe(0);
  });

  it("keeps the running total right when one month is requested", async () => {
    const services = createServices();
    const vehicles = services.regulatoryRegistryService.listVehicles();
    services.regulatoryRegistryService.initiateVehicleOffboarding(
      vehicles[0]!.vehicleId,
      {
        reason: "sold",
        effectiveAt: "2026-05-20T00:00:00.000Z",
        debrandingRequired: false,
      },
    );

    const accepted = services.reportingFilingService.createReportJob({
      jobType: "vehicle_monthly_delta",
      format: "csv",
      filters: { month: "2026-05" },
    });
    await flushReportingQueue();
    await flushReportingQueue();
    const job = services.reportingFilingService.getReportJob(accepted.jobId);
    const rows = (job.rows ?? []) as Array<{
      periodMonth: string;
      closingCount: number;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.periodMonth).toBe("2026-05");
    // Closing count is cumulative: a single-month report must not restart the
    // running total at zero.
    expect(rows[0]!.closingCount).toBe(vehicles.length - 1);
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
        "REPORT_TYPE_NOT_TENANT_SCOPED",
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

describe("report export", () => {
  async function completedJob(jobType: string, format = "csv") {
    const services = createServices();
    const accepted = services.reportingFilingService.createReportJob({
      jobType,
      format: format as never,
    });
    await flushReportingQueue();
    await flushReportingQueue();
    return { services, jobId: accepted.jobId };
  }

  it("streams a report as CSV with the rows it computed", async () => {
    const { services, jobId } = await completedJob("vehicle_roster");

    const artifact = services.reportingFilingService.renderReportArtifact(
      jobId,
      "req-download",
    );
    const text = artifact.buffer.toString("utf8");
    const lines = text.split("\r\n");
    const vehicles = services.regulatoryRegistryService.listVehicles();

    expect(artifact.contentType).toContain("text/csv");
    expect(artifact.fileName).toBe(`vehicle_roster-${jobId}.csv`);
    // Header plus one line per vehicle -- the file has to carry what the API
    // said the report contained, not a plausible-looking subset.
    expect(lines).toHaveLength(vehicles.length + 1);
    expect(lines[0]).toContain('"vehicleId"');
    expect(text).toContain(vehicles[0]!.plateNo);
  });

  it("neutralises a cell a spreadsheet would execute", () => {
    // A value beginning "=", "+", "-" or "@" is a formula to Excel, Numbers and
    // LibreOffice. These files go to partners and to 公路主管機關, so the
    // leading character is quoted rather than trusted.
    const csv = recordsToCsv([
      { plateNo: '=HYPERLINK("http://x")', note: 'has "quotes"' },
    ]);

    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain('has ""quotes""');
  });

  it("exports every field even when rows are not uniformly shaped", () => {
    // A report whose later rows carry a field the first row omitted must not
    // silently drop that column.
    const csv = recordsToCsv([{ a: 1 }, { a: 2, b: 3 }]);

    expect(csv.split("\r\n")[0]).toBe('"a","b"');
    expect(csv.split("\r\n")[2]).toBe('"2","3"');
  });

  it("refuses a format that has no renderer instead of returning no file", () => {
    const { reportingFilingService } = createServices();

    // `format` used to be decoration: xlsx and csv produced identical results,
    // which is to say no bytes at all.
    for (const format of ["xlsx", "pdf", "zip"] as const) {
      expectApiErrorCode(
        () =>
          reportingFilingService.createReportJob({
            jobType: "vehicle_roster",
            format,
          }),
        "REPORT_FORMAT_NOT_IMPLEMENTED",
      );
    }
  });

  it("refuses to hand over a file for a job that has not completed", () => {
    const { reportingFilingService } = createServices();
    const accepted = reportingFilingService.createReportJob({
      jobType: "vehicle_roster",
      format: "csv",
    });

    expectApiErrorCode(
      () => reportingFilingService.renderReportArtifact(accepted.jobId),
      "REPORT_ARTIFACT_NOT_READY",
    );
  });

  it("keeps the tenant boundary on the file, not only on the description", async () => {
    const { services, jobId } = await completedJob("monthly_trip_report");

    // Downloading is a stronger act than describing, so it cannot be the
    // weaker check.
    expect(() =>
      services.reportingFilingService.renderReportArtifact(
        jobId,
        "req-download",
        null,
        "tenant-not-the-owner",
      ),
    ).toThrow();
  });
});

describe("operational reports", () => {
  async function completed(jobType: string, filters?: Record<string, unknown>) {
    const services = createServices();
    const accepted = services.reportingFilingService.createReportJob({
      jobType,
      format: "csv",
      ...(filters ? { filters } : {}),
    });
    await flushReportingQueue();
    await flushReportingQueue();
    return {
      services,
      job: services.reportingFilingService.getReportJob(accepted.jobId),
    };
  }

  it("summarises trips by service product rather than listing them", async () => {
    const { services, job } = await completed("trip_summary");

    expect(job.status).toBe("completed");
    const rows = (job.rows ?? []) as Array<{
      serviceProduct: string;
      totalOrders: number;
      completedTrips: number;
      cancelledOrders: number;
      inFlightOrders: number;
      completionRate: number | null;
    }>;

    // An aggregate, not a per-order listing -- that is what
    // `monthly_trip_report` is for.
    const orders = services.ownedMobilityService.listOrders();
    expect(rows.length).toBeLessThanOrEqual(orders.length);
    expect(rows.reduce((sum, row) => sum + row.totalOrders, 0)).toBe(
      orders.length,
    );
    for (const row of rows) {
      expect(
        row.completedTrips + row.cancelledOrders + row.inFlightOrders,
      ).toBe(row.totalOrders);
    }
  });

  it("says nothing happened rather than everything failed", async () => {
    // A window with no orders must not report a completion rate of 0, which
    // reads as "every trip failed".
    const { job } = await completed("trip_summary", {
      from: "1999-01-01T00:00:00.000Z",
      to: "1999-12-31T23:59:59.000Z",
    });

    expect(job.rows).toHaveLength(0);
  });

  it("registers incidents with their recovery-action count", async () => {
    const { services, job } = await completed("incident_register");

    expect(job.rows).toHaveLength(
      services.incidentService.listIncidents().length,
    );
  });

  it("flags a maintenance job that is scheduled, overdue and still open", async () => {
    const services = createServices();
    services.maintenanceService.createMaintenanceLog({
      vehicleId: "veh-demo-001",
      type: "repair",
      description: "brake pads",
      scheduledAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    } as never);

    const accepted = services.reportingFilingService.createReportJob({
      jobType: "maintenance_overview",
      format: "csv",
    });
    await flushReportingQueue();
    await flushReportingQueue();
    const rows = (services.reportingFilingService.getReportJob(accepted.jobId)
      .rows ?? []) as Array<{
      description: string;
      overdueDays: number | null;
      completedAt: string | null;
    }>;

    const overdue = rows.find((row) => row.description === "brake pads");
    // Overdue is why anyone opens this report, and it is not a stored field.
    expect(overdue?.overdueDays).toBe(3);
    for (const row of rows.filter((r) => r.completedAt)) {
      expect(row.overdueDays).toBeNull();
    }
  });
});
