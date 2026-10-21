import { afterEach, describe, expect, it, vi } from "vitest";
import { queueFixture } from "./reporting-queue-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("durable report claim connection loss", () => {
  it("contains an idle driver error, refuses stale completion, and recovers the first actual start", async () => {
    const f = queueFixture();
    let releaseBuilder!: () => void;
    const builderBarrier = new Promise<void>((resolve) => {
      releaseBuilder = resolve;
    });
    let builds = 0;
    f.service.registerDailyDispatchRecordProvider(async () => {
      builds++;
      await builderBarrier;
      return [];
    });
    const accepted = await f.service.createReportJobDurably({
      jobType: "daily_dispatch_record",
      format: "csv",
    });
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() => expect(builds).toBe(1));
      const firstStart = f.stored.get(accepted.jobId)!.startedAt;
      expect(firstStart).toEqual(expect.any(String));
      // The real pg Client emits this event when its socket dies between SQL
      // queries. Only SQL/socket/provider boundaries are controlled here.
      const client = f.claimClients[0]!;
      const lost = new Error("claim socket lost during builder");
      expect(() => client.emit("error", lost)).not.toThrow();
      // A dead PostgreSQL session releases ownership; the stale executor must
      // refuse every subsequent write even if the transport model returns rows.
      f.locks.delete(accepted.jobId);
      releaseBuilder();
      await f.service.onModuleDestroy();
      expect(f.repository.reportPersistenceFailure).toHaveBeenCalledWith(
        lost,
        "report_worker",
      );
      expect(f.stored.get(accepted.jobId)?.status).toBe("running");
      expect(f.service.getReportJob(accepted.jobId).status).toBe("running");
      expect(f.service.getReportJob(accepted.jobId).artifact).toBeNull();
      expect(f.writes.filter((job) => job.status !== "queued")).toHaveLength(1);
      expect(
        f.audit
          .listAuditLogs()
          .some(
            (row) =>
              row.resourceId === accepted.jobId &&
              ["complete_report_job", "fail_report_job"].includes(
                row.actionName,
              ),
          ),
      ).toBe(false);
      expect(f.releases).toHaveBeenCalled();
      f.service.onApplicationBootstrap();
      await vi.waitFor(() =>
        expect(f.stored.get(accepted.jobId)?.status).toBe("completed"),
      );
      expect(builds).toBe(2);
      expect(f.stored.get(accepted.jobId)?.startedAt).toBe(firstStart);
      expect(f.service.getReportJob(accepted.jobId).status).toBe("completed");
      expect(f.locks.size).toBe(0);
    } finally {
      releaseBuilder();
      await f.service.onModuleDestroy();
    }
  });

  it("does not invoke a builder after loss between the claim read and its continuation", async () => {
    const f = queueFixture();
    const accepted = await f.service.createReportJobDurably({
      jobType: "trip_summary",
      format: "csv",
    });
    const lost = new Error("claim socket lost before start");
    f.control.before = async (sql) => {
      if (sql.includes("SELECT record") && sql.includes("status IN"))
        f.claimClients[0]!.emit("error", lost);
    };
    const build = vi.fn();
    try {
      await expect(
        f.repository.withReportJobClaim(accepted.jobId, build),
      ).rejects.toThrow(lost);
      expect(build).not.toHaveBeenCalled();
      expect(f.stored.get(accepted.jobId)?.status).toBe("queued");
      expect(f.stored.get(accepted.jobId)).not.toHaveProperty("startedAt");
      expect(f.locks.size).toBe(0);
      expect(f.releases).toHaveBeenCalled();
    } finally {
      await f.service.onModuleDestroy();
    }
  });
});
