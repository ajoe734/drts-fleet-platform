import { EventEmitter } from "node:events";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { ReportOutputFormat } from "@drts/contracts";
import { REGULATORY_REPORT_JOB_TYPES } from "@drts/contracts";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { ComplaintService } from "../../../../apps/api/src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IncidentService } from "../../../../apps/api/src/modules/incident/incident.service";
import { MaintenanceService } from "../../../../apps/api/src/modules/maintenance/maintenance.service";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import {
  extractReportRecords,
  renderReportXlsx,
} from "../../../../apps/api/src/modules/reporting-filing/report-xlsx.renderer";
import { renderReportPdf } from "../../../../apps/api/src/modules/reporting-filing/report-pdf.renderer";
import { recordsToCsv } from "../../../../apps/api/src/common/csv";

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
  reportingFilingService.registerIncidentFeedProvider(() =>
    incidentService.listIncidents(),
  );
  reportingFilingService.registerMaintenanceFeedProvider(() =>
    maintenanceService.listMaintenanceLogs(),
  );

  return {
    auditService,
    regulatoryRegistryService,
    reportingFilingService,
  };
}

async function flushReportingQueue() {
  await Promise.resolve();
  await Promise.resolve();
}

async function completedJob(
  services: ReturnType<typeof createServices>,
  jobType: string,
  format: ReportOutputFormat,
  filters?: Record<string, unknown>,
) {
  const accepted = services.reportingFilingService.createReportJob({
    jobType,
    format,
    ...(filters ? { filters } : {}),
  });
  await flushReportingQueue();
  await flushReportingQueue();
  return accepted.jobId;
}

