import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MultiTaxiTripOperationalExportRow,
  ReportJobRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";
import { recordsToCsv } from "../../src/common/csv";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type {
  ReportingFilingState,
  StoredReportJobRecord,
} from "../../src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../src/modules/reporting-filing/reporting-filing.service";

function flushBackgroundWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createIdentity(
  scopes = ["multi_taxi_records:export"],
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "platform-admin-export-001",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["records_exporter"],
    scopes,
    requestId: "req-export-identity-001",
  };
}

function createExportRow(
  overrides: Partial<MultiTaxiTripOperationalExportRow> = {},
): MultiTaxiTripOperationalExportRow {
  return {
    recordId: "mtr-order-001",
    orderId: "order-001",
    tripId: "trip-001",
    orderNoMasked: "MTX...01",
    plateNo: "TAA-0001",
    plateNoMasked: "TA...01",
    reservedAt: "2026-07-23T01:00:00.000Z",
    pickupAt: "2026-07-23T01:10:00.000Z",
    dropoffAt: "2026-07-23T01:30:00.000Z",
    routeSummary: null,
    routeSource: "unavailable",
    distanceMeters: null,
    durationSeconds: null,
    payableFareMinor: 35000,
    actualFareMinor: 35000,
    collectedFareMinor: null,
    paymentStatus: "unknown",
    tollMinor: 0,
    tollSource: "unavailable",
    currency: "NTD",
    farePolicyVersion: "fare-2026-07",
    chargingMode: "platform_quote",
    generatedAt: "2026-07-23T01:31:00.000Z",
    retainUntil: "2028-07-23T01:31:00.000Z",
    ...overrides,
  };
}

