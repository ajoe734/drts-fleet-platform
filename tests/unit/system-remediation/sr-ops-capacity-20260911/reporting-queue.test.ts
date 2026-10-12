import { describe, expect, it, vi } from "vitest";
import { ReportingFilingController } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.controller";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { ReportingFilingRepository } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { IdempotencyService } from "../../../../apps/api/src/common/idempotency/idempotency.service";
import { IdempotencyRepository } from "../../../../apps/api/src/common/idempotency/idempotency.repository";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { DatabaseService } from "../../../../apps/api/src/common/db";

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
    await vi.waitFor(() => expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(true));
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(returned).toBe(false);
    } finally {
      barrier.resolve();
      await response;
    }
  });
});
