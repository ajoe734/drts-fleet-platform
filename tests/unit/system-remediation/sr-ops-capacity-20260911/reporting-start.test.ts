import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredReportJobRecord } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { queueFixture } from "./reporting-queue-fixture";

// External database/session and Date boundaries only. Actual repository load,
// producer, claim, builders, publication and lifecycle hooks run unchanged.
const legacyJob = (
  jobId: string,
  status: StoredReportJobRecord["status"],
): StoredReportJobRecord => ({
  jobId,
  jobType: "trip_summary",
  format: "csv",
  status,
  filters: {},
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:05.000Z",
  artifact: null,
  rows: [],
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("reporting first actual start and rehydration", () => {
  it("retains the original two budgeted30-job cohorts without claiming they establish50 backlog", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const f = queueFixture();
    f.service.onApplicationBootstrap();
    try {
      for (let minute = 0; minute < 2; minute++) {
        vi.setSystemTime(
          Date.parse("2026-10-12T00:00:00.000Z") + minute * 60000,
        );
        await f.service.createReportJobsDurably(
          Array.from({ length: 30 }, () => ({
            jobType: "trip_summary",
            format: "csv",
          })),
        );
        expect(
          [...f.stored.values()].filter(
            (job) => job.status === "queued" || job.status === "running",
          ),
        ).toHaveLength(30);
        await vi.waitFor(() =>
          expect(
            [...f.stored.values()].every((job) => job.status === "completed"),
          ).toBe(true),
        );
      }
      expect(f.stored.size).toBe(60);
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("actual load/init/recovery retain first start and completed legacy absence", async () => {
    const oldStart = "2026-10-12T00:00:01.000Z";
    const f = queueFixture([
      { ...legacyJob("recover-1", "queued"), startedAt: oldStart },
      legacyJob("legacy-completed", "completed"),
    ]);
    expect(
      (await f.repository.loadState()).reportJobs.find(
        (job) => job.jobId === "recover-1",
      )?.startedAt,
    ).toBe(oldStart);
    await f.service.onModuleInit();
    expect(f.writes).toHaveLength(0);
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() =>
        expect(f.stored.get("recover-1")?.status).toBe("completed"),
      );
      expect(f.writes.map((job) => job.status)).toEqual([
        "running",
        "completed",
      ]);
      expect(f.writes.every((job) => job.startedAt === oldStart)).toBe(true);
      expect(f.stored.get("legacy-completed")).not.toHaveProperty("startedAt");
      expect(
        (await f.repository.loadState()).reportJobs.find(
          (job) => job.jobId === "recover-1",
        )?.startedAt,
      ).toBe(oldStart);
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("observes missing legacy start only at the actual recovered worker start", async () => {
    const f = queueFixture([legacyJob("legacy-running", "running")]);
    await f.service.onModuleInit();
    expect(f.stored.get("legacy-running")).not.toHaveProperty("startedAt");
    const before = Date.now();
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() => expect(f.writes).toHaveLength(2));
      const startedAt = f.writes[0]!.startedAt;
      expect(Date.parse(startedAt!)).toBeGreaterThanOrEqual(before);
      expect(startedAt).not.toBe(f.writes[0]!.createdAt);
      expect(f.writes[1]!.startedAt).toBe(startedAt);
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("writes queued/running/completed with first start only on committed running", async () => {
    const f = queueFixture();
    const accepted = await f.service.createReportJobDurably({
      jobType: "trip_summary",
      format: "csv",
    });
    expect(accepted.status).toBe("queued");
    expect(f.writes[0]!.status).toBe("queued");
    expect(f.writes[0]).not.toHaveProperty("startedAt");
    f.service.onApplicationBootstrap();
    try {
      await vi.waitFor(() => expect(f.writes).toHaveLength(3));
      expect(f.writes.map((job) => job.status)).toEqual([
        "queued",
        "running",
        "completed",
      ]);
      expect(f.writes[1]!.startedAt).toBe(f.writes[1]!.updatedAt);
      expect(f.writes[2]!.startedAt).toBe(f.writes[1]!.startedAt);
    } finally {
      await f.service.onModuleDestroy();
    }
  });
});
