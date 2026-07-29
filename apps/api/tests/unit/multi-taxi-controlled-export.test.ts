import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MultiTaxiTripOperationalExportRow,
  ReportJobRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";
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
    orderNoMasked: "MTX...01",
    plateNoMasked: "TA...01",
    reservedAt: "2026-07-23T01:00:00.000Z",
    pickupAt: "2026-07-23T01:10:00.000Z",
    dropoffAt: "2026-07-23T01:30:00.000Z",
    payableFareMinor: 35000,
    actualFareMinor: 35000,
    tollMinor: 0,
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
});