function createPersistingRepository() {
  const state: ReportingFilingState = {
    reportJobs: [],
    filingPackages: [],
  };
  const persistedStatuses: ReportJobRecord["status"][] = [];
  const repository = {
    loadState: vi.fn(async () => structuredClone(state)),
    persistChanges: vi.fn(
      async (changes: { reportJobs?: StoredReportJobRecord[] }) => {
        for (const job of changes.reportJobs ?? []) {
          persistedStatuses.push(job.status);
          const index = state.reportJobs.findIndex(
            (candidate) => candidate.jobId === job.jobId,
          );
          if (index >= 0) {
            state.reportJobs[index] = structuredClone(job);
          } else {
            state.reportJobs.push(structuredClone(job));
          }
        }
      },
    ),
    reportPersistenceFailure: vi.fn(),
  };
  return { repository, state, persistedStatuses };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("P5-EXPORT-001 controlled multi-taxi export", () => {
  it("uses the export scope without inheriting unrelated foundation permissions", () => {
    const createPolicy = resolveRouteAuthPolicy(
      "POST",
      "/api/platform-admin/multi-taxi-trip-records/export-jobs",
    );
    const downloadPolicy = resolveRouteAuthPolicy(
      "GET",
      "/api/platform-admin/multi-taxi-trip-records/export-jobs/JOB-001/download",
    );

    expect(createPolicy).toMatchObject({
      requiredScopes: ["multi_taxi_records:export"],
      allowedRealms: ["system", "platform"],
    });
    expect(downloadPolicy).toMatchObject({
      requiredScopes: ["multi_taxi_records:export"],
      allowedRealms: ["system", "platform"],
    });
  });

  it("previews a normalized scope and audits the actor and count", () => {
    const audit = new AuditNotificationService();
    const service = new ReportingFilingService(audit);

    const preview = service.previewMultiTaxiTripExport(
      { month: " 2026-07 ", q: " MTX-001 " },
      3,
      createIdentity(),
      "req-export-preview-001",
    );

    expect(preview).toMatchObject({
      scope: { month: "2026-07", q: "MTX-001" },
      recordCount: 3,
      format: "csv",
      purposeRequired: true,
    });
    expect(
      audit
        .listAuditLogs()
        .find((entry) => entry.actionName === "preview_multi_taxi_trip_export"),
    ).toMatchObject({
      actorId: "platform-admin-export-001",
      requestId: "req-export-preview-001",
      newValuesSummary: {
        accessAction: "export",
        recordCount: 3,
      },
    });
  });

  it("persists the full lifecycle and issues a freshly authorized download", async () => {
    const audit = new AuditNotificationService();
    const { repository, persistedStatuses } = createPersistingRepository();
    const service = new ReportingFilingService(audit, repository as never);
    const identity = createIdentity();
    const command = {
      scope: { month: "2026-07" },
      purpose: "Monthly statutory operations review",
      idempotencyKey: "export-2026-07-review-v1",
    };

    const accepted = service.createMultiTaxiTripExportJob(
      command,
      [createExportRow()],
      identity,
      "req-export-create-001",
    );
    expect(accepted).toMatchObject({
      status: "pending",
      idempotentReplay: false,
    });
    expect(
      service.getMultiTaxiTripExportJob(accepted.jobId, identity).status,
    ).toBe("pending");
    expect(() =>
      service.issueMultiTaxiTripExportDownload(accepted.jobId, identity),
    ).toThrowError(ApiRequestError);

    await flushBackgroundWork();

    const completed = service.getMultiTaxiTripExportJob(
      accepted.jobId,
      identity,
    );
    expect(completed).toMatchObject({
      status: "completed",
      purpose: "Monthly statutory operations review",
      recordCount: 1,
      requestedByActorId: "platform-admin-export-001",
      downloadAvailable: true,
    });
    expect(completed).not.toHaveProperty("artifact");
    expect(completed).not.toHaveProperty("rows");
    expect(persistedStatuses).toEqual(["pending", "running", "completed"]);

    const issued = service.issueMultiTaxiTripExportDownload(
      accepted.jobId,
      identity,
      "req-export-download-001",
    );
    expect(issued).toMatchObject({
      jobId: accepted.jobId,
      recordCount: 1,
      download: {
        kind: "multi-taxi-trip-records",
        ttlMinutes: 15,
        immutable: true,
      },
    });
    expect(issued.download.downloadUrl).toContain("sig=");
    expect(
      audit
        .listAuditLogs()
        .find(
          (entry) =>
            entry.actionName === "issue_multi_taxi_trip_export_download",
        ),
    ).toMatchObject({
      actorId: "platform-admin-export-001",
      requestId: "req-export-download-001",
      newValuesSummary: {
        accessAction: "download",
        recordCount: 1,
        ttlMinutes: 15,
      },
    });
  });

  it("replays a persisted idempotent request and rejects key reuse conflicts", async () => {
    const { repository } = createPersistingRepository();
    const identity = createIdentity();
    const command = {
      scope: { month: "2026-07" },
      purpose: "Regulator request REG-2026-071",
      idempotencyKey: "reg-2026-071",
    };
    const first = new ReportingFilingService(
      new AuditNotificationService(),
      repository as never,
    );
    const accepted = first.createMultiTaxiTripExportJob(
      command,
      [createExportRow()],
      identity,
    );
    await flushBackgroundWork();

    const restarted = new ReportingFilingService(
      new AuditNotificationService(),
      repository as never,
    );
    await restarted.onModuleInit();
    const replay = restarted.createMultiTaxiTripExportJob(
      command,
      [createExportRow()],
      identity,
    );

    expect(replay).toEqual({
      jobId: accepted.jobId,
      status: "completed",
      idempotentReplay: true,
    });
    expect(() =>
      restarted.createMultiTaxiTripExportJob(
        {
          ...command,
          scope: { month: "2026-06" },
        },
        [createExportRow()],
        identity,
      ),
    ).toThrowError(ApiRequestError);
  });

  it("requires purpose, actor export scope, and records failed signing state", async () => {
    const audit = new AuditNotificationService();
    const { repository, persistedStatuses } = createPersistingRepository();
    const service = new ReportingFilingService(audit, repository as never);

    expect(() =>
      service.createMultiTaxiTripExportJob(
        {
          purpose: " ",
          idempotencyKey: "missing-purpose",
        },
        [],
        createIdentity(),
      ),
    ).toThrowError(ApiRequestError);
    expect(() =>
      service.previewMultiTaxiTripExport({}, 0, createIdentity([])),
    ).toThrowError(ApiRequestError);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONTROLLED_DOWNLOAD_SIGNING_SECRET", "");
    const accepted = service.createMultiTaxiTripExportJob(
      {
        purpose: "Failure-path verification",
        idempotencyKey: "failure-path-v1",
      },
      [],
      createIdentity(),
    );
    await flushBackgroundWork();

    expect(
      service.getMultiTaxiTripExportJob(accepted.jobId, createIdentity())
        .status,
    ).toBe("failed");
    expect(persistedStatuses).toEqual(["pending", "running", "failed"]);
  });

  it("keeps a completed export job unreachable through the generic reporting routes for a reports:read-only actor", async () => {
    const audit = new AuditNotificationService();
    const { repository } = createPersistingRepository();
    const service = new ReportingFilingService(audit, repository as never);
    const exporterIdentity = createIdentity();
    const accepted = service.createMultiTaxiTripExportJob(
      {
        scope: { month: "2026-07" },
        purpose: "Monthly statutory operations review",
        idempotencyKey: "generic-route-leak-check",
      },
      [createExportRow()],
      exporterIdentity,
    );
    await flushBackgroundWork();
    expect(
      service.getMultiTaxiTripExportJob(accepted.jobId, exporterIdentity)
        .status,
    ).toBe("completed");

    function expectReportJobNotFound(run: () => unknown) {
      try {
        run();
        expect.unreachable("expected REPORT_JOB_NOT_FOUND to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        expect((error as ApiRequestError).response.error.code).toBe(
          "REPORT_JOB_NOT_FOUND",
        );
      }
    }

    for (const genericIdentity of [
      createIdentity(["reports:read"]),
      {
        ...createIdentity(["reports:read"]),
        actorType: "ops_user" as const,
        realm: "ops" as const,
      },
    ]) {
      expect(
        service
          .listReportJobs(undefined, genericIdentity)
          .some((job) => job.jobId === accepted.jobId),
      ).toBe(false);
      expectReportJobNotFound(() =>
        service.getReportJob(accepted.jobId, undefined, genericIdentity),
      );
      expectReportJobNotFound(() =>
        service.renderReportArtifact(accepted.jobId, undefined, genericIdentity),
      );
    }
  });

  it("normalizes exact R11 agency scope filters (plateNo, orderNo, orderId, tripId, recordId) and renders statutory CSV columns", async () => {
    const audit = new AuditNotificationService();
    const { repository, state } = createPersistingRepository();
    const service = new ReportingFilingService(audit, repository as never);
    const agencyExporterIdentity: BootstrapRequestIdentity = {
      authMode: "jwt_bearer",
      actorType: "agency_user",
      actorId: "agency-exporter-001",
      principalId: "agency-exporter-001",
      membershipId: "membership-agency-001",
      realm: "agency",
      tenantId: null,
      agencyId: "agency-tpe",
      roleFamilies: ["agency"],
      roles: ["agency_exporter"],
      scopes: ["agency:trip_records:read", "agency:trip_records:export"],
      requestId: "req-agency-export-001",
    };

    const preview = service.previewMultiTaxiTripExport(
      {
        month: " 2026-07 ",
        reservedFrom: "2026-07-01",
        reservedTo: "2026-07-31",
        plateNo: " BKR-2208 ",
        orderNo: " MTX-001 ",
        orderId: " order-001 ",
        tripId: " trip-001 ",
        recordId: " mtr-order-001 ",
      },
      1,
      {
        actorType: agencyExporterIdentity.actorType,
        actorId: agencyExporterIdentity.actorId,
        realm: agencyExporterIdentity.realm,
        scopes: agencyExporterIdentity.scopes,
        tenantId: null,
        agencyId: "agency-tpe",
      },
      "req-agency-export-001",
    );

    expect(preview.scope).toEqual({
      month: "2026-07",
      reservedFrom: "2026-07-01",
      reservedTo: "2026-07-31",
      plateNo: "BKR-2208",
      orderNo: "MTX-001",
      orderId: "order-001",
      tripId: "trip-001",
      recordId: "mtr-order-001",
    });

    const row = createExportRow({
      recordId: "mtr-order-001",
      orderId: "order-001",
      tripId: "trip-001",
      plateNo: "BKR-2208",
      routeSummary: "台北車站 → 松山機場",
      routeSource: "pickup_dropoff_summary",
      distanceMeters: 6800,
      durationSeconds: 1200,
      payableFareMinor: 35000,
      actualFareMinor: 36000,
      collectedFareMinor: 36000,
      paymentStatus: "captured",
      tollMinor: 4000,
      tollSource: "driver_proof",
    });

    const accepted = await service.createMultiTaxiTripExportJobDurably(
      {
        scope: preview.scope,
        purpose: "交通局 R11 法定欄位稽核匯出",
        idempotencyKey: "agency-r11-statutory-csv-v1",
      },
      [row],
      {
        actorType: agencyExporterIdentity.actorType,
        actorId: agencyExporterIdentity.actorId,
        realm: agencyExporterIdentity.realm,
        scopes: agencyExporterIdentity.scopes,
        tenantId: null,
        agencyId: "agency-tpe",
      },
      "req-agency-export-002",
    );
    await flushBackgroundWork();

    const storedJob = state.reportJobs.find(
      (candidate) => candidate.jobId === accepted.jobId,
    );
    expect(storedJob?.status).toBe("completed");
    const csvContent = recordsToCsv(
      (storedJob?.rows ?? []) as unknown as Record<string, unknown>[],
    );
    expect(csvContent).toContain(
      '"recordId","orderId","tripId","orderNoMasked","plateNo","plateNoMasked","reservedAt","pickupAt","dropoffAt","routeSummary","routeSource","distanceMeters","durationSeconds","payableFareMinor","actualFareMinor","collectedFareMinor","paymentStatus","tollMinor","tollSource"',
    );
    expect(csvContent).toContain("BKR-2208");
    expect(csvContent).toContain("台北車站 → 松山機場");
    expect(csvContent).toContain("pickup_dropoff_summary");
    expect(csvContent).toContain("6800");
    expect(csvContent).toContain("36000");
    expect(csvContent).toContain("captured");
    expect(csvContent).toContain("4000");
    expect(csvContent).toContain("driver_proof");
  });
});
