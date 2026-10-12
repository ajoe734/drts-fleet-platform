import { Injectable, Logger, Optional } from "@nestjs/common";
import { Client } from "pg";

import type {
  FilingPackageRecord,
  MultiTaxiTripOperationalRecordQuery,
  PartnerRevenueSummaryRowRecord,
  ReportArtifactRecord,
  ReportJobRecord,
  ReportJobRowRecord,
  SettlementMatrixRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import type { ControlledDownloadMetadata } from "./download-signing.util";

type JsonRecordRow = {
  record: unknown;
};

export type MultiTaxiTripExportJobMetadata = {
  scope: MultiTaxiTripOperationalRecordQuery;
  purpose: string;
  idempotencyKey: string;
  requestedByActorId: string;
  recordCount: number;
};

type ReportArtifactView = ReportArtifactRecord & {
  downloadMetadata: ControlledDownloadMetadata;
};

type FilingPackageManifestEntry = {
  itemId: string;
  itemType: string;
  artifactId: string;
  manifestHash: string;
};

type FilingPackageManifest = {
  manifestId: string;
  generatedAt: string;
  entryCount: number;
  entries: FilingPackageManifestEntry[];
  checksum: string;
  immutable: true;
};

type FilingPackageDownloadMetadata = {
  zip: ControlledDownloadMetadata;
  pdf: ControlledDownloadMetadata;
};

export type StoredReportJobRecord = ReportJobRecord & {
  artifact: ReportArtifactView | null;
  rows: ReportJobRowRecord[];
  partnerRevenueRows?: PartnerRevenueSummaryRowRecord[];
  settlementMatrix?: SettlementMatrixRecord[];
  multiTaxiTripExport?: MultiTaxiTripExportJobMetadata;
  startedAt?: string | null;
};

export type ReportJobWriter = (job: StoredReportJobRecord) => Promise<void>;

export type StoredFilingPackageRecord = FilingPackageRecord & {
  manifest: FilingPackageManifest | null;
  downloadMetadata: FilingPackageDownloadMetadata | null;
};

export type ReportingFilingState = {
  reportJobs: StoredReportJobRecord[];
  filingPackages: StoredFilingPackageRecord[];
};

export type PersistReportingFilingChanges = {
  reportJobs?: readonly StoredReportJobRecord[];
  filingPackages?: readonly StoredFilingPackageRecord[];
};

@Injectable()
export class ReportingFilingRepository {
  private readonly logger = new Logger(ReportingFilingRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  // The same producer path supports an atomic, real recovery backlog. No
  // accepted response or worker scheduling may precede COMMIT.
  async enqueueReportJobs(jobs: readonly StoredReportJobRecord[]) {
    if (!this.isEnabled()) return;
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      for (const job of jobs) {
        if (job.status !== "queued") throw new Error("Expected queued report");
        await client.query(
          `INSERT INTO admin.phase1_report_jobs
           (job_id, job_type, status, created_at, updated_at, record)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            job.jobId,
            job.jobType,
            job.status,
            job.createdAt,
            job.updatedAt,
            JSON.stringify(job),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* discard below */
      }
      // A connection with uncertain transaction/commit state is never pooled.
      client.release(true);
      throw error;
    }
    client.release();
  }

  async enqueueMultiTaxiTripExportJob(job: StoredReportJobRecord): Promise<{
    job: StoredReportJobRecord;
    idempotentReplay: boolean;
  }> {
    if (!this.isEnabled())
      throw new Error("Durable report storage is disabled");
    const metadata = job.multiTaxiTripExport;
    if (
      job.jobType !== "multi_taxi_trip_records" ||
      job.status !== "queued" ||
      !metadata
    )
      throw new Error("Expected queued multi-taxi export");
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      // Preserve the original actor/key authority. A transaction lock serializes
      // concurrent creation across instances without a new schema or migration.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 124))",
        [
          JSON.stringify([
            job.jobType,
            metadata.requestedByActorId,
            metadata.idempotencyKey,
          ]),
        ],
      );
      const found = await client.query<JsonRecordRow>(
        `SELECT record FROM admin.phase1_report_jobs
         WHERE job_type = $1
           AND record->'multiTaxiTripExport'->>'requestedByActorId' = $2
           AND record->'multiTaxiTripExport'->>'idempotencyKey' = $3`,
        [job.jobType, metadata.requestedByActorId, metadata.idempotencyKey],
      );
      if (found.rows.length > 1)
        throw new Error("Ambiguous multi-taxi export replay");
      const existing = found.rows[0]
        ? this.parseRecord<StoredReportJobRecord>(
            found.rows[0].record,
            "admin.phase1_report_jobs",
          )
        : null;
      if (
        existing &&
        (existing.jobType !== job.jobType ||
          existing.multiTaxiTripExport?.requestedByActorId !==
            metadata.requestedByActorId ||
          existing.multiTaxiTripExport.idempotencyKey !==
            metadata.idempotencyKey)
      )
        throw new Error("Multi-taxi export replay authority mismatch");
      if (!existing) {
        await client.query(
          `INSERT INTO admin.phase1_report_jobs
           (job_id, job_type, status, created_at, updated_at, record)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            job.jobId,
            job.jobType,
            job.status,
            job.createdAt,
            job.updatedAt,
            JSON.stringify(job),
          ],
        );
      }
      await client.query("COMMIT");
      client.release();
      return { job: existing ?? job, idempotentReplay: Boolean(existing) };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* discard below */
      }
      client.release(true);
      throw error;
    }
  }

  async listRunnableReportJobIds(): Promise<string[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<{ job_id: string }>(
      `SELECT job_id FROM admin.phase1_report_jobs
       WHERE status IN ('pending', 'queued', 'running')
       ORDER BY created_at, job_id`,
    );
    return result.rows.map((row) => row.job_id);
  }

  async loadReportJob(jobId: string): Promise<StoredReportJobRecord | null> {
    const result = await this.databaseService!.query<JsonRecordRow>(
      "SELECT record FROM admin.phase1_report_jobs WHERE job_id = $1",
      [jobId],
    );
    if (!result.rows[0]) return null;
    const job = this.parseRecord<StoredReportJobRecord>(
      result.rows[0].record,
      "admin.phase1_report_jobs",
    );
    if (job.jobId !== jobId) throw new Error("Report readback ID mismatch");
    return job;
  }

  async loadReportJobs(jobIds: string[]): Promise<StoredReportJobRecord[]> {
    if (!jobIds.length) return [];
    const result = await this.databaseService!.query<
      JsonRecordRow & { job_id: string }
    >(
      "SELECT job_id, record FROM admin.phase1_report_jobs WHERE job_id = ANY($1::text[])",
      [jobIds],
    );
    return result.rows.map((row) => {
      const job = this.parseRecord<StoredReportJobRecord>(
        row.record,
        "admin.phase1_report_jobs",
      );
      if (job.jobId !== row.job_id || !jobIds.includes(job.jobId))
        throw new Error("Report readback ID mismatch");
      return job;
    });
  }

  // Hold a session lock on a dedicated connection through the entire build.
  // Another process cannot recover a live job; process/connection loss releases
  // ownership without an expiring lease permitting two concurrent builders.
  async withReportJobClaim(
    jobId: string,
    run: (job: StoredReportJobRecord, write: ReportJobWriter) => Promise<void>,
  ): Promise<boolean> {
    if (!this.isEnabled())
      throw new Error("Durable report storage is disabled");
    // A builder can itself query DatabaseService. Borrowing its last pooled
    // connection for ownership would deadlock a pool of size1. This bounded
    // session uses the existing database URI, with no new hosting/config flag.
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error(
        "Durable report worker requires the existing DATABASE_URL",
      );
    const client = new Client({ connectionString });
    try {
      await client.connect();
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
    let locked = false;
    try {
      const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 123)) AS locked",
        [jobId],
      );
      locked = result.rows[0]?.locked === true;
      if (!locked) return false;
      const current = await client.query<JsonRecordRow>(
        `SELECT record FROM admin.phase1_report_jobs
         WHERE job_id = $1 AND status IN ('pending', 'queued', 'running')`,
        [jobId],
      );
      if (!current.rows[0]) return false;
      const job = this.parseRecord<StoredReportJobRecord>(
        current.rows[0].record,
        "admin.phase1_report_jobs",
      );
      if (job.jobId !== jobId) throw new Error("Report claim ID mismatch");
      let previousStatus = job.status;
      await run(job, async (next) => {
        if (next.jobId !== jobId) throw new Error("Report write ID mismatch");
        const saved = await client.query(
          `UPDATE admin.phase1_report_jobs SET
             status = $2, updated_at = $3, record = $4::jsonb
           WHERE job_id = $1 AND status = $5 RETURNING job_id`,
          [
            jobId,
            next.status,
            next.updatedAt,
            JSON.stringify(next),
            previousStatus,
          ],
        );
        if (saved.rowCount !== 1)
          throw new Error("Report state changed during claim");
        previousStatus = next.status;
      });
      return true;
    } finally {
      if (locked) {
        try {
          await client.query(
            "SELECT pg_advisory_unlock(hashtextextended($1, 123))",
            [jobId],
          );
        } catch (error) {
          this.reportPersistenceFailure(error, "release_report_claim");
        }
      }
      // End this dedicated session on every path, including failed queries or
      // unlock. It is never pooled, so uncertain ownership cannot be reused.
      await client.end();
    }
  }

  async loadState(): Promise<ReportingFilingState> {
    if (!this.isEnabled()) {
      return {
        reportJobs: [],
        filingPackages: [],
      };
    }

    const [reportJobsResult, filingPackagesResult] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_report_jobs
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_filing_packages
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
    ]);

    return {
      reportJobs: reportJobsResult.rows.map((row) =>
        this.parseRecord<StoredReportJobRecord>(
          row.record,
          "admin.phase1_report_jobs",
        ),
      ),
      filingPackages: filingPackagesResult.rows.map((row) =>
        this.parseRecord<StoredFilingPackageRecord>(
          row.record,
          "admin.phase1_filing_packages",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistReportingFilingChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const job of changes.reportJobs ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_report_jobs (
              job_id,
              job_type,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (job_id) DO UPDATE SET
              job_type = EXCLUDED.job_type,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            job.jobId,
            job.jobType,
            job.status,
            job.createdAt,
            job.updatedAt,
            JSON.stringify(job),
          ],
        ),
      );
    }

    for (const filingPackage of changes.filingPackages ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO admin.phase1_filing_packages (
              package_id,
              package_type,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (package_id) DO UPDATE SET
              package_type = EXCLUDED.package_type,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            filingPackage.packageId,
            filingPackage.packageType,
            filingPackage.status,
            filingPackage.createdAt,
            filingPackage.updatedAt,
            JSON.stringify(filingPackage),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Reporting-filing persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
