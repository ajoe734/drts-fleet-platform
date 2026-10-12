import { describe, expect, it, vi } from "vitest";
import { ReportingFilingController } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.controller";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { ReportingFilingRepository } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { IdempotencyService } from "../../../../apps/api/src/common/idempotency/idempotency.service";
import { IdempotencyRepository } from "../../../../apps/api/src/common/idempotency/idempotency.repository";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { DatabaseService } from "../../../../apps/api/src/common/db";
import { queueFixture } from "./reporting-queue-fixture";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("report durable HTTP acknowledgement", () => {
  it("does not return accepted201 until the actual repository queue write commits", async () => {
    const barrier = deferred();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO")) await barrier.promise;
      return { rows: [] };
    });
    const repository = new ReportingFilingRepository({
      isEnabled: () => true,
      query,
      connect: async () => ({ query, release: vi.fn() }),
    } as unknown as DatabaseService);
    const service = new ReportingFilingService(
      new AuditNotificationService(),
      repository,
    );
    const controller = new ReportingFilingController(
      service,
      new IdempotencyService(new IdempotencyRepository()),
    );
    let returned = false;
    const response = controller
      .createReportJob(
        { jobType: "trip_summary", format: "csv" },
        null,
        "capacity-durable-ack",
      )
      .then((value) => {
        returned = true;
        return value;
      });
    await vi.waitFor(() =>
      expect(
        query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
      ).toBe(true),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(returned).toBe(false);
    } finally {
      barrier.resolve();
      await response;
    }
  });
});

