import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  FilingPackageRecord,
  ReportArtifactRecord,
  ReportJobRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import type { ControlledDownloadMetadata } from "./download-signing.util";

type JsonRecordRow = {
  record: unknown;
};

type DispatchRecordingIndexRow = {
  orderId: string;
  orderNo: string;
  callId: string | null;
  recordingId: string | null;
  missingRecording: boolean;
  exportedAt: string;
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
  rows: DispatchRecordingIndexRow[];
};

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
