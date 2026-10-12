import { vi } from "vitest";
import type { DatabaseService } from "../../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  ReportingFilingRepository,
  type StoredReportJobRecord,
} from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";

// SQL/session/transaction boundary model only, not a PostgreSQL proof. Every
// producer, repository statement, worker, builder and lifecycle hook is real.
export function queueFixture(jobs: StoredReportJobRecord[] = []) {
  const stored = new Map(jobs.map((job) => [job.jobId, structuredClone(job)]));
  const locks = new Set<string>();
  const writes: StoredReportJobRecord[] = [];
  const releases = vi.fn();
  const control: {
    before?: (sql: string, params: unknown[]) => Promise<void>;
  } = {};
  const eligible = (job: StoredReportJobRecord) =>
    ["queued", "pending", "running"].includes(job.status);
  function session() {
    let transaction: Map<string, StoredReportJobRecord> | null = null;
    const owned = new Set<string>();
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      await control.before?.(sql, params);
      if (sql === "BEGIN") transaction = new Map();
      if (sql === "ROLLBACK") transaction = null;
      if (sql === "COMMIT") {
        for (const [id, job] of transaction ?? []) {
          stored.set(id, job);
          writes.push(job);
        }
        transaction = null;
      }
      if (sql.includes("pg_try_advisory_lock")) {
        const id = String(params[0]);
        const locked = !locks.has(id);
        if (locked) {
          locks.add(id);
          owned.add(id);
        }
        return { rows: [{ locked }], rowCount: 1 };
      }
      if (sql.includes("pg_advisory_unlock")) {
        const id = String(params[0]);
        if (owned.has(id)) {
          locks.delete(id);
          owned.delete(id);
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO admin.phase1_report_jobs")) {
        const job = JSON.parse(String(params[5])) as StoredReportJobRecord;
        if (transaction) transaction.set(job.jobId, job);
        else {
          stored.set(job.jobId, job);
          writes.push(job);
        }
      }
      if (sql.includes("UPDATE admin.phase1_report_jobs")) {
        const job = JSON.parse(String(params[3])) as StoredReportJobRecord;
        if (stored.get(job.jobId)?.status !== params[4])
          return { rows: [], rowCount: 0 };
        stored.set(job.jobId, job);
        writes.push(job);
        return { rows: [{ job_id: job.jobId }], rowCount: 1 };
      }
      if (sql.includes("SELECT job_id FROM admin.phase1_report_jobs")) {
        return {
          rows: [...stored.values()]
            .filter(eligible)
            .sort(
              (a, b) =>
                a.createdAt.localeCompare(b.createdAt) ||
                a.jobId.localeCompare(b.jobId),
            )
            .map((job) => ({ job_id: job.jobId })),
        };
      }
      if (
        sql.includes("SELECT record") &&
        sql.includes("admin.phase1_report_jobs")
      ) {
        return {
          rows: [...stored.values()]
            .filter(
              (job) =>
                !params.length ||
                (job.jobId === params[0] &&
                  (!sql.includes("status IN") || eligible(job))),
            )
            .map((record) => ({ record: structuredClone(record) })),
        };
      }
      return { rows: [], rowCount: 0 };
    });
    return {
      query,
      release: (discard?: boolean) => {
        for (const id of owned) locks.delete(id);
        owned.clear();
        releases(discard);
      },
    };
  }
  const query = session().query;
  const database = {
    isEnabled: () => true,
    query,
    connect: async () => session(),
  };
  const repository = new ReportingFilingRepository(
    database as unknown as DatabaseService,
  );
  vi.spyOn(repository, "reportPersistenceFailure").mockImplementation(() => {});
  const audit = new AuditNotificationService();
  const service = new ReportingFilingService(audit, repository);
  return {
    service,
    repository,
    database,
    audit,
    stored,
    writes,
    locks,
    releases,
    control,
  };
}