describe("actual bounded durable reporting worker", () => {
  it("rolls back an entire initial backlog and rejects cross-tenant commands before enqueue", async () => {
    const f = queueFixture();
    let inserts = 0;
    f.control.before = async (sql) => {
      if (sql.includes("INSERT INTO") && ++inserts === 20)
        throw new Error("batch insert20 failed");
    };
    await expect(
      f.service.createReportJobsDurably(
        Array.from({ length: 50 }, () => ({
          jobType: "trip_summary",
          format: "csv",
        })),
      ),
    ).rejects.toThrow("batch insert20 failed");
    expect(f.stored.size).toBe(0);
    expect(f.service.listReportJobs()).toHaveLength(0);
    await expect(
      f.service.createReportJobDurably(
        {
          jobType: "trip_summary",
          format: "csv",
          filters: { tenantId: "tenant-b" },
        },
        undefined,
        "tenant-a",
      ),
    ).rejects.toMatchObject({ code: "REPORT_TENANT_SCOPE_MISMATCH" });
    expect(inserts).toBe(20);
    await f.service.onModuleDestroy();
  });

  it("refuses configured startup when persisted state cannot be read", async () => {
    const f = queueFixture();
    f.control.before = async (sql) => {
      if (sql.includes("SELECT record")) throw new Error("queue load failed");
    };
    await expect(f.service.onModuleInit()).rejects.toThrow("queue load failed");
    expect(f.repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "module init",
    );
    await f.service.onModuleDestroy();
  });

  it("keeps last committed running truth when completion and failure writes both fail, then recovers first start", async () => {
    const f = queueFixture();
    f.control.before = async (sql, params) => {
      if (sql.includes("UPDATE") && params[1] !== "running")
        throw new Error("terminal storage unavailable");
    };
    const accepted = await f.service.createReportJobDurably({
      jobType: "trip_summary",
      format: "csv",
    });
    f.service.onApplicationBootstrap();
    await vi.waitFor(() =>
      expect(f.repository.reportPersistenceFailure).toHaveBeenCalled(),
    );
    expect(f.stored.get(accepted.jobId)?.status).toBe("running");
    expect(f.service.getReportJob(accepted.jobId).status).toBe("running");
    expect(f.service.getReportJob(accepted.jobId).artifact).toBeNull();
    const firstStart = f.stored.get(accepted.jobId)!.startedAt;
    expect(f.releases).toHaveBeenCalledWith(true);
    await f.service.onModuleDestroy();
    f.control.before = undefined;
    await f.service.onModuleInit();
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() =>
        expect(f.stored.get(accepted.jobId)?.status).toBe("completed"),
      );
      expect(f.stored.get(accepted.jobId)?.startedAt).toBe(firstStart);
      expect(f.locks.size).toBe(0);
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("does not overwrite an externally cancelled job during a claimed build", async () => {
    const f = queueFixture();
    const provider = deferred();
    f.service.registerDailyDispatchRecordProvider(async () => {
      await provider.promise;
      return [];
    });
    const accepted = await f.service.createReportJobDurably({
      jobType: "daily_dispatch_record",
      format: "csv",
    });
    f.service.onApplicationBootstrap();
    await vi.waitFor(() =>
      expect(f.stored.get(accepted.jobId)?.status).toBe("running"),
    );
    f.stored.get(accepted.jobId)!.status = "cancelled";
    provider.resolve();
    try {
      await vi.waitFor(() =>
        expect(f.repository.reportPersistenceFailure).toHaveBeenCalled(),
      );
      expect(f.stored.get(accepted.jobId)?.status).toBe("cancelled");
      expect(f.service.getReportJob(accepted.jobId).status).toBe("cancelled");
      expect(f.writes.some((job) => job.status === "completed")).toBe(false);
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it.each(["platform", "tenant"])(
    "rejects %s enqueue failure without caching accepted or starting a job",
    async (realm) => {
      const f = queueFixture();
      f.control.before = async (sql) => {
        if (sql.includes("INSERT INTO"))
          throw new Error("queue storage unavailable");
      };
      const idempotency = new IdempotencyService(new IdempotencyRepository());
      const controller = new ReportingFilingController(f.service, idempotency);
      const command = { jobType: "trip_summary", format: "csv" } as const;
      const call = () =>
        realm === "tenant"
          ? controller.createTenantReportJob(
              command,
              null,
              "tenant-a",
              "enqueue-failure",
            )
          : controller.createReportJob(command, null, "enqueue-failure");
      await expect(call()).rejects.toThrow("queue storage unavailable");
      expect(f.stored.size).toBe(0);
      expect(f.service.listReportJobs()).toHaveLength(0);
      expect(f.locks.size).toBe(0);
      f.control.before = undefined;
      const response = await call();
      expect(response.data).toMatchObject({ status: "queued" });
      expect(f.stored.size).toBe(1);
      if (realm === "tenant")
        expect([...f.stored.values()][0]!.filters).toMatchObject({
          tenantId: "tenant-a",
        });
      const replay = await call();
      expect(replay.data).toEqual(response.data);
      expect(f.stored.size).toBe(1);
      await f.service.onModuleDestroy();
    },
  );

  it("processes a real50-job producer backlog using trip_summary without worker/clock padding", async () => {
    const f = queueFixture();
    await f.service.onModuleInit();
    const accepted = await f.service.createReportJobsDurably(
      Array.from({ length: 50 }, () => ({
        jobType: "trip_summary",
        format: "csv",
        filters: { capacityRunTag: "run-50" },
      })),
    );
    expect(new Set(accepted.map((job) => job.jobId)).size).toBe(50);
    expect(
      [...f.stored.values()].every(
        (job) => job.status === "queued" && !job.startedAt,
      ),
    ).toBe(true);
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() =>
        expect(
          [...f.stored.values()].filter((job) => job.status === "completed"),
        ).toHaveLength(50),
      );
      expect(f.writes.filter((job) => job.status === "running")).toHaveLength(
        50,
      );
      expect(
        [...f.stored.values()].every(
          (job) => !!job.startedAt && !!job.artifact,
        ),
      ).toBe(true);
      expect(f.locks.size).toBe(0);
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("bounds builders, rejects duplicate live recovery, and drains the claimed job on shutdown", async () => {
    const f = queueFixture();
    const provider = deferred();
    let active = 0;
    let peak = 0;
    let builds = 0;
    f.service.registerDailyDispatchRecordProvider(async () => {
      builds++;
      peak = Math.max(peak, ++active);
      await provider.promise;
      active--;
      return [];
    });
    const jobs = await f.service.createReportJobsDurably(
      Array.from({ length: 2 }, () => ({
        jobType: "daily_dispatch_record",
        format: "csv",
      })),
    );
    f.service.onApplicationBootstrap();
    await vi.waitFor(() => expect(builds).toBe(1));
    const running = [...f.stored.values()].find(
      (job) => job.status === "running",
    )!;
    const competing = new ReportingFilingRepository(
      f.database as unknown as DatabaseService,
    );
    const duplicate = vi.fn();
    expect(await competing.withReportJobClaim(running.jobId, duplicate)).toBe(
      false,
    );
    expect(duplicate).not.toHaveBeenCalled();
    let stopped = false;
    const stop = f.service.onModuleDestroy().then(() => {
      stopped = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    await expect(
      f.service.createReportJobDurably({
        jobType: "trip_summary",
        format: "csv",
      }),
    ).rejects.toThrow("stopping");
    provider.resolve();
    await stop;
    expect(peak).toBe(1);
    expect(builds).toBe(1);
    expect(jobs.map((job) => f.stored.get(job.jobId)!.status).sort()).toEqual([
      "completed",
      "queued",
    ]);
    expect(f.locks.size).toBe(0);
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() => expect(builds).toBe(2));
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("keeps completion uncommitted until storage succeeds and records builder failures truthfully", async () => {
    const f = queueFixture();
    const barrier = deferred();
    f.control.before = async (sql, params) => {
      if (sql.includes("UPDATE") && params[1] === "completed")
        await barrier.promise;
    };
    const job = await f.service.createReportJobDurably({
      jobType: "trip_summary",
      format: "csv",
    });
    f.service.onApplicationBootstrap();
    await vi.waitFor(() =>
      expect(f.stored.get(job.jobId)?.status).toBe("running"),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(f.service.getReportJob(job.jobId).status).toBe("running");
    expect(f.service.getReportJob(job.jobId).artifact).toBeNull();
    barrier.resolve();
    await vi.waitFor(() =>
      expect(f.stored.get(job.jobId)?.status).toBe("completed"),
    );
    f.service.registerDailyDispatchRecordProvider(async () => {
      throw new Error("source query failed");
    });
    const failed = await f.service.createReportJobDurably({
      jobType: "daily_dispatch_record",
      format: "csv",
    });
    try {
      await vi.waitFor(() =>
        expect(f.stored.get(failed.jobId)?.status).toBe("failed"),
      );
      expect(f.stored.get(failed.jobId)?.artifact).toBeNull();
      expect(
        f.audit
          .listAuditLogs()
          .find(
            (row) =>
              row.resourceId === failed.jobId &&
              row.actionName === "fail_report_job",
          )?.newValuesSummary,
      ).toMatchObject({ error: "source query failed" });
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("preserves queued/unknown first-start after a failed claim write and recovers on the real worker", async () => {
    const f = queueFixture();
    f.control.before = async (sql) => {
      if (sql.includes("UPDATE")) throw new Error("state write unavailable");
    };
    const job = await f.service.createReportJobDurably({
      jobType: "trip_summary",
      format: "csv",
    });
    f.service.onApplicationBootstrap();
    await vi.waitFor(() =>
      expect(f.repository.reportPersistenceFailure).toHaveBeenCalled(),
    );
    expect(f.stored.get(job.jobId)?.status).toBe("queued");
    expect(f.stored.get(job.jobId)).not.toHaveProperty("startedAt");
    expect(f.service.getReportJob(job.jobId).status).toBe("queued");
    await f.service.onModuleDestroy();
    f.control.before = undefined;
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() =>
        expect(f.stored.get(job.jobId)?.status).toBe("completed"),
      );
    } finally {
      await f.service.onModuleDestroy();
    }
  });
});
