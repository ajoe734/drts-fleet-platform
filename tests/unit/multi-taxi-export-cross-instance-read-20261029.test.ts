import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgencyAccessLogRecord,
  MultiTaxiTripOperationalExportRow,
} from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import type { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  AgencyAccessAuditService,
  type AgencyAccessSubject,
} from "../../apps/api/src/modules/agency-access/agency-access-audit.service";
import type {
  AgencyAccessLogInput,
  AgencyAccessLogRepository,
} from "../../apps/api/src/modules/agency-access/agency-access-log.repository";
import { AgencyPortalService } from "../../apps/api/src/modules/agency-access/agency-portal.service";
import { MultiTaxiController } from "../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import {
  type ReportingFilingRepository,
  type ReportJobWriter,
  type StoredReportJobRecord,
} from "../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";

// External runtime metadata only. Services, producer, worker, controller,
// access policy, download metadata and agency audit execution remain real.
vi.mock(
  "../../apps/api/src/modules/audit-notification/audit-notification.service",
  () => ({ AuditNotificationService: class AuditNotificationService {} }),
);
vi.mock("../../apps/api/src/common/db/database.service", () => ({
  DatabaseService: class DatabaseService {},
}));

const AGENCY: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "agency_user",
  actorId: "synthetic-agency-exporter",
  principalId: "synthetic-agency-exporter",
  membershipId: "synthetic-agency-membership",
  sessionId: "synthetic-agency-session",
  realm: "agency",
  tenantId: null,
  agencyId: "synthetic-agency",
  roleFamilies: ["agency"],
  roles: ["agency_exporter"],
  scopes: ["agency:trip_records:read", "agency:trip_records:export"],
  requestId: null,
};
const PLATFORM: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "platform_admin",
  actorId: "synthetic-platform-exporter",
  realm: "platform",
  tenantId: null,
  roleFamilies: ["platform"],
  roles: ["platform_admin"],
  scopes: ["reports:read", "multi_taxi_records:export"],
  requestId: null,
};
const META = { requestId: "synthetic-export-read-request" };
const ROW: MultiTaxiTripOperationalExportRow = {
  orderNoMasked: "SYN...01",
  plateNoMasked: "SYN...02",
  reservedAt: "2026-10-01T01:00:00.000Z",
  pickupAt: null,
  dropoffAt: null,
  payableFareMinor: 320,
  actualFareMinor: 320,
  tollMinor: 0,
  currency: "TWD",
  farePolicyVersion: "synthetic-fare-v3",
  chargingMode: "meter",
  generatedAt: "2026-10-01T01:30:00.000Z",
  retainUntil: "2028-09-30T01:30:00.000Z",
};
const copy = <T>(value: T): T => structuredClone(value);
type Worker = {
  processNextDurableReport(): Promise<boolean>;
  scheduleReportJobCompletion(jobId: string, requestId?: string): void;
};
const worker = (service: ReportingFilingService) =>
  service as unknown as Worker;

/** Shared storage I/O only: actual enqueue and claim writers create/change
 * every row. No fake completed rows, server, pool, PG or worker timer.
 */