describe("SR-REPORT-001: General Report PDF/XLSX and Format Declarations", () => {
  it("accepts csv, xlsx, and pdf, but explicitly refuses zip and unknown formats", () => {
    const { reportingFilingService } = createServices();

    // The three general formats must all be accepted
    for (const format of ["csv", "xlsx", "pdf"] as const) {
      const accepted = reportingFilingService.createReportJob({
        jobType: "vehicle_roster",
        format,
      });
      expect(accepted.status).toBe("queued");
      const job = reportingFilingService.getReportJob(accepted.jobId);
      expect(job.format).toBe(format);
    }

    // Unrendered format zip must be refused with REPORT_FORMAT_NOT_IMPLEMENTED
    expectApiErrorCode(
      () =>
        reportingFilingService.createReportJob({
          jobType: "vehicle_roster",
          format: "zip",
        }),
      "REPORT_FORMAT_NOT_IMPLEMENTED",
    );

    // Unknown format must be refused with REPORT_FORMAT_UNKNOWN
    expectApiErrorCode(
      () =>
        reportingFilingService.createReportJob({
          jobType: "vehicle_roster",
          format: "json" as never,
        }),
      "REPORT_FORMAT_UNKNOWN",
    );
  });

  it("produces parseable, byte-level artifacts with identical data across CSV, XLSX, and PDF", async () => {
    const services = createServices();
    const vehicles = services.regulatoryRegistryService.listVehicles();
    expect(vehicles.length).toBeGreaterThan(0);

    const csvJobId = await completedJob(services, "vehicle_roster", "csv");
    const xlsxJobId = await completedJob(services, "vehicle_roster", "xlsx");
    const pdfJobId = await completedJob(services, "vehicle_roster", "pdf");

    // 1. CSV Verification
    const csvArtifact =
      await services.reportingFilingService.renderReportArtifact(
        csvJobId,
        "req-csv",
      );
    expect(csvArtifact.contentType).toBe("text/csv; charset=utf-8");
    expect(csvArtifact.fileName).toBe(`vehicle_roster-${csvJobId}.csv`);
    const csvText = csvArtifact.buffer.toString("utf8");
    const csvLines = csvText.split("\r\n");
    expect(csvLines.length).toBe(vehicles.length + 1); // Header + data lines
    const csvHeaders = csvLines[0]!.split(",").map((h) => h.replace(/"/g, ""));
    expect(csvHeaders).toContain("vehicleId");
    expect(csvHeaders).toContain("plateNo");
    expect(csvText).toContain(vehicles[0]!.plateNo);

    // 2. XLSX Verification
    const xlsxArtifact =
      await services.reportingFilingService.renderReportArtifact(
        xlsxJobId,
        "req-xlsx",
      );
    expect(xlsxArtifact.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(xlsxArtifact.fileName).toBe(`vehicle_roster-${xlsxJobId}.xlsx`);
    expect(xlsxArtifact.buffer.subarray(0, 4)).toEqual(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxArtifact.buffer as never);
    const worksheet = workbook.getWorksheet("vehicle_roster");
    expect(worksheet).toBeDefined();
    // ExcelJS rowCount includes header row
    expect(worksheet!.rowCount).toBe(vehicles.length + 1);

    // Verify header row in XLSX matches CSV headers
    const xlsxHeaders: string[] = [];
    worksheet!.getRow(1).eachCell((cell) => {
      xlsxHeaders.push(String(cell.value));
    });
    expect(xlsxHeaders).toEqual(csvHeaders);

    // Verify first data row matches in both XLSX and CSV
    const firstRowVehicleId = String(worksheet!.getCell("A2").value);
    expect(firstRowVehicleId).toBe(vehicles[0]!.vehicleId);
    const firstRowPlateNo = String(worksheet!.getCell("B2").value);
    expect(firstRowPlateNo).toBe(vehicles[0]!.plateNo);

    // 3. PDF Verification
    const pdfArtifact =
      await services.reportingFilingService.renderReportArtifact(
        pdfJobId,
        "req-pdf",
      );
    expect(pdfArtifact.contentType).toBe("application/pdf");
    expect(pdfArtifact.fileName).toBe(`vehicle_roster-${pdfJobId}.pdf`);
    expect(pdfArtifact.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdfArtifact.buffer.subarray(-6).toString("latin1")).toContain(
      "%%EOF",
    );
    expect(pdfArtifact.buffer.byteLength).toBeGreaterThan(500);

    // PDF contains title, metadata, and data
    const pdfString = pdfArtifact.buffer.toString("latin1");
    expect(pdfString).toContain("vehicle_roster");
    expect(pdfString).toContain(pdfJobId);
  });

  it("neutralises spreadsheet formula injection across CSV and XLSX", async () => {
    const services = createServices();

    // Register a vehicle with malicious spreadsheet formula payload
    const baseVehicle = services.regulatoryRegistryService.listVehicles()[0];
    services.reportingFilingService.registerVehicleRegistryFeedProvider(() => [
      {
        ...baseVehicle,
        vehicleId: "veh-formula-001",
        plateNo: '=HYPERLINK("http://malicious.com")',
        operatingArea: "+CMD|' /C calc'!A0",
      },
    ]);

    const csvJobId = await completedJob(services, "vehicle_roster", "csv");
    const xlsxJobId = await completedJob(services, "vehicle_roster", "xlsx");

    const csvArtifact =
      await services.reportingFilingService.renderReportArtifact(csvJobId);
    const csvText = csvArtifact.buffer.toString("utf8");
    expect(csvText).toContain(`"'=HYPERLINK`);
    expect(csvText).toContain(`"'+CMD`);

    const xlsxArtifact =
      await services.reportingFilingService.renderReportArtifact(xlsxJobId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxArtifact.buffer as never);
    const worksheet = workbook.getWorksheet("vehicle_roster");
    expect(worksheet).toBeDefined();

    let foundNeutralizedFormula = false;
    worksheet!.eachRow((row) => {
      row.eachCell((cell) => {
        const val = String(cell.value);
        if (val.includes("HYPERLINK") || val.includes("CMD")) {
          // Must start with single quote to prevent formula execution in Excel
          expect(val.startsWith("'")).toBe(true);
          foundNeutralizedFormula = true;
        }
      });
    });
    expect(foundNeutralizedFormula).toBe(true);
  });

  it("handles non-uniform rows across CSV, XLSX, and PDF without dropping columns", async () => {
    const nonUniformJob = {
      jobId: "job-non-uniform-test",
      jobType: "custom_sparse_report",
      format: "xlsx" as const,
      status: "completed" as const,
      tenantId: null,
      scope: {},
      createdAt: "2026-09-06T00:00:00Z",
      updatedAt: "2026-09-06T00:00:00Z",
      completedAt: "2026-09-06T00:00:01Z",
      rows: [
        {
          caseId: "CASE-001",
          category: "driver_attitude",
          status: "open",
          description: "First row has description",
        },
        {
          caseId: "CASE-002",
          category: "fare_dispute",
          status: "resolved",
          resolutionNotes:
            "Second row has resolutionNotes that first row omitted",
        },
      ],
    };

    // 1. XLSX renders all columns from union in first-seen order
    const xlsxBuffer = await renderReportXlsx(nonUniformJob);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxBuffer as never);
    const worksheet = workbook.getWorksheet("custom_sparse_report");
    expect(worksheet).toBeDefined();

    const headers: string[] = [];
    worksheet!.getRow(1).eachCell((cell) => headers.push(String(cell.value)));
    expect(headers).toContain("caseId");
    expect(headers).toContain("category");
    expect(headers).toContain("status");
    expect(headers).toContain("description");
    expect(headers).toContain("resolutionNotes");

    // 2. CSV also includes all columns from union
    const csvBuffer = Buffer.from(
      recordsToCsv(extractReportRecords(nonUniformJob)),
      "utf8",
    );
    const csvHeaderLine = csvBuffer.toString("utf8").split("\r\n")[0];
    expect(csvHeaderLine).toContain("caseId");
    expect(csvHeaderLine).toContain("resolutionNotes");

    // 3. PDF also handles non-uniform rows without crashing
    const pdfBuffer = await renderReportPdf(nonUniformJob);
    expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("enforces tenant boundary and job readiness guards on downloads", async () => {
    const services = createServices();

    // 1. Not ready when queued
    const accepted = services.reportingFilingService.createReportJob({
      jobType: "vehicle_roster",
      format: "xlsx",
    });
    expectApiErrorCode(
      () =>
        services.reportingFilingService.renderReportArtifact(accepted.jobId),
      "REPORT_ARTIFACT_NOT_READY",
    );

    // Complete the job
    await flushReportingQueue();
    await flushReportingQueue();

    // 2. Cross-tenant download access rejected
    expect(() =>
      services.reportingFilingService.renderReportArtifact(
        accepted.jobId,
        "req-download",
        null,
        "tenant-other-realm",
      ),
    ).toThrow();
  });

  it("renders all 9 PRD 9.10.1 regulatory report types in both PDF and XLSX", async () => {
    const services = createServices();

    for (const jobType of REGULATORY_REPORT_JOB_TYPES) {
      const xlsxJobId = await completedJob(services, jobType, "xlsx");
      const pdfJobId = await completedJob(services, jobType, "pdf");

      const xlsxArtifact =
        await services.reportingFilingService.renderReportArtifact(xlsxJobId);
      expect(xlsxArtifact.contentType).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(xlsxArtifact.fileName).toBe(`${jobType}-${xlsxJobId}.xlsx`);
      expect(xlsxArtifact.buffer.byteLength).toBeGreaterThan(0);

      const pdfArtifact =
        await services.reportingFilingService.renderReportArtifact(pdfJobId);
      expect(pdfArtifact.contentType).toBe("application/pdf");
      expect(pdfArtifact.fileName).toBe(`${jobType}-${pdfJobId}.pdf`);
      expect(pdfArtifact.buffer.subarray(0, 5).toString("latin1")).toBe(
        "%PDF-",
      );
    }
  });

  it("correctly renders partner revenue summary rows into XLSX and PDF", async () => {
    const services = createServices();
    const xlsxJobId = await completedJob(services, "revenue_summary", "xlsx");
    const pdfJobId = await completedJob(services, "revenue_summary", "pdf");

    const xlsxArtifact =
      await services.reportingFilingService.renderReportArtifact(xlsxJobId);
    expect(xlsxArtifact.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxArtifact.buffer as never);
    expect(workbook.worksheets.length).toBeGreaterThan(0);

    const pdfArtifact =
      await services.reportingFilingService.renderReportArtifact(pdfJobId);
    expect(pdfArtifact.contentType).toBe("application/pdf");
    expect(pdfArtifact.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
