import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateReportJobCommand,
  FilingPackageAccepted,
  FilingPackageRecord,
  FilingPackageType,
  GenerateFilingPackageCommand,
  OwnedOrderRecord,
  PackageItemRecord,
  ReportArtifactRecord,
  ReportJobAccepted,
  ReportJobRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  ReportingFilingRepository,
  type PersistReportingFilingChanges,
} from "./reporting-filing.repository";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
  createControlledDownloadMetadata,
  type ControlledDownloadMetadata,
} from "./download-signing.util";

type DispatchRecordingIndexRow = {
  orderId: string;
  orderNo: string;
  callId: string | null;
  recordingId: string | null;
  missingRecording: boolean;
  exportedAt: string;
};

type ReportJobView = ReportJobRecord & {
  artifact: ReportArtifactView | null;
  rows?: DispatchRecordingIndexRow[];
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

type FilingPackageView = FilingPackageRecord & {
  immutable: true;
  manifest: FilingPackageManifest | null;
  downloadMetadata: FilingPackageDownloadMetadata | null;
};

type FilingPackageDownloadMetadata = {
  zip: ControlledDownloadMetadata;
  pdf: ControlledDownloadMetadata;
};

type StoredReportJob = ReportJobRecord & {
  artifact: ReportArtifactView | null;
  rows: DispatchRecordingIndexRow[];
};

type StoredFilingPackage = FilingPackageRecord & {
  manifest: FilingPackageManifest | null;
  downloadMetadata: FilingPackageDownloadMetadata | null;
};

type OrderFeedProvider = () => OwnedOrderRecord[];

@Injectable()
export class ReportingFilingService implements OnModuleInit {
  private reportJobs: StoredReportJob[] = [];

  private filingPackages: StoredFilingPackage[] = [];

  private readonly scheduledReportJobIds = new Set<string>();

  private readonly scheduledFilingPackageIds = new Set<string>();

  private orderFeedProvider: OrderFeedProvider = () => [];

  private readonly downloadHost = DEFAULT_CONTROLLED_DOWNLOAD_HOST;

  private readonly downloadSigningKeyId = DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID;

  private readonly downloadSigningSecret = DEFAULT_CONTROLLED_DOWNLOAD_SECRET;

  private readonly downloadSignatureVersion =
    DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION;

  private readonly downloadExpiryMinutes =
    DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES;

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly reportingFilingRepository?: ReportingFilingRepository,
  ) {}

  async onModuleInit() {
    if (!this.reportingFilingRepository) {
      return;
    }

    try {
      const persistedState = await this.reportingFilingRepository.loadState();
      this.reportJobs = persistedState.reportJobs.map((job) =>
        this.cloneStoredReportJob(job),
      );
      this.filingPackages = persistedState.filingPackages.map((filingPackage) =>
        this.cloneStoredFilingPackage(filingPackage),
      );
      for (const job of this.reportJobs) {
        if (job.status === "queued" || job.status === "running") {
          this.scheduleReportJobCompletion(job.jobId);
        }
      }
      for (const filingPackage of this.filingPackages) {
        if (
          filingPackage.status === "queued" ||
          filingPackage.status === "running"
        ) {
          this.scheduleFilingPackageCompletion(filingPackage.packageId);
        }
      }
    } catch (error) {
      this.reportingFilingRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  registerOrderFeedProvider(provider: OrderFeedProvider) {
    this.orderFeedProvider = provider;
  }

  createReportJob(
    command: CreateReportJobCommand,
    requestId?: string,
  ): ReportJobAccepted {
    this.assertNonBlank(command.jobType, "jobType");

    const createdAt = new Date().toISOString();
    const job: StoredReportJob = {
      jobId: `JOB-${randomUUID()}`,
      jobType: command.jobType,
      format: command.format,
      status: "queued",
      filters: { ...(command.filters ?? {}) },
      artifact: null,
      rows: [],
      createdAt,
      updatedAt: createdAt,
    };

    this.reportJobs = [job, ...this.reportJobs];
    this.persistChanges(
      {
        reportJobs: [this.cloneStoredReportJob(job)],
      },
      "queue_report_job",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "reporting-filing",
        actionName: "create_report_job",
        resourceType: "report_job",
        resourceId: job.jobId,
        newValuesSummary: {
          jobType: job.jobType,
          format: job.format,
          status: job.status,
        },
      },
      requestId,
    );

    this.scheduleReportJobCompletion(job.jobId, requestId);

    return {
      jobId: job.jobId,
      status: "queued" as const satisfies ReportJobAccepted["status"],
    };
  }

  listReportJobs() {
    return this.reportJobs.map((job) => this.cloneReportJob(job));
  }

  getReportJob(jobId: string): ReportJobView {
    const job = this.requireReportJob(jobId);
    return this.cloneReportJob(job);
  }

  generateFilingPackage(
    command: GenerateFilingPackageCommand,
    requestId?: string,
  ): FilingPackageAccepted {
    const createdAt = new Date().toISOString();
    const filingPackage: StoredFilingPackage = {
      packageId: `PKG-${randomUUID()}`,
      packageType: command.packageType,
      status: "queued",
      artifactZipUrl: null,
      artifactPdfUrl: null,
      manifestHash: null,
      items: [],
      generatedAt: null,
      createdAt,
      updatedAt: createdAt,
      manifest: null,
      downloadMetadata: null,
    };

    this.filingPackages = [filingPackage, ...this.filingPackages];
    this.persistChanges(
      {
        filingPackages: [this.cloneStoredFilingPackage(filingPackage)],
      },
      "queue_filing_package",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "reporting-filing",
        actionName: "generate_filing_package_requested",
        resourceType: "filing_package",
        resourceId: filingPackage.packageId,
        newValuesSummary: {
          packageType: filingPackage.packageType,
          status: filingPackage.status,
        },
      },
      requestId,
    );

    this.scheduleFilingPackageCompletion(filingPackage.packageId, requestId);

    return {
      packageId: filingPackage.packageId,
      status: "queued" as const satisfies FilingPackageAccepted["status"],
    };
  }

  getFilingPackage(packageId: string): FilingPackageView {
    const filingPackage = this.requireFilingPackage(packageId);
    return this.cloneFilingPackage(filingPackage);
  }

  listFilingPackages() {
    return this.filingPackages.map((filingPackage) =>
      this.cloneFilingPackage(filingPackage),
    );
  }

  private scheduleReportJobCompletion(jobId: string, requestId?: string) {
    if (this.scheduledReportJobIds.has(jobId)) {
      return;
    }

    this.scheduledReportJobIds.add(jobId);
    queueMicrotask(() => {
      void this.runReportJob(jobId, requestId).finally(() => {
        this.scheduledReportJobIds.delete(jobId);
      });
    });
  }

  private scheduleFilingPackageCompletion(
    packageId: string,
    requestId?: string,
  ) {
    if (this.scheduledFilingPackageIds.has(packageId)) {
      return;
    }

    this.scheduledFilingPackageIds.add(packageId);
    queueMicrotask(() => {
      void this.runFilingPackage(packageId, requestId).finally(() => {
        this.scheduledFilingPackageIds.delete(packageId);
      });
    });
  }

  private async runReportJob(jobId: string, requestId?: string) {
    const job = this.reportJobs.find(
      (candidateJob) => candidateJob.jobId === jobId,
    );
    if (!job || (job.status !== "queued" && job.status !== "running")) {
      return;
    }

    try {
      this.startReportJob(job);
      this.completeReportJob(job, requestId);
    } catch (error) {
      this.failReportJob(job, error, requestId);
    }
  }

  private async runFilingPackage(packageId: string, requestId?: string) {
    const filingPackage = this.filingPackages.find(
      (candidatePackage) => candidatePackage.packageId === packageId,
    );
    if (
      !filingPackage ||
      (filingPackage.status !== "queued" && filingPackage.status !== "running")
    ) {
      return;
    }

    try {
      this.startFilingPackage(filingPackage);
      this.completeFilingPackage(filingPackage, requestId);
    } catch (error) {
      this.failFilingPackage(filingPackage, error, requestId);
    }
  }

  private startReportJob(job: StoredReportJob) {
    const updatedAt = new Date().toISOString();
    job.status = "running";
    job.updatedAt = updatedAt;
    this.persistChanges(
      {
        reportJobs: [this.cloneStoredReportJob(job)],
      },
      "start_report_job",
    );
  }

  private completeReportJob(job: StoredReportJob, requestId?: string) {
    if (job.jobType === "dispatch_recording_index") {
      job.rows = this.buildDispatchRecordingIndexRows();
    }

    const artifactPayload = {
      jobId: job.jobId,
      jobType: job.jobType,
      format: job.format,
      filters: job.filters,
      rows: job.rows,
    };
    job.artifact = this.createArtifact("report", job.jobId, artifactPayload);
    job.status = "completed";
    job.updatedAt = new Date().toISOString();
    this.persistChanges(
      {
        reportJobs: [this.cloneStoredReportJob(job)],
      },
      "complete_report_job",
    );

    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "reporting-filing",
        actionName: "complete_report_job",
        resourceType: "report_job",
        resourceId: job.jobId,
        newValuesSummary: {
          jobType: job.jobType,
          status: job.status,
          artifactId: job.artifact.artifactId,
          artifactExpiresAt: job.artifact.expiresAt,
          rowCount: job.rows.length,
        },
      },
      requestId,
    );
  }

  private failReportJob(
    job: StoredReportJob,
    error: unknown,
    requestId?: string,
  ) {
    job.status = "failed";
    job.updatedAt = new Date().toISOString();
    this.persistChanges(
      {
        reportJobs: [this.cloneStoredReportJob(job)],
      },
      "fail_report_job",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "reporting-filing",
        actionName: "fail_report_job",
        resourceType: "report_job",
        resourceId: job.jobId,
        newValuesSummary: {
          jobType: job.jobType,
          status: job.status,
          error:
            error instanceof Error ? error.message : "unknown reporting error",
        },
      },
      requestId,
    );
  }

  private startFilingPackage(filingPackage: StoredFilingPackage) {
    const generatedAt = new Date().toISOString();
    filingPackage.status = "running";
    filingPackage.updatedAt = generatedAt;
    this.persistChanges(
      {
        filingPackages: [this.cloneStoredFilingPackage(filingPackage)],
      },
      "start_filing_package",
    );
  }

  private completeFilingPackage(
    filingPackage: StoredFilingPackage,
    requestId?: string,
  ) {
    const generatedAt = new Date().toISOString();
    const itemTypes = this.resolvePackageItemTypes(filingPackage.packageType);
    const items = itemTypes.map((itemType) =>
      this.createPackageItem(filingPackage.packageId, itemType, {
        packageType: filingPackage.packageType,
      }),
    );
    const manifestEntries = items.map((item) => ({
      itemId: item.itemId,
      itemType: item.itemType,
      artifactId: item.artifactId,
      manifestHash: item.manifestHash,
    }));
    const checksum = this.computeHash({
      packageId: filingPackage.packageId,
      packageType: filingPackage.packageType,
      entries: manifestEntries,
    });
    const manifest: FilingPackageManifest = {
      manifestId: `MANIFEST-${randomUUID()}`,
      generatedAt,
      entryCount: manifestEntries.length,
      entries: manifestEntries.map((entry) => ({ ...entry })),
      checksum,
      immutable: true,
    };

    filingPackage.items = items.map((item) => Object.freeze({ ...item }));
    filingPackage.manifest = Object.freeze({
      ...manifest,
      entries: manifest.entries.map((entry) => Object.freeze({ ...entry })),
    });
    filingPackage.manifestHash = checksum;
    filingPackage.generatedAt = generatedAt;
    const zipDownloadMetadata = createControlledDownloadMetadata({
      kind: "filing-zip",
      subjectId: filingPackage.packageId,
      manifestHash: checksum,
      createdAt: generatedAt,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });
    const pdfDownloadMetadata = createControlledDownloadMetadata({
      kind: "filing-pdf",
      subjectId: filingPackage.packageId,
      manifestHash: checksum,
      createdAt: generatedAt,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });
    filingPackage.artifactZipUrl = zipDownloadMetadata.downloadUrl;
    filingPackage.artifactPdfUrl = pdfDownloadMetadata.downloadUrl;
    filingPackage.downloadMetadata = {
      zip: zipDownloadMetadata,
      pdf: pdfDownloadMetadata,
    };
    filingPackage.status = "completed";
    filingPackage.updatedAt = generatedAt;
    this.persistChanges(
      {
        filingPackages: [this.cloneStoredFilingPackage(filingPackage)],
      },
      "complete_filing_package",
    );

    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "reporting-filing",
        actionName: "generate_filing_package_completed",
        resourceType: "filing_package",
        resourceId: filingPackage.packageId,
        newValuesSummary: {
          packageType: filingPackage.packageType,
          status: filingPackage.status,
          manifestHash: filingPackage.manifestHash,
          itemCount: filingPackage.items.length,
          artifactZipExpiresAt: zipDownloadMetadata.expiresAt,
          artifactPdfExpiresAt: pdfDownloadMetadata.expiresAt,
        },
      },
      requestId,
    );
  }

  private failFilingPackage(
    filingPackage: StoredFilingPackage,
    error: unknown,
    requestId?: string,
  ) {
    filingPackage.status = "failed";
    filingPackage.updatedAt = new Date().toISOString();
    this.persistChanges(
      {
        filingPackages: [this.cloneStoredFilingPackage(filingPackage)],
      },
      "fail_filing_package",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "reporting-filing",
        actionName: "generate_filing_package_failed",
        resourceType: "filing_package",
        resourceId: filingPackage.packageId,
        newValuesSummary: {
          packageType: filingPackage.packageType,
          status: filingPackage.status,
          error:
            error instanceof Error ? error.message : "unknown filing error",
        },
      },
      requestId,
    );
  }

  private buildDispatchRecordingIndexRows(): DispatchRecordingIndexRow[] {
    const exportedAt = new Date().toISOString();
    return this.orderFeedProvider()
      .filter((order) => order.orderSource === "phone")
      .map((order) => ({
        orderId: order.orderId,
        orderNo: order.orderNo,
        callId: order.callId,
        recordingId: order.recordingId,
        missingRecording:
          order.recordingId === null ||
          order.complianceFlags.includes("recording_pending"),
        exportedAt,
      }));
  }

  private createPackageItem(
    packageId: string,
    itemType: string,
    command: GenerateFilingPackageCommand,
  ): PackageItemRecord {
    const payload = {
      packageId,
      itemType,
      scope: command.scope ?? {},
      period: command.period ?? {},
    };

    return {
      itemId: `ITEM-${randomUUID()}`,
      packageId,
      itemType,
      artifactId: `ART-${randomUUID()}`,
      manifestHash: this.computeHash(payload),
    };
  }

  private createArtifact(
    artifactType: "report" | "filing",
    subjectId: string,
    payload: Record<string, unknown>,
  ): ReportArtifactView {
    const manifestHash = this.computeHash(payload);
    const createdAt = new Date().toISOString();
    const downloadMetadata = createControlledDownloadMetadata({
      kind: artifactType,
      subjectId,
      manifestHash,
      createdAt,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });
    return {
      artifactId: `ART-${randomUUID()}`,
      artifactType,
      downloadUrl: downloadMetadata.downloadUrl,
      expiresAt: downloadMetadata.expiresAt,
      manifestHash,
      immutable: true,
      downloadMetadata,
    };
  }

  private resolvePackageItemTypes(packageType: FilingPackageType) {
    if (packageType === "audit_request") {
      return ["audit_summary", "statistics"];
    }

    return [
      "vehicle_roster",
      "driver_roster",
      "contract_roster",
      "insurance_roster",
      "statistics",
    ];
  }

  private cloneReportJob(job: StoredReportJob): ReportJobView {
    return {
      ...job,
      filters: { ...job.filters },
      artifact: job.artifact
        ? {
            ...job.artifact,
            downloadMetadata: { ...job.artifact.downloadMetadata },
          }
        : null,
      rows: job.rows.map((row) => ({ ...row })),
    };
  }

  private cloneStoredReportJob(job: StoredReportJob): StoredReportJob {
    return {
      ...job,
      filters: { ...job.filters },
      artifact: job.artifact
        ? {
            ...job.artifact,
            downloadMetadata: { ...job.artifact.downloadMetadata },
          }
        : null,
      rows: job.rows.map((row) => ({ ...row })),
    };
  }

  private cloneFilingPackage(
    filingPackage: StoredFilingPackage,
  ): FilingPackageView {
    return {
      ...filingPackage,
      items: filingPackage.items.map((item) => ({ ...item })),
      manifest: filingPackage.manifest
        ? {
            ...filingPackage.manifest,
            entries: filingPackage.manifest.entries.map((entry) => ({
              ...entry,
            })),
          }
        : null,
      downloadMetadata: filingPackage.downloadMetadata
        ? {
            zip: { ...filingPackage.downloadMetadata.zip },
            pdf: { ...filingPackage.downloadMetadata.pdf },
          }
        : null,
      immutable: true,
    };
  }

  private cloneStoredFilingPackage(
    filingPackage: StoredFilingPackage,
  ): StoredFilingPackage {
    return {
      ...filingPackage,
      items: filingPackage.items.map((item) => ({ ...item })),
      manifest: filingPackage.manifest
        ? {
            ...filingPackage.manifest,
            entries: filingPackage.manifest.entries.map((entry) => ({
              ...entry,
            })),
          }
        : null,
      downloadMetadata: filingPackage.downloadMetadata
        ? {
            zip: { ...filingPackage.downloadMetadata.zip },
            pdf: { ...filingPackage.downloadMetadata.pdf },
          }
        : null,
    };
  }

  private requireReportJob(jobId: string) {
    const job = this.reportJobs.find(
      (candidateJob) => candidateJob.jobId === jobId,
    );
    if (!job) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "REPORT_JOB_NOT_FOUND",
        "Report job was not found.",
        {
          jobId,
        },
      );
    }
    return job;
  }

  private requireFilingPackage(packageId: string) {
    const filingPackage = this.filingPackages.find(
      (candidatePackage) => candidatePackage.packageId === packageId,
    );
    if (!filingPackage) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "FILING_PACKAGE_NOT_FOUND",
        "Filing package was not found.",
        {
          packageId,
        },
      );
    }
    return filingPackage;
  }

  private assertNonBlank(value: string, field: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} is required.`,
        {
          field,
        },
      );
    }
  }

  private computeHash(value: unknown) {
    return createHash("sha256")
      .update(this.stableSerialize(value))
      .digest("hex");
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => {
          const nestedValue = (value as Record<string, unknown>)[key];
          return `${JSON.stringify(key)}:${this.stableSerialize(nestedValue)}`;
        })
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditLogInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      ...input,
    };
    if (requestId) {
      auditLogInput.requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(auditLogInput);
  }

  private persistChanges(
    changes: PersistReportingFilingChanges,
    context: string,
  ) {
    if (!this.reportingFilingRepository) {
      return;
    }

    void this.reportingFilingRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        this.reportingFilingRepository!.reportPersistenceFailure(
          error,
          context,
        );
      });
  }
}
