import { describe, expect, it, vi } from "vitest";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { ReportingFilingRepository } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ConfigService } from "@nestjs/config";
import { EventPublisher } from "../../../../apps/api/src/common/events/event-publisher";
import { Logger } from "@nestjs/common";

describe("reporting-filing actual-path start regressions", () => {
  it("first start sets startedAt, restart preserves startedAt, JSON persistence matches", async () => {
    // Mock the external database/repository
    const mockDb = {
      isEnabled: () => true,
      query: vi.fn(),
      transaction: vi.fn(async (cb) => {
        const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        return cb(client);
      }),
    };
    const repo = new ReportingFilingRepository(mockDb as any);
    const publisher = { publish: vi.fn() };
    const config = { get: vi.fn().mockReturnValue(false) };

    const service = new ReportingFilingService(
      publisher as any,
      repo
    );

    // Provide a mocked reportJob
    const job = {
      jobId: "test-job-1",
      jobType: "daily_dispatch",
      status: "queued",
      createdAt: "2026-10-12T00:00:00Z",
      updatedAt: "2026-10-12T00:00:00Z",
      filters: {},
      resultUrl: null,
      errorDetails: null,
      rows: [],
      partnerRevenueRows: [],
      // startedAt is absent initially (legacy timestamp absent)
    };

    // Override the private persistChanges to capture the job being saved
    let savedJob: any;
    const originalPersist = (service as any).persistChanges.bind(service);
    (service as any).persistChanges = (changes: any, reason: string) => {
      if (changes.reportJobs?.[0]) {
        savedJob = changes.reportJobs[0];
      }
      return originalPersist(changes, reason);
    };

    // 1. First start: sets startedAt
    (service as any).startReportJob(job);
    expect(savedJob.status).toBe("running");
    expect(savedJob.startedAt).toBeDefined();
    expect(savedJob.startedAt).toEqual(savedJob.updatedAt); // updated to current time

    const firstStartedAt = savedJob.startedAt;

    // Simulate recovery/restart: status is running but we start again (or requeued then started)
    const recoveredJob = {
      ...savedJob,
      status: "queued", // maybe recovered from crash
    };

    // 2. Restart/recovery start: preserves startedAt
    await new Promise(r => setTimeout(r, 10)); // wait a bit so time changes
    (service as any).startReportJob(recoveredJob);
    
    expect(savedJob.status).toBe("running");
    expect(savedJob.startedAt).toBe(firstStartedAt);
    expect(savedJob.updatedAt).not.toBe(firstStartedAt);

    // 3. JSON persistence check in repository
    await repo.persistChanges({ reportJobs: [savedJob], filingPackages: [] });
    
    const queryArgs = (mockDb.query as any).mock.calls[0];
    expect(queryArgs[0]).toContain("INSERT INTO admin.phase1_report_jobs");
    const jsonStr = queryArgs[1][5]; // The 6th parameter is JSON.stringify(job)
    const parsed = JSON.parse(jsonStr);
    expect(parsed.jobId).toBe("test-job-1");
    expect(parsed.startedAt).toBe(firstStartedAt);
  });
});
