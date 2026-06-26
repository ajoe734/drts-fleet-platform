import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import type {
  RegulatoryReportFiling,
  SubmitRegulatoryReportCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";

/**
 * RegulatoryReportingService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the AV regulatory reporting surface (disengagement
 * summaries, collision reports, ODD compliance, incident filings) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete report generation/submission
 * and persistence against av_evidence.regulatory_report_filings (V0037) land in
 * downstream waves.
 */
@Injectable()
export class RegulatoryReportingService {
  private readonly logger = new Logger(RegulatoryReportingService.name);

  private filings: RegulatoryReportFiling[] = [
    {
      reportId: "job-incident-filing-acc-0214",
      reportType: "incident_filing",
      status: "generated",
      periodStart: "2026-06-25T14:48:00.000Z",
      periodEnd: "2026-06-25T15:10:00.000Z",
      jurisdiction: "taipei_city",
      caseId: "acc_0214",
      evidenceManifestId: "manifest-veh-7732-incident-0214",
      generatedAt: "2026-06-25T15:08:00.000Z",
      submittedAt: null,
      submittedBy: null,
      acknowledgementRef: null,
      artifactObjectKey:
        "reports/incident/job-incident-filing-acc-0214/report.pdf",
      artifactChecksumSha256: "report-checksum-acc-0214",
    },
    {
      reportId: "job-weekly-odd-compliance-2026-w25",
      reportType: "odd_compliance_report",
      status: "generated",
      periodStart: "2026-06-15T00:00:00.000Z",
      periodEnd: "2026-06-21T23:59:59.000Z",
      jurisdiction: "taipei_city",
      caseId: null,
      evidenceManifestId: null,
      generatedAt: "2026-06-22T03:11:00.000Z",
      submittedAt: null,
      submittedBy: null,
      acknowledgementRef: null,
      artifactObjectKey:
        "reports/odd/job-weekly-odd-compliance-2026-w25/report.pdf",
      artifactChecksumSha256: "report-checksum-w25",
    },
  ];

  listReports(): RegulatoryReportFiling[] {
    return [...this.filings]
      .map((report) => this.cloneReport(report))
      .sort((left, right) =>
        (right.generatedAt ?? right.submittedAt ?? "").localeCompare(
          left.generatedAt ?? left.submittedAt ?? "",
        ),
      );
  }

  submitReport(
    reportId: string,
    command: SubmitRegulatoryReportCommand,
    actorId: string,
  ): RegulatoryReportFiling {
    const report = this.requireReport(reportId);
    if (report.status === "submitted" || report.status === "accepted") {
      return this.cloneReport(report);
    }

    report.status = "submitted";
    report.submittedAt = new Date().toISOString();
    report.submittedBy = actorId.trim();
    report.acknowledgementRef =
      command.acknowledgementRef?.trim() || `ack-${randomUUID()}`;

    return this.cloneReport(report);
  }

  private requireReport(reportId: string) {
    const report = this.filings.find((candidate) => candidate.reportId === reportId);
    if (!report) {
      throw new ApiRequestError(
        404,
        "REGULATORY_REPORT_NOT_FOUND",
        "The requested regulatory report could not be found.",
        { reportId },
      );
    }
    return report;
  }

  private cloneReport(report: RegulatoryReportFiling): RegulatoryReportFiling {
    return { ...report };
  }
}