function world(durable = true) {
  const rows = new Map<string, StoredReportJobRecord>();
  let beforeWrite: ReportJobWriter | undefined;
  const audit = {
    recordAuditLog: vi.fn(),
    getEvidenceSubjectGovernance: vi.fn(() => null),
  };
  const store = {
    isEnabled: () => durable,
    loadState: vi.fn(async () => ({
      reportJobs: [...rows.values()].map(copy),
      filingPackages: [],
    })),
    enqueueMultiTaxiTripExportJob: vi.fn(async (job: StoredReportJobRecord) => {
      rows.set(job.jobId, copy(job));
      return { job: copy(job), idempotentReplay: false };
    }),
    loadReportJob: vi.fn(async (jobId: string) => {
      const row = rows.get(jobId);
      return row ? copy(row) : null;
    }),
    listReportJobs: vi.fn(async () => [...rows.values()].map(copy)),
    loadReportJobs: vi.fn(async (jobIds: string[]) =>
      jobIds.flatMap((jobId) => {
        const row = rows.get(jobId);
        return row ? [copy(row)] : [];
      }),
    ),
    listRunnableReportJobIds: vi.fn(async () =>
      [...rows.values()]
        .filter((job) => ["pending", "queued", "running"].includes(job.status))
        .map((job) => job.jobId),
    ),
    withReportJobClaim: vi.fn(
      async (
        jobId: string,
        run: (
          job: StoredReportJobRecord,
          write: ReportJobWriter,
        ) => Promise<void>,
      ) => {
        const row = rows.get(jobId);
        if (!row || !["pending", "queued", "running"].includes(row.status)) {
          return false;
        }
        await run(copy(row), async (next) => {
          await beforeWrite?.(copy(next));
          rows.set(jobId, copy(next));
        });
        return true;
      },
    ),
    persistChanges: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };
  const repository = store as unknown as ReportingFilingRepository;
  const a = new ReportingFilingService(
    audit as unknown as AuditNotificationService,
    repository,
  );
  const b = new ReportingFilingService(
    audit as unknown as AuditNotificationService,
    repository,
  );
  const accessLogs: AgencyAccessLogRecord[] = [];
  const auditStore = {
    isEnabled: () => true,
    append: vi.fn(async (entry: AgencyAccessLogInput) => {
      const record: AgencyAccessLogRecord = {
        ...copy(entry),
        accessId: `synthetic-access-${accessLogs.length + 1}`,
        occurredAt: "2026-10-29T01:00:00.000Z",
      };
      accessLogs.push(record);
      return record;
    }),
  };
  const accessAudit = new AgencyAccessAuditService(
    auditStore as unknown as AgencyAccessLogRepository,
  );
  const directory = {
    resolveActiveAccess: vi.fn(async (subject: AgencyAccessSubject) => ({
      agency: { agencyId: subject.agencyId },
      roleCode: "agency_exporter",
    })),
  };
  const portal = new AgencyPortalService(
    accessAudit,
    directory as never,
    {} as never,
    b,
    {} as never,
    {} as never,
  );
  const platform = new MultiTaxiController({} as never, b);
  return {
    a,
    b,
    store,
    rows,
    auditStore,
    accessLogs,
    directory,
    portal,
    platform,
    beforeWrite: (callback: ReportJobWriter) => {
      beforeWrite = callback;
    },
  };
}

async function enqueue(
  w: ReturnType<typeof world>,
  identity = AGENCY,
  key = "synthetic-export-key",
) {
  return w.a.createMultiTaxiTripExportJobDurably(
    {
      scope: { reservedFrom: "2026-10-01", reservedTo: "2026-10-31" },
      purpose: "Synthetic original R11 export",
      idempotencyKey: key,
    },
    [copy(ROW)],
    identity,
    "synthetic-enqueue-request",
  );
}

async function complete(w: ReturnType<typeof world>, jobId: string) {
  expect(await worker(w.a).processNextDurableReport()).toBe(true);
  expect(w.rows.get(jobId)).toMatchObject({ status: "completed", rows: [ROW] });
  expect(w.rows.get(jobId)?.artifact?.manifestHash).toMatch(/^[a-f0-9]{64}$/);
}

async function completedWorld(bootBFirst = true) {
  const w = world();
  await w.a.onModuleInit();
  if (bootBFirst) await w.b.onModuleInit();
  const accepted = await enqueue(w);
  await complete(w, accepted.jobId);
  if (!bootBFirst) await w.b.onModuleInit();
  if (bootBFirst) {
    expect(await worker(w.b).processNextDurableReport()).toBe(false);
    expect(() =>
      w.b.getMultiTaxiTripExportJob(accepted.jobId, AGENCY),
    ).toThrow();
  }
  return { ...w, jobId: accepted.jobId };
}

