import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import {
  ReportingFilingRepository,
  type StoredReportJobRecord,
} from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import type { DatabaseService } from "../../../../apps/api/src/common/db";
import type { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";

// Only the database and clock/microtask boundaries are mocked. loadState,
// onModuleInit, recovery scheduling, actual start/completion, and persistence run.
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
function fixture(jobs: StoredReportJobRecord[]) {
  const stored = new Map(jobs.map((job) => [job.jobId, structuredClone(job)]));
  const writes: StoredReportJobRecord[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (
      sql.includes("SELECT record") &&
      sql.includes("admin.phase1_report_jobs")
    ) {
      return {
        rows: [...stored.values()].map((record) => ({
          record: structuredClone(record),
        })),
      };
    }
    if (sql.includes("INSERT INTO admin.phase1_report_jobs")) {
      const job = JSON.parse(String(params?.[5])) as StoredReportJobRecord;
      writes.push(job);
      stored.set(job.jobId, job);
    }
    return { rows: [] };
  });
  const database = { isEnabled: () => true, query };
  const repo = new ReportingFilingRepository(
    database as unknown as DatabaseService,
  );
  const audit = { recordAuditLog: vi.fn() };
  const service = new ReportingFilingService(
    audit as unknown as AuditNotificationService,
    repo,
  );
  return { repo, service, writes, stored, query };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("reporting first actual start and rehydration", () => {
  it("localizes the current trip_summary cohort limitation through the actual public worker path", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { service, stored } = fixture([]);
    const callbacks: VoidFunction[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      callbacks.push(callback);
    });
    for (let minute = 0; minute < 2; minute++) {
      vi.setSystemTime(Date.parse("2026-10-12T00:00:00.000Z") + minute * 60000);
      for (let i = 0; i < 30; i++)
        service.createReportJob({ jobType: "trip_summary", format: "csv" });
      expect(
        [...stored.values()].filter(
          (job) => job.status === "queued" || job.status === "running",
        ),
      ).toHaveLength(30);
      callbacks.splice(0).forEach((callback) => callback());
      await vi.waitFor(() =>
        expect(
          [...stored.values()].every((job) => job.status === "completed"),
        ).toBe(true),
      );
    }
    expect(stored.size).toBe(60);
    // This is a semantic fixture counterexample, not a report throughput claim.
    // Real trip_summary work drains between budgeted cohorts; no 50-job proof.
  });
  it("actual repository load and service init retain old start and leave completed legacy absence missing", async () => {
    const oldStart = "2026-10-12T00:00:01.000Z";
    const queued = { ...legacyJob("recover-1", "queued"), startedAt: oldStart };
    const legacy = legacyJob("legacy-completed", "completed");
    const { repo, service, stored, writes } = fixture([queued, legacy]);
    const callbacks: VoidFunction[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      callbacks.push(callback);
    });
    const loaded = await repo.loadState();
    expect(
      loaded.reportJobs.find((j) => j.jobId === "recover-1")?.startedAt,
    ).toBe(oldStart);
    expect(
      loaded.reportJobs.find((j) => j.jobId === "legacy-completed"),
    ).not.toHaveProperty("startedAt");
    await service.onModuleInit();
    expect(callbacks).toHaveLength(1);
    callbacks[0]!();
    await vi.waitFor(() =>
      expect(
        writes.filter((j) => j.jobId === "recover-1").map((j) => j.status),
      ).toEqual(["running", "completed"]),
    );
    expect(writes.every((j) => j.startedAt === oldStart)).toBe(true);
    expect(stored.get("legacy-completed")).not.toHaveProperty("startedAt");
    const reloaded = await repo.loadState();
    expect(
      reloaded.reportJobs.find((j) => j.jobId === "recover-1")?.startedAt,
    ).toBe(oldStart);
  });

  it("missing legacy start is first observed at the actual recovered worker start", async () => {
    const { service, writes, stored } = fixture([
      legacyJob("legacy-running", "running"),
    ]);
    const callbacks: VoidFunction[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      callbacks.push(callback);
    });
    await service.onModuleInit();
    expect(stored.get("legacy-running")).not.toHaveProperty("startedAt");
    const before = Date.now();
    callbacks[0]!();
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    const startedAt = writes[0]!.startedAt;
    expect(Date.parse(startedAt!)).toBeGreaterThanOrEqual(before);
    expect(startedAt).not.toBe(writes[0]!.createdAt);
    expect(writes[1]!.startedAt).toBe(startedAt);
  });

  it("new public job creation writes queued, running and completed records with first start only on running", async () => {
    const { service, writes } = fixture([]);
    const callbacks: VoidFunction[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      callbacks.push(callback);
    });
    const accepted = service.createReportJob({
      jobType: "trip_summary",
      format: "csv",
    });
    expect(accepted.status).toBe("queued");
    expect(writes[0]!.status).toBe("queued");
    expect(writes[0]).not.toHaveProperty("startedAt");
    callbacks[0]!();
    await vi.waitFor(() => expect(writes).toHaveLength(3));
    expect(writes.map((j) => j.status)).toEqual([
      "queued",
      "running",
      "completed",
    ]);
    expect(writes[1]!.startedAt).toBe(writes[1]!.updatedAt);
    expect(writes[2]!.startedAt).toBe(writes[1]!.startedAt);
  });
});
