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
          sponsorType: expect.stringContaining("issuer"),
          driverPayoutAuthority: expect.stringContaining("platform"),
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

  it("materializes tenant monthly trip report rows and tenant-scoped completion audit", async () => {
    process.env.CONTROLLED_DOWNLOAD_SIGNING_SECRET =
      "reporting-download-test-secret";

    const auditNotificationService = new AuditNotificationService();
    const service = new ReportingFilingService(auditNotificationService);
    service.registerOrderFeedProvider(
      () =>
        [
          createOrder({
            orderId: "order-monthly-001",
            orderNo: "O-MONTHLY-001",
            orderSource: "web",
            tenantId: "tenant-demo-001",
            businessDispatchSubtype: "enterprise_dispatch",
            bookingId: "booking-monthly-001",
            costCenter: "CC-MONTHLY",
            updatedAt: "2026-04-29T01:02:03.000Z",
          }),
        ] as never[],
    );
    service.registerCostCenterDirectoryProvider((tenantId) =>
      tenantId === "tenant-demo-001"
        ? ([
            {
              tenantId,
              code: "CC-MONTHLY",
              name: "Monthly owner center",
              description: null,
              ownerUserId: "tenant-admin-001",
              ownerName: "Tenant Admin",
              activeFlag: true,
              disabledAt: null,
              disabledReason: null,
              createdAt: "2026-04-29T00:00:00.000Z",
              updatedAt: "2026-04-29T00:00:00.000Z",
            },
          ] as never[])
        : [],
    );

    const accepted = service.createReportJob(
      {
        jobType: "monthly_trip_report",
        format: "json",
        filters: {
          orderId: "order-monthly-001",
          userId: "tenant-admin-001",
          costCenterCode: "CC-MONTHLY",
          serviceProduct: "enterprise_dispatch",
        },
      },
      "req-report-create-monthly-001",
      "tenant-demo-001",
    );
    await flushBackgroundWork();

    const detail = service.getReportJob(
      accepted.jobId,
      "req-report-open-monthly-001",
      undefined,
      "tenant-demo-001",
    );
    expect(detail.rows?.[0]).toMatchObject({
      orderId: "order-monthly-001",
      userId: "tenant-admin-001",
      costCenterCode: "CC-MONTHLY",
      serviceProduct: "enterprise_dispatch",
      sourceMarker: "owned_mobility_order_feed",
      costCenterSourceMarker: "tenant_partner_cost_center_directory",
      sourceUpdatedAt: "2026-04-29T01:02:03.000Z",
      producerRequestId: "req-report-create-monthly-001",
    });

    const completionAudit = auditNotificationService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "complete_report_job" &&
          entry.resourceId === accepted.jobId,
      );
    expect(completionAudit).toMatchObject({
      tenantId: "tenant-demo-001",
      requestId: "req-report-create-monthly-001",
    });
    expect(completionAudit?.newValuesSummary).toMatchObject({
      tenantId: "tenant-demo-001",
      rowCount: 1,
    });
  });

  it("surfaces legal holds and deletion exceptions on report and filing evidence detail views", async () => {
    process.env.CONTROLLED_DOWNLOAD_SIGNING_SECRET =
      "reporting-download-test-secret";

    const auditNotificationService = new AuditNotificationService();
    const service = new ReportingFilingService(auditNotificationService);
    service.registerOrderFeedProvider(() => [createOrder()] as never[]);

    const reportAccepted = service.createReportJob(
      {
        jobType: "revenue_summary",
        format: "csv",
      },
      "req-report-create-governance-001",
      "tenant-demo-001",
    );
    const packageAccepted = service.generateFilingPackage(
      {
        packageType: "audit_request",
      },
      "req-filing-create-governance-001",
    );
    await flushBackgroundWork();

    const reportDetail = service.getReportJob(
      reportAccepted.jobId,
      "req-report-open-governance-001",
      undefined,
      "tenant-demo-001",
    );
    const filingDetail = service.getFilingPackage(
      packageAccepted.packageId,
      "req-filing-open-governance-001",
    );

    auditNotificationService.placeEvidenceLegalHold(
      {
        family: "report_artifact",
        subjectId: reportDetail.artifact!.artifactId,
        caseNumber: "CASE-REPORT-001",
        reasonCode: "settlement_dispute",
        tenantId: "tenant-demo-001",
        manifestHash: reportDetail.artifact!.manifestHash,
      },
      {
        actorId: "ops-user-001",
        actorType: "ops_user",
        realm: "ops",
        scopes: ["audit:read"],
        tenantId: null,
      },
    );
    auditNotificationService.registerEvidenceDeletionException(
      {
        family: "filing_package",
        subjectId: filingDetail.packageId,
        sourceResourceType: "regulator_packet",
        sourceResourceId: "reg-001",
        reviewerActorId: "platform-admin-001",
        reviewerActorType: "platform_admin",
        expiresAt: "2099-01-01T00:00:00.000Z",
        reasonCode: "regulatory_request",
        manifestHash: filingDetail.manifestHash,
      },
      {
        actorId: "ops-user-001",
        actorType: "ops_user",
        realm: "ops",
        scopes: ["audit:read"],
        tenantId: null,
      },
    );

    const governedReportDetail = service.getReportJob(
      reportAccepted.jobId,
      "req-report-open-governance-002",
      undefined,
      "tenant-demo-001",
    );
    const governedFilingDetail = service.getFilingPackage(
      packageAccepted.packageId,
      "req-filing-open-governance-002",
    );

    expect(governedReportDetail.evidenceGovernance).toMatchObject({
      subjectId: reportDetail.artifact!.artifactId,
      deletionSuppressed: true,
    });
    expect(
      governedReportDetail.evidenceGovernance?.activeLegalHolds,
    ).toHaveLength(1);
    expect(governedFilingDetail.evidenceGovernance).toMatchObject({
      subjectId: filingDetail.packageId,
      deletionSuppressed: true,
    });
    expect(
      governedFilingDetail.evidenceGovernance?.activeDeletionExceptions,
    ).toHaveLength(1);
  });
});