function routes(w: Awaited<ReturnType<typeof completedWorld>>) {
  return [
    () => w.portal.getTripExportJob(AGENCY, w.jobId, META),
    () => w.portal.issueTripExportDownload(AGENCY, w.jobId, META),
    () =>
      w.platform.getTripOperationalExportJob(w.jobId, PLATFORM, META.requestId),
    () =>
      w.platform.downloadTripOperationalExport(
        w.jobId,
        PLATFORM,
        META.requestId,
      ),
  ];
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubEnv(
    "CONTROLLED_DOWNLOAD_SIGNING_SECRET",
    "synthetic-unit-signing-key",
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("committed dedicated multi-taxi export reads across API instances", () => {
  it("serves one normally completed job through all four B entrypoints after its idle worker missed the key", async () => {
    const w = await completedWorld();
    const stored = copy(w.rows.get(w.jobId));
    const claims = w.store.withReportJobClaim.mock.calls.length;
    const enqueues = w.store.enqueueMultiTaxiTripExportJob.mock.calls.length;
    const schedule = vi.spyOn(worker(w.b), "scheduleReportJobCompletion");
    const agencyView = await w.portal.getTripExportJob(AGENCY, w.jobId, META);
    const agencyDownload = await w.portal.issueTripExportDownload(
      AGENCY,
      w.jobId,
      META,
    );
    const platformView = await w.platform.getTripOperationalExportJob(
      w.jobId,
      PLATFORM,
      META.requestId,
    );
    const platformDownload = await w.platform.downloadTripOperationalExport(
      w.jobId,
      PLATFORM,
      META.requestId,
    );
    expect(agencyView).toMatchObject({
      jobId: w.jobId,
      status: "completed",
      recordCount: 1,
      downloadAvailable: true,
    });
    expect(platformView.data).toEqual(agencyView);
    for (const download of [agencyDownload, platformDownload.data]) {
      expect(download).toMatchObject({
        jobId: w.jobId,
        recordCount: 1,
        manifestHash: stored?.artifact?.manifestHash,
      });
      const url = new URL(
        download.download.downloadUrl,
        "https://synthetic.invalid",
      );
      expect(url.searchParams.get("sig")).toBe(download.download.signature);
      expect(url.searchParams.get("manifest_hash")).toBe(download.manifestHash);
      expect(Date.parse(download.download.expiresAt)).not.toBeNaN();
    }
    expect(w.accessLogs).toMatchObject([
      {
        action: "export_status",
        outcome: "success",
        rowCount: 0,
        totalCount: 1,
        resourceId: w.jobId,
      },
      {
        action: "export_download",
        outcome: "success",
        rowCount: 1,
        totalCount: 1,
        resourceId: w.jobId,
        exportManifestHash: stored?.artifact?.manifestHash,
      },
    ]);
    expect(w.store.withReportJobClaim).toHaveBeenCalledTimes(claims);
    expect(w.store.enqueueMultiTaxiTripExportJob).toHaveBeenCalledTimes(
      enqueues,
    );
    expect(schedule).not.toHaveBeenCalled();
    expect(w.rows.get(w.jobId)).toEqual(stored);
  });

  it("awaits the canonical download and the real agency audit append before returning metadata", async () => {
    const w = await completedWorld();
    const committed = copy(w.rows.get(w.jobId)!);
    const readEntered = deferred<void>();
    const releaseRead = deferred<void>();
    const appendEntered = deferred<void>();
    const releaseAppend = deferred<void>();
    w.store.loadReportJob.mockImplementationOnce(async () => {
      readEntered.resolve();
      await releaseRead.promise;
      return committed;
    });
    const originalAppend = w.auditStore.append.getMockImplementation()!;
    w.auditStore.append.mockImplementationOnce(async (entry) => {
      appendEntered.resolve();
      await releaseAppend.promise;
      return originalAppend(entry);
    });
    let returned = false;
    const pending = w.portal
      .issueTripExportDownload(AGENCY, w.jobId, META)
      .then((result) => {
        returned = true;
        return result;
      });
    await readEntered.promise;
    expect(returned).toBe(false);
    expect(w.auditStore.append).not.toHaveBeenCalled();
    releaseRead.resolve();
    await appendEntered.promise;
    expect(returned).toBe(false);
    expect(w.auditStore.append).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: AGENCY.agencyId,
        principalId: AGENCY.principalId,
        membershipId: AGENCY.membershipId,
        sessionId: AGENCY.sessionId,
        action: "export_download",
        outcome: "success",
        rowCount: 1,
        totalCount: 1,
        exportManifestHash: committed.artifact?.manifestHash,
        requestId: META.requestId,
      }),
    );
    releaseAppend.resolve();
    expect((await pending).manifestHash).toBe(committed.artifact?.manifestHash);
    expect(returned).toBe(true);
    expect(w.directory.resolveActiveAccess).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: AGENCY.principalId }),
    );
  });

  it("reads completed storage without replacing B's legitimate queued boot snapshot", async () => {
    const w = world();
    await w.a.onModuleInit();
    const { jobId } = await enqueue(w);
    await w.b.onModuleInit();
    expect(w.b.getMultiTaxiTripExportJob(jobId, AGENCY).status).toBe("pending");
    await complete(w, jobId);
    expect((await w.portal.getTripExportJob(AGENCY, jobId, META)).status).toBe(
      "completed",
    );
    expect(
      (await w.platform.downloadTripOperationalExport(jobId, PLATFORM)).data
        .manifestHash,
    ).toBe(w.rows.get(jobId)?.artifact?.manifestHash);
    expect(w.b.getMultiTaxiTripExportJob(jobId, AGENCY).status).toBe("pending");
  });

  it("returns 503 on all four failed canonical reads even with a valid completed local snapshot", async () => {
    const w = await completedWorld(false);
    expect(w.b.getMultiTaxiTripExportJob(w.jobId, AGENCY).status).toBe(
      "completed",
    );
    w.store.loadReportJob.mockRejectedValue(
      new Error("synthetic storage read failure"),
    );
    for (const read of routes(w)) {
      await expect(read()).rejects.toMatchObject({
        code: "REPORT_READ_FAILED",
        status: 503,
      });
    }
    expect(w.accessLogs).toMatchObject([
      {
        action: "export_status",
        outcome: "error",
        reasonCode: "REPORT_READ_FAILED",
      },
      {
        action: "export_download",
        outcome: "error",
        reasonCode: "REPORT_READ_FAILED",
      },
    ]);
  });

  it("does not revive a canonically missing row from a completed cache at any of the four entrypoints", async () => {
    const w = await completedWorld(false);
    w.rows.delete(w.jobId); // Controlled storage absence, not a product delete.
    for (const read of routes(w)) {
      await expect(read()).rejects.toMatchObject({
        code: "REPORT_JOB_NOT_FOUND",
        status: 404,
      });
    }
    expect(w.b.getMultiTaxiTripExportJob(w.jobId, AGENCY).status).toBe(
      "completed",
    );
    expect(w.accessLogs.every((entry) => entry.outcome === "denied")).toBe(
      true,
    );
  });

  it("preserves agency actor ownership and original platform visibility, without widening export scopes", async () => {
    const w = await completedWorld();
    for (const identity of [
      {
        ...AGENCY,
        actorId: "synthetic-colleague",
        principalId: "synthetic-colleague",
      },
      { ...AGENCY, agencyId: "synthetic-other-agency" },
    ]) {
      for (const read of [
        () => w.portal.getTripExportJob(identity, w.jobId, META),
        () => w.portal.issueTripExportDownload(identity, w.jobId, META),
      ]) {
        await expect(read()).rejects.toMatchObject({
          code: "MULTI_TAXI_EXPORT_JOB_NOT_FOUND",
          status: 404,
        });
      }
    }
    const viewer = { ...AGENCY, scopes: ["agency:trip_records:read"] };
    await expect(
      w.portal.getTripExportJob(viewer, w.jobId, META),
    ).rejects.toMatchObject({
      code: "MULTI_TAXI_EXPORT_FORBIDDEN",
      status: 403,
    });
    const platformJob = await enqueue(
      w,
      PLATFORM,
      "synthetic-platform-export-key",
    );
    await complete(w, platformJob.jobId);
    expect(
      (
        await w.platform.getTripOperationalExportJob(
          platformJob.jobId,
          PLATFORM,
        )
      ).data.status,
    ).toBe("completed");
    expect(
      (await w.platform.getTripOperationalExportJob(w.jobId, PLATFORM)).data
        .status,
    ).toBe("completed");
    await expect(
      w.portal.getTripExportJob(AGENCY, platformJob.jobId, META),
    ).rejects.toMatchObject({ code: "MULTI_TAXI_EXPORT_JOB_NOT_FOUND" });
    const noExport = { ...PLATFORM, scopes: ["reports:read"] };
    await expect(
      w.platform.downloadTripOperationalExport(w.jobId, noExport),
    ).rejects.toMatchObject({
      code: "MULTI_TAXI_EXPORT_FORBIDDEN",
      status: 403,
    });
  });

  it("keeps dedicated exports absent from generic list/detail/artifact reads", async () => {
    const w = await completedWorld();
    expect(await w.b.listReportJobsForRead(undefined, PLATFORM)).toEqual([]);
    await expect(
      w.b.getReportJobForRead(w.jobId, undefined, PLATFORM),
    ).rejects.toMatchObject({ code: "REPORT_JOB_NOT_FOUND" });
    await expect(
      w.b.renderReportArtifactForRead(w.jobId, undefined, PLATFORM),
    ).rejects.toMatchObject({ code: "REPORT_JOB_NOT_FOUND" });
    expect(
      (await w.b.getMultiTaxiTripExportJobForRead(w.jobId, AGENCY)).status,
    ).toBe("completed");
  });

  it("retains non-durable sandbox local completion without attempting canonical database reads", async () => {
    const w = world(false);
    await w.a.onModuleInit();
    const { jobId } = await enqueue(w);
    await vi.waitFor(() =>
      expect(w.a.getMultiTaxiTripExportJob(jobId, AGENCY).status).toBe(
        "completed",
      ),
    );
    expect(
      (await w.a.getMultiTaxiTripExportJobForRead(jobId, AGENCY)).status,
    ).toBe("completed");
    expect(
      (await w.a.issueMultiTaxiTripExportDownloadForRead(jobId, AGENCY))
        .recordCount,
    ).toBe(1);
    expect(w.store.loadReportJob).not.toHaveBeenCalled();
    expect(w.store.enqueueMultiTaxiTripExportJob).not.toHaveBeenCalled();
    expect(w.store.withReportJobClaim).not.toHaveBeenCalled();
  });

  it("projects its delayed committed read without downgrading the same instance's normally completed worker cache", async () => {
    const w = world();
    await w.a.onModuleInit();
    const { jobId } = await enqueue(w);
    await w.b.onModuleInit();
    const completeEntered = deferred<void>();
    const releaseComplete = deferred<void>();
    w.beforeWrite(async (next) => {
      if (next.status === "completed") {
        completeEntered.resolve();
        await releaseComplete.promise;
      }
    });
    const processing = worker(w.b).processNextDurableReport();
    await completeEntered.promise;
    expect(w.b.getMultiTaxiTripExportJob(jobId, AGENCY).status).toBe("running");
    const captured = deferred<void>();
    const releaseRead = deferred<void>();
    w.store.loadReportJob.mockImplementationOnce(async (id) => {
      const snapshot = copy(w.rows.get(id)!);
      expect(snapshot.status).toBe("running");
      captured.resolve();
      await releaseRead.promise;
      return snapshot;
    });
    const pending = w.portal.getTripExportJob(AGENCY, jobId, META);
    await captured.promise;
    releaseComplete.resolve();
    expect(await processing).toBe(true);
    expect(w.b.getMultiTaxiTripExportJob(jobId, AGENCY).status).toBe(
      "completed",
    );
    releaseRead.resolve();
    expect((await pending).status).toBe("running");
    expect(w.b.getMultiTaxiTripExportJob(jobId, AGENCY).status).toBe(
      "completed",
    );
    expect((await w.portal.getTripExportJob(AGENCY, jobId, META)).status).toBe(
      "completed",
    );
    expect(w.rows.get(jobId)).toMatchObject({
      status: "completed",
      rows: [ROW],
    });
  });

  it("retains the existing agency no-data-return contract when its access-log write fails", async () => {
    const w = await completedWorld();
    w.auditStore.append.mockRejectedValue(
      new Error("synthetic audit storage failure"),
    );
    await expect(
      w.portal.issueTripExportDownload(AGENCY, w.jobId, META),
    ).rejects.toMatchObject({
      code: "AGENCY_ACCESS_AUDIT_UNAVAILABLE",
      status: 503,
    });
    expect(w.accessLogs).toEqual([]);
    expect(w.rows.get(w.jobId)?.status).toBe("completed");
    expect(
      (await w.platform.downloadTripOperationalExport(w.jobId, PLATFORM)).data
        .recordCount,
    ).toBe(1);
  });
});
