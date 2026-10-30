import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import type { DatabaseService } from "../../apps/api/src/common/db";
import type { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { DispatchDailyRecord } from "@drts/contracts";
import { ReportingFilingController } from "../../apps/api/src/modules/reporting-filing/reporting-filing.controller";
import {
  ReportingFilingRepository,
  type ReportJobWriter,
  type StoredReportJobRecord,
} from "../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";

// Constructor metadata only; every reporting service, controller, worker,
// policy, serializer and CSV renderer below is the real implementation.
vi.mock(
  "../../apps/api/src/modules/audit-notification/audit-notification.service",
  () => ({ AuditNotificationService: class AuditNotificationService {} }),
);
vi.mock("../../apps/api/src/common/db/database.service", () => ({
  DatabaseService: class DatabaseService {},
}));

const TENANT = "synthetic-report-tenant";
const OTHER_TENANT = "synthetic-other-tenant";
const OPS = {
  actorId: "synthetic-ops",
  actorType: "ops_user",
  realm: "ops",
  scopes: ["reports:read"],
} as BootstrapRequestIdentity;
const PLATFORM = {
  actorId: "synthetic-platform",
  actorType: "platform_admin",
  realm: "platform",
  scopes: ["reports:read", "multi_taxi_records:export"],
} as BootstrapRequestIdentity;

const DAILY_ROW: DispatchDailyRecord = {
  serviceDate: "2026-10-29",
  orderId: "synthetic-original-order",
  orderNo: "SYN-REPORT-01",
  orderSource: "tenant_portal",
  tenantId: TENANT,
  partnerId: null,
  serviceProductCode: "enterprise_dispatch",
  requestedAt: "2026-10-29T01:00:00.000Z",
  reservationTime: "2026-10-29T02:00:00.000Z",
  pickupAddressSnapshot: "合成上車點",
  dropoffAddressSnapshot: "合成下車點",
  firstDispatchAt: "2026-10-29T01:01:00.000Z",
  firstAssignedAt: "2026-10-29T01:02:00.000Z",
  finalDriverId: "synthetic-driver",
  finalVehicleId: "synthetic-vehicle",
  finalPlateNo: "SYN-01",
  etaSecondsAtAssignment: 300,
  arrivedPickupAt: "2026-10-29T02:00:00.000Z",
  tripStartedAt: "2026-10-29T02:01:00.000Z",
  tripCompletedAt: "2026-10-29T02:10:00.000Z",
  finalStatus: "completed",
  redispatchCount: 0,
  cancellationReason: null,
  complaintCount: 0,
  generatedAt: "2026-10-29T02:11:00.000Z",
};

const copy = <T>(value: T): T => structuredClone(value);
type Worker = {
  processNextDurableReport(): Promise<boolean>;
  scheduleReportJobCompletion(jobId: string, requestId?: string): void;
};
const worker = (service: ReportingFilingService) =>
  service as unknown as Worker;

/** Shared durable I/O, not a report builder or a simulated completion.
 * Only original enqueue/claim writer calls can create/change report rows.
 * No pool, HTTP server, Nest bootstrap, PG process or worker timer is started.
 */
function world(durable = true) {
  const rows = new Map<string, StoredReportJobRecord>();
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
    enqueueReportJobs: vi.fn(async (jobs: readonly StoredReportJobRecord[]) => {
      for (const job of jobs) rows.set(job.jobId, copy(job));
    }),
    enqueueMultiTaxiTripExportJob: vi.fn(async (job: StoredReportJobRecord) => {
      rows.set(job.jobId, copy(job));
      return { job: copy(job), idempotentReplay: false };
    }),
    listReportJobs: vi.fn(async () => [...rows.values()].map(copy)),
    loadReportJob: vi.fn(async (jobId: string) => {
      const row = rows.get(jobId);
      return row ? copy(row) : null;
    }),
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
  const provider = vi.fn(async () => [copy(DAILY_ROW)]);
  a.registerDailyDispatchRecordProvider(provider);
  const aController = new ReportingFilingController(a);
  const bController = new ReportingFilingController(b);
  return { a, b, aController, bController, store, rows, provider };
}

async function enqueue(w: ReturnType<typeof world>) {
  return w.a.createReportJobDurably(
    {
      jobType: "daily_dispatch_record",
      format: "csv",
      filters: { serviceDate: DAILY_ROW.serviceDate },
    },
    "synthetic-enqueue-request",
    TENANT,
  );
}

async function complete(w: ReturnType<typeof world>, jobId: string) {
  expect(await worker(w.a).processNextDurableReport()).toBe(true);
  expect(w.rows.get(jobId)).toMatchObject({ status: "completed" });
  expect(w.rows.get(jobId)?.rows).toEqual([DAILY_ROW]);
}

async function completedWorld() {
  const w = world();
  await w.a.onModuleInit();
  await w.b.onModuleInit();
  const accepted = await enqueue(w);
  await complete(w, accepted.jobId);
  // B never knew the key while it was runnable. Its real idle worker cannot
  // discover A's now-completed row through runnable-only recovery.
  expect(await worker(w.b).processNextDurableReport()).toBe(false);
  expect(w.b.listReportJobs(undefined, OPS)).toEqual([]);
  return { ...w, jobId: accepted.jobId };
}

async function bootedCompletedWorld() {
  const w = world();
  await w.a.onModuleInit();
  const accepted = await enqueue(w);
  await complete(w, accepted.jobId);
  // A legitimate completed boot snapshot establishes B's cache independently
  // of whether a subsequent HTTP read chooses to cache its own snapshot.
  await w.b.onModuleInit();
  return { ...w, jobId: accepted.jobId };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bytes(
  file: Awaited<
    ReturnType<ReportingFilingController["downloadReportArtifact"]>
  >,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function readRoutes(w: Awaited<ReturnType<typeof completedWorld>>) {
  return [
    () => w.bController.listReportJobs(OPS),
    () => w.bController.listTenantReportJobs(OPS, TENANT),
    () => w.bController.getReportJob(w.jobId, OPS),
    () => w.bController.getTenantReportJob(w.jobId, OPS, TENANT),
    () => w.bController.downloadReportArtifact(w.jobId, OPS),
    () => w.bController.downloadTenantReportArtifact(w.jobId, OPS, TENANT),
  ];
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

describe("committed generic report reads across API instances", () => {
  it("serves A's actual completed rows through all six B generic/tenant routes after an idle tick", async () => {
    const w = await completedWorld();
    const stored = copy(w.rows.get(w.jobId));
    const schedule = vi.spyOn(worker(w.b), "scheduleReportJobCompletion");
    const claims = w.store.withReportJobClaim.mock.calls.length;
    const enqueues = w.store.enqueueReportJobs.mock.calls.length;
    const first = await w.bController.listReportJobs(OPS);
    const tenant = await w.bController.listTenantReportJobs(OPS, TENANT);
    expect(first.data.items.map((job) => job.jobId)).toEqual([w.jobId]);
    expect(tenant.data.items.map((job) => job.jobId)).toEqual([w.jobId]);
    const detail = await w.bController.getReportJob(w.jobId, OPS);
    const tenantDetail = await w.bController.getTenantReportJob(
      w.jobId,
      OPS,
      TENANT,
    );
    expect(detail.data).toMatchObject({
      jobId: w.jobId,
      status: "completed",
      rows: [DAILY_ROW],
    });
    expect(tenantDetail.data.rows).toEqual(detail.data.rows);
    expect(tenantDetail.data.artifact?.manifestHash).toBe(
      stored?.artifact?.manifestHash,
    );
    const csv = await bytes(
      await w.bController.downloadReportArtifact(w.jobId, OPS),
    );
    const tenantCsv = await bytes(
      await w.bController.downloadTenantReportArtifact(w.jobId, OPS, TENANT),
    );
    const source = await w.a.renderReportArtifactForRead(
      w.jobId,
      undefined,
      OPS,
    );
    expect(csv).toEqual(source.buffer);
    expect(tenantCsv).toEqual(csv);
    expect(csv.toString("utf8")).toContain(DAILY_ROW.orderId);
    expect(csv.toString("utf8")).toContain(DAILY_ROW.pickupAddressSnapshot);
    expect(w.rows.get(w.jobId)).toEqual(stored);
    expect(w.provider).toHaveBeenCalledTimes(1);
    expect(w.store.withReportJobClaim).toHaveBeenCalledTimes(claims);
    expect(w.store.enqueueReportJobs).toHaveBeenCalledTimes(enqueues);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("reads fresh completion over a boot-time queued cache without letting list overwrite the cache", async () => {
    const w = world();
    await w.a.onModuleInit();
    const { jobId } = await enqueue(w);
    await w.b.onModuleInit();
    expect(w.b.getReportJob(jobId, undefined, OPS).status).toBe("queued");
    await complete(w, jobId);
    const list = await w.bController.listReportJobs(OPS);
    expect(list.data.items[0]?.status).toBe("completed");
    expect(w.b.getReportJob(jobId, undefined, OPS).status).toBe("queued");
    expect((await w.bController.getReportJob(jobId, OPS)).data.status).toBe(
      "completed",
    );
    expect(
      await bytes(await w.bController.downloadReportArtifact(jobId, OPS)),
    ).toEqual(
      (await w.a.renderReportArtifactForRead(jobId, undefined, OPS)).buffer,
    );
  });

  it("returns 503 for failed canonical reads on all six routes despite a valid local completed cache", async () => {
    const w = await bootedCompletedWorld();
    expect(w.b.getReportJob(w.jobId, undefined, OPS).status).toBe("completed");
    w.store.listReportJobs.mockRejectedValue(
      new Error("synthetic read failure"),
    );
    w.store.loadReportJob.mockRejectedValue(
      new Error("synthetic read failure"),
    );
    for (const read of readRoutes(w)) {
      const error = await read().then(
        () => undefined,
        (reason: unknown) => reason as { code: string; getStatus(): number },
      );
      expect(error?.code).toBe("REPORT_READ_FAILED");
      expect(error?.getStatus()).toBe(503);
    }
  });

  it("does not revive a missing canonical job from a previously loaded completed cache", async () => {
    const w = await bootedCompletedWorld();
    w.rows.delete(w.jobId); // Controlled storage absence, not a product delete.
    expect((await w.bController.listReportJobs(OPS)).data.items).toEqual([]);
    expect(
      (await w.bController.listTenantReportJobs(OPS, TENANT)).data.items,
    ).toEqual([]);
    for (const read of readRoutes(w).slice(2)) {
      await expect(read()).rejects.toMatchObject({
        code: "REPORT_JOB_NOT_FOUND",
      });
    }
    expect(w.b.getReportJob(w.jobId, undefined, OPS).status).toBe("completed");
  });

  it("keeps the original tenant filter and mismatch errors after canonical hydration", async () => {
    const w = await completedWorld();
    expect(
      (await w.bController.listTenantReportJobs(OPS, OTHER_TENANT)).data.items,
    ).toEqual([]);
    await expect(
      w.bController.getTenantReportJob(w.jobId, OPS, OTHER_TENANT),
    ).rejects.toMatchObject({ code: "REPORT_JOB_TENANT_SCOPE_FORBIDDEN" });
    await expect(
      w.bController.downloadTenantReportArtifact(w.jobId, OPS, OTHER_TENANT),
    ).rejects.toMatchObject({ code: "REPORT_JOB_TENANT_SCOPE_FORBIDDEN" });
    expect(
      (await w.bController.getTenantReportJob(w.jobId, OPS, TENANT)).data.jobId,
    ).toBe(w.jobId);
  });

  it("keeps the original evidence-access refusal for the wrong actor", async () => {
    const w = await completedWorld();
    const driver = {
      actorId: "synthetic-driver",
      actorType: "driver_user",
      realm: "driver",
      scopes: ["driver:read"],
    } as BootstrapRequestIdentity;
    for (const read of [
      () => w.bController.listReportJobs(driver),
      () => w.bController.getReportJob(w.jobId, driver),
      () => w.bController.downloadReportArtifact(w.jobId, driver),
    ]) {
      await expect(read()).rejects.toMatchObject({
        code: "EVIDENCE_ACCESS_FORBIDDEN",
      });
    }
  });

  it("hides an actual dedicated multi-taxi export from fresh generic list/detail/artifact reads", async () => {
    const w = world();
    await w.a.onModuleInit();
    await w.b.onModuleInit();
    const accepted = await w.a.createMultiTaxiTripExportJobDurably(
      {
        purpose: "合成單元測試專用匯出",
        scope: {},
        idempotencyKey: "synthetic-dedicated-export",
      },
      [],
      PLATFORM,
    );
    expect(await worker(w.a).processNextDurableReport()).toBe(true);
    expect(w.rows.get(accepted.jobId)?.status).toBe("completed");
    expect((await w.bController.listReportJobs(OPS)).data.items).toEqual([]);
    await expect(
      w.bController.getReportJob(accepted.jobId, OPS),
    ).rejects.toMatchObject({ code: "REPORT_JOB_NOT_FOUND" });
    await expect(
      w.bController.downloadReportArtifact(accepted.jobId, OPS),
    ).rejects.toMatchObject({ code: "REPORT_JOB_NOT_FOUND" });
  });

  it("retains the original non-durable sandbox producer and read contract without querying storage", async () => {
    const w = world(false);
    const accepted = await enqueue(w);
    await vi.waitFor(() =>
      expect(w.a.getReportJob(accepted.jobId, undefined, OPS).status).toBe(
        "completed",
      ),
    );
    const schedule = vi.spyOn(worker(w.a), "scheduleReportJobCompletion");
    expect(
      (await w.aController.listTenantReportJobs(OPS, TENANT)).data.items[0]
        ?.jobId,
    ).toBe(accepted.jobId);
    expect(
      (await w.aController.getReportJob(accepted.jobId, OPS)).data.rows,
    ).toEqual([DAILY_ROW]);
    expect(
      (
        await bytes(
          await w.aController.downloadReportArtifact(accepted.jobId, OPS),
        )
      ).toString("utf8"),
    ).toContain(DAILY_ROW.orderId);
    expect(w.store.listReportJobs).not.toHaveBeenCalled();
    expect(w.store.loadReportJob).not.toHaveBeenCalled();
    expect(w.store.withReportJobClaim).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("uses the real jobs-only repository read and maps committed records without reading filing packages", async () => {
    const w = await completedWorld();
    const committed = copy(w.rows.get(w.jobId)!);
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("FROM admin.phase1_report_jobs")
        ? [{ record: committed }]
        : [],
    }));
    const repository = new ReportingFilingRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);
    expect(await repository.listReportJobs()).toEqual([committed]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("FROM admin.phase1_report_jobs");
    expect(query.mock.calls[0]?.[0]).not.toMatch(
      /filing_packages|INSERT|UPDATE|DELETE/,
    );
  });

  it("does not publish a delayed HTTP running snapshot over its worker's newer completed cache", async () => {
    const w = world();
    await w.a.onModuleInit();
    const { jobId } = await enqueue(w);
    await w.b.onModuleInit();
    const builderStarted = deferred<void>();
    const finishBuilder = deferred<void>();
    const readCaptured = deferred<void>();
    const releaseRead = deferred<void>();
    const bProvider = vi.fn(async () => {
      builderStarted.resolve();
      await finishBuilder.promise;
      return [copy(DAILY_ROW)];
    });
    w.b.registerDailyDispatchRecordProvider(bProvider);
    const tick = worker(w.b).processNextDurableReport();
    await builderStarted.promise;
    expect(w.rows.get(jobId)?.status).toBe("running");
    w.store.loadReportJob.mockImplementationOnce(async (id) => {
      const snapshot = copy(w.rows.get(id)!);
      readCaptured.resolve();
      await releaseRead.promise;
      return snapshot;
    });
    const request = w.bController.getReportJob(jobId, OPS);
    await readCaptured.promise;
    finishBuilder.resolve();
    expect(await tick).toBe(true);
    expect(w.rows.get(jobId)?.status).toBe("completed");
    expect(w.b.getReportJob(jobId, undefined, OPS).status).toBe("completed");
    releaseRead.resolve();
    const response = await request;
    // A read may truthfully return its own earlier committed snapshot. It must
    // not regress the worker's separately published completed cache or row.
    expect(response.data.status).toBe("running");
    expect(w.b.getReportJob(jobId, undefined, OPS).status).toBe("completed");
    expect(w.rows.get(jobId)?.status).toBe("completed");
    expect(bProvider).toHaveBeenCalledTimes(1);
  });
});
