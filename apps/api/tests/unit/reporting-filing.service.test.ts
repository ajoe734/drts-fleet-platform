import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { ReportingFilingService } from "../../src/modules/reporting-filing/reporting-filing.service";

function flushBackgroundWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-demo-001",
    orderNo: "O-20260429-0001",
    tenantId: "tenant-demo-001",
    orderSource: "phone",
    callId: "call-session-abcdef123456",
    recordingId: "recording-session-fedcba654321",
    complianceFlags: [],
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "credit_card_airport_transfer",
    partnerId: "partner-bank-demo-001",
    partnerProgramId: "program-airport-alpha",
    partnerEntrySlug: "bank-demo-alpha-airport",
    eligibilityVerificationId: "elig-demo-001",
    issuerAuthorizationRef: "issuer-auth-bank-demo-0321",
    benefitReference: "benefit-bank-demo-0321",
    status: "completed",
    quotedFare: {
      currency: "NTD",
      amountMinor: 125000,
    },
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("ReportingFilingService sensitive-data governance", () => {
  afterEach(() => {
    delete process.env.CONTROLLED_DOWNLOAD_SIGNING_SECRET;
  });

  it("masks recording identifiers and audits report artifact download issuance", async () => {
    process.env.CONTROLLED_DOWNLOAD_SIGNING_SECRET =
      "reporting-download-test-secret";

    const auditNotificationService = new AuditNotificationService();
    const service = new ReportingFilingService(auditNotificationService);
    service.registerOrderFeedProvider(() => [createOrder()] as never[]);

    const accepted = service.createReportJob(
      {
        jobType: "dispatch_recording_index",
        format: "csv",
      },
      "req-report-create-001",
    );
    await flushBackgroundWork();

    const detail = service.getReportJob(accepted.jobId, "req-report-open-001");
    expect(detail.artifact?.downloadMetadata.ttlMinutes).toBe(15);
    expect(detail.rows?.[0]).toMatchObject({
      callId: "call-ses...3456",
      recordingId: "recordin...4321",
      missingRecording: false,
    });
    expect(detail.settlementMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "phone_dispatch",
          localLedgerMode: "full_service",
        }),
        expect.objectContaining({
          channelKey: "forwarded_shadow",
          localLedgerMode: "shadow_only",
        }),
      ]),
    );

    const accessAudit = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "issue_report_artifact_download");
    expect(accessAudit?.newValuesSummary).toMatchObject({
      jobId: accepted.jobId,
      jobType: "dispatch_recording_index",
      ttlMinutes: 15,
    });
  });

  it("masks partner references and audits filing package download issuance", async () => {
    process.env.CONTROLLED_DOWNLOAD_SIGNING_SECRET =
      "reporting-download-test-secret";

    const auditNotificationService = new AuditNotificationService();
    const service = new ReportingFilingService(auditNotificationService);
    service.registerOrderFeedProvider(() => [createOrder()] as never[]);

    const reportAccepted = service.createReportJob(
      {
        jobType: "revenue_summary",
        format: "xlsx",
      },
      "req-report-create-002",
    );
    await flushBackgroundWork();

    const reportDetail = service.getReportJob(
      reportAccepted.jobId,
      "req-report-open-002",
    );
    expect(reportDetail.partnerRevenueRows?.[0]).toMatchObject({
      issuerAuthorizationRef: "issuer-a...0321",
      benefitReference: "benefit-...0321",
    });
    expect(reportDetail.settlementMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "partner_airport",
        }),
      ]),
    );

    const packageAccepted = service.generateFilingPackage(
      {
        packageType: "audit_request",
      },
      "req-filing-create-001",
    );
    await flushBackgroundWork();

    const filingDetail = service.getFilingPackage(
      packageAccepted.packageId,
      "req-filing-open-001",
    );
    expect(filingDetail.downloadMetadata?.zip.ttlMinutes).toBe(15);

    const filingAudit = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "issue_filing_package_download");
    expect(filingAudit?.newValuesSummary).toMatchObject({
      packageId: packageAccepted.packageId,
      ttlMinutes: 15,
    });
  });

  it("enforces tenant-scoped report evidence access for tenant routes", async () => {
    process.env.CONTROLLED_DOWNLOAD_SIGNING_SECRET =
      "reporting-download-test-secret";

    const auditNotificationService = new AuditNotificationService();
    const service = new ReportingFilingService(auditNotificationService);
    service.registerOrderFeedProvider(() => [createOrder()] as never[]);

    const accepted = service.createReportJob(
      {
        jobType: "revenue_summary",
        format: "csv",
      },
      "req-report-create-tenant-001",
      "tenant-demo-001",
    );
    await flushBackgroundWork();

    const tenantIdentity = {
      actorType: "tenant_admin" as const,
      actorId: "tenant-admin-001",
      realm: "tenant" as const,
      scopes: ["reports:read"],
      tenantId: "tenant-demo-001",
    };
    const otherTenantIdentity = {
      ...tenantIdentity,
      actorId: "tenant-admin-002",
      tenantId: "tenant-other-001",
    };

    const detail = service.getReportJob(
      accepted.jobId,
      "req-report-tenant-open-001",
      tenantIdentity,
      "tenant-demo-001",
    );
    expect(detail.filters).toMatchObject({
      tenantId: "tenant-demo-001",
    });

    expect(() =>
      service.getReportJob(
        accepted.jobId,
        "req-report-tenant-open-002",
        otherTenantIdentity,
        "tenant-other-001",
      ),
    ).toThrowError(ApiRequestError);

    const tenantAudit = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "issue_report_artifact_download");
    expect(tenantAudit?.actorType).toBe("tenant_admin");
    expect(tenantAudit?.newValuesSummary).toMatchObject({
      evidenceFamily: "report_artifact",
      tenantId: "tenant-demo-001",
      accessAction: "download",
    });
  });
});
