import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateReportJobCommand,
  DispatchDailyRecord,
  EvidenceSubjectGovernanceRecord,
  FilingPackageAccepted,
  FilingPackageRecord,
  FilingPackageType,
  GenerateFilingPackageCommand,
  OwnedOrderRecord,
  PartnerRevenueSummaryRowRecord,
  PackageItemRecord,
  ReportArtifactRecord,
  ReportJobAccepted,
  ReportJobRecord,
  SettlementMatrixRecord,
  SixMonthOperationsSummary,
  TenantCostCenterRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  assertEvidenceAccess,
  buildEvidenceAccessAuditSummary,
  type EvidenceAccessIdentity,
} from "../../common/evidence-governance";
import { maskOpaqueToken } from "../../common/sensitive-data-policy";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import type { DailyDispatchRecordQuery } from "../reporting/reporting.repository";
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
import { buildSettlementMatrix } from "../billing-settlement/settlement-matrix";

type DispatchRecordingIndexRow = {
  orderId: string;
  orderNo: string;
  callId: string | null;
  recordingId: string | null;
  missingRecording: boolean;
  exportedAt: string;
};

type TenantMonthlyTripReportRow = {
  orderId: string;
  orderNo: string;
  tenantId: string | null;
  userId: string | null;
  costCenterCode: string | null;
  serviceProduct: string;
  businessDispatchSubtype: string | null;
  bookingId: string | null;
  status: OwnedOrderRecord["status"];
  completedAt: string | null;
  sourceMarker: "owned_mobility_order_feed";
  costCenterSourceMarker: "tenant_partner_cost_center_directory" | null;
  sourceUpdatedAt: string;
  producerRequestId: string | null;
  exportedAt: string;
};

type ReportingJobRow =
  | DispatchRecordingIndexRow
  | DispatchDailyRecord
  | SixMonthOperationsSummary
  | TenantMonthlyTripReportRow;

type ReportJobView = ReportJobRecord & {
  artifact: ReportArtifactView | null;
  rows?: ReportingJobRow[];
  partnerRevenueRows?: PartnerRevenueSummaryRowRecord[];
  settlementMatrix?: SettlementMatrixRecord[];
  evidenceGovernance?: EvidenceSubjectGovernanceRecord | null;
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
  evidenceGovernance?: EvidenceSubjectGovernanceRecord | null;
};

type FilingPackageDownloadMetadata = {
  zip: ControlledDownloadMetadata;
  pdf: ControlledDownloadMetadata;
};

type StoredReportJob = ReportJobRecord & {
  artifact: ReportArtifactView | null;
  rows: ReportingJobRow[];
  partnerRevenueRows: PartnerRevenueSummaryRowRecord[];
  settlementMatrix: SettlementMatrixRecord[];
};

type StoredFilingPackage = FilingPackageRecord & {
  manifest: FilingPackageManifest | null;
  downloadMetadata: FilingPackageDownloadMetadata | null;
};

type OrderFeedProvider = () => OwnedOrderRecord[];
type CostCenterDirectoryProvider = (
  tenantId: string,
) => TenantCostCenterRecord[];
type DailyDispatchRecordProvider = (
  filters: DailyDispatchRecordQuery,
) => Promise<DispatchDailyRecord[]> | DispatchDailyRecord[];
type SixMonthOperationsSummaryProvider = (filters: {
  from?: string;
  to?: string;
  businessArea?: string;
  serviceProductCode?: string;
}) => Promise<SixMonthOperationsSummary[]> | SixMonthOperationsSummary[];

@Injectable()
export class ReportingFilingService implements OnModuleInit {
  private reportJobs: StoredReportJob[] = [];

  private filingPackages: StoredFilingPackage[] = [];

  private readonly scheduledReportJobIds = new Set<string>();

  private readonly scheduledFilingPackageIds = new Set<string>();

  private orderFeedProvider: OrderFeedProvider = () => [];

  private costCenterDirectoryProvider: CostCenterDirectoryProvider = () => [];

  private dailyDispatchRecordProvider: DailyDispatchRecordProvider = () => [];

  private sixMonthOperationsSummaryProvider: SixMonthOperationsSummaryProvider =
    () => [];

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
        this.cloneStoredReportJob({
          ...job,
          partnerRevenueRows: job.partnerRevenueRows ?? [],
          settlementMatrix: job.settlementMatrix ?? [],
        }),
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

  registerCostCenterDirectoryProvider(provider: CostCenterDirectoryProvider) {
    this.costCenterDirectoryProvider = provider;
  }

  registerDailyDispatchRecordProvider(provider: DailyDispatchRecordProvider) {
    this.dailyDispatchRecordProvider = provider;
  }

  registerSixMonthOperationsSummaryProvider(
    provider: SixMonthOperationsSummaryProvider,
  ) {
    this.sixMonthOperationsSummaryProvider = provider;
  }

  createReportJob(
    command: CreateReportJobCommand,
    requestId?: string,
    tenantScopeId?: string | null,
  ): ReportJobAccepted {
    this.assertNonBlank(command.jobType, "jobType");
    const normalizedTenantScopeId = tenantScopeId?.trim() || null;
    const normalizedFilters = { ...(command.filters ?? {}) };
    if (normalizedTenantScopeId) {
      const commandTenantId =
        typeof normalizedFilters.tenantId === "string"
          ? normalizedFilters.tenantId.trim()
          : null;
      if (commandTenantId && commandTenantId !== normalizedTenantScopeId) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "REPORT_TENANT_SCOPE_MISMATCH",
          "Report job tenant scope must match x-tenant-id.",
          {
            tenantId: normalizedTenantScopeId,
            filtersTenantId: commandTenantId,
          },
        );
      }
      normalizedFilters.tenantId = normalizedTenantScopeId;
    }

    const createdAt = new Date().toISOString();
    const job: StoredReportJob = {
      jobId: `JOB-${randomUUID()}`,
      jobType: command.jobType,
      format: command.format,
      status: "queued",
      filters: normalizedFilters,
      artifact: null,
      rows: [],
      partnerRevenueRows: [],
      settlementMatrix: [],
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
        tenantId: this.getReportJobTenantScopeId(job),
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

  listReportJobs(
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
    tenantScopeId?: string | null,
  ) {
    const normalizedTenantScopeId = tenantScopeId?.trim() || null;
    const policy = assertEvidenceAccess({
      family: "report_artifact",
      identity,
      tenantId: normalizedTenantScopeId,
    });
    const items = this.reportJobs
      .filter((job) =>
        normalizedTenantScopeId
          ? this.getReportJobTenantScopeId(job) === normalizedTenantScopeId
          : true,
      )
      .map((job) => this.cloneReportJob(job));

    this.recordArtifactAccessAudit(
      {
        actionName: "list_report_artifact_evidence",
        resourceType: "report_job",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
          tenantId: normalizedTenantScopeId,
        }),
      },
      requestId,
      identity,
      normalizedTenantScopeId,
    );

    return items;
  }

  getReportJob(
    jobId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
    tenantScopeId?: string | null,
  ): ReportJobView {
    const job = this.requireReportJob(jobId);
    const normalizedTenantScopeId = tenantScopeId?.trim() || null;
    if (normalizedTenantScopeId) {
      this.assertReportJobTenantScope(job, normalizedTenantScopeId);
    }
    const policy = assertEvidenceAccess({
      family: "report_artifact",
      identity,
      tenantId: normalizedTenantScopeId,
    });
    const reportJob = this.cloneReportJob(job);
    if (reportJob.artifact) {
      reportJob.evidenceGovernance =
        this.auditNotificationService.getEvidenceSubjectGovernance(
          "report_artifact",
          reportJob.artifact.artifactId,
          {
            tenantId: normalizedTenantScopeId,
            manifestHash: reportJob.artifact.manifestHash,
          },
        );
    } else {
      reportJob.evidenceGovernance = null;
    }
    this.recordArtifactAccessAudit(
      {
        actionName: "issue_report_artifact_download",
        resourceType: "report_artifact",
        resourceId: reportJob.artifact?.artifactId ?? null,
        newValuesSummary: reportJob.artifact
          ? {
              jobId: reportJob.jobId,
              jobType: reportJob.jobType,
              artifactType: reportJob.artifact.artifactType,
              manifestHash: reportJob.artifact.manifestHash,
              expiresAt: reportJob.artifact.expiresAt,
              ttlMinutes: reportJob.artifact.downloadMetadata.ttlMinutes,
              tenantId: normalizedTenantScopeId,
            }
          : {
              jobId: reportJob.jobId,
              jobType: reportJob.jobType,
              artifactAvailable: false,
              tenantId: normalizedTenantScopeId,
            },
      },
      requestId,
      identity,
      normalizedTenantScopeId,
      policy,
    );
    return reportJob;
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

  getFilingPackage(
    packageId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ): FilingPackageView {
    const filingPackage = this.requireFilingPackage(packageId);
    const policy = assertEvidenceAccess({
      family: "filing_package",
      identity,
    });
    const packageView = this.cloneFilingPackage(filingPackage);
    packageView.evidenceGovernance =
      this.auditNotificationService.getEvidenceSubjectGovernance(
        "filing_package",
        packageView.packageId,
        {
          manifestHash: packageView.manifestHash,
        },
      );
    this.recordArtifactAccessAudit(
      {
        actionName: "issue_filing_package_download",
        resourceType: "filing_package",
        resourceId: packageView.packageId,
        newValuesSummary: packageView.downloadMetadata
          ? {
              packageId: packageView.packageId,
              packageType: packageView.packageType,
              manifestHash: packageView.manifestHash,
              zipExpiresAt: packageView.downloadMetadata.zip.expiresAt,
              pdfExpiresAt: packageView.downloadMetadata.pdf.expiresAt,
              ttlMinutes: packageView.downloadMetadata.zip.ttlMinutes,
            }
          : {
              packageId: packageView.packageId,
              packageType: packageView.packageType,
              artifactAvailable: false,
            },
      },
      requestId,
      identity,
      null,
      policy,
    );
    return packageView;
  }

  listFilingPackages(
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "filing_package",
      identity,
    });
    const items = this.filingPackages.map((filingPackage) =>
      this.cloneFilingPackage(filingPackage),
    );
    this.recordArtifactAccessAudit(
      {
        actionName: "list_filing_package_evidence",
        resourceType: "filing_package",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
        }),
      },
      requestId,
      identity,
      null,
      policy,
    );
    return items;
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
      await this.completeReportJob(job, requestId);
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

  private async completeReportJob(job: StoredReportJob, requestId?: string) {
    if (job.jobType === "dispatch_recording_index") {
      job.rows = this.buildDispatchRecordingIndexRows();
    }
    if (job.jobType === "daily_dispatch_record") {
      job.rows = await this.buildDailyDispatchRecordRows(job);
    }
    if (job.jobType === "six_month_operations_summary") {
      job.rows = await this.buildSixMonthOperationsSummaryRows(job);
    }
    if (job.jobType === "monthly_trip_report") {
      job.rows = this.buildTenantMonthlyTripRows(job, requestId);
    }
    if (job.jobType === "revenue_summary") {
      job.partnerRevenueRows = this.buildPartnerRevenueSummaryRows();
    }

    const artifactPayload = {
      jobId: job.jobId,
      jobType: job.jobType,
      format: job.format,
      filters: job.filters,
      rows: job.rows,
      partnerRevenueRows: job.partnerRevenueRows,
      settlementMatrix: buildSettlementMatrix(),
    };
    job.settlementMatrix = buildSettlementMatrix();
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
        tenantId: this.getReportJobTenantScopeId(job),
        moduleName: "reporting-filing",
        actionName: "complete_report_job",
        resourceType: "report_job",
        resourceId: job.jobId,
        newValuesSummary: {
          jobType: job.jobType,
          status: job.status,
          artifactId: job.artifact.artifactId,
          artifactExpiresAt: job.artifact.expiresAt,
          tenantId: this.getReportJobTenantScopeId(job),
          rowCount: job.rows.length,
          partnerRevenueRowCount: job.partnerRevenueRows.length,
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
        tenantId: this.getReportJobTenantScopeId(job),
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
        callId: maskOpaqueToken(order.callId, 8, 4),
        recordingId: maskOpaqueToken(order.recordingId, 8, 4),
        missingRecording:
          order.recordingId === null ||
          order.complianceFlags.includes("recording_pending"),
        exportedAt,
      }));
  }

  private async buildDailyDispatchRecordRows(job: StoredReportJob) {
    const filters = this.extractDailyDispatchRecordFilters(job.filters);
    const rows = await this.dailyDispatchRecordProvider(filters);
    return rows.map((row) => ({ ...row }));
  }

  private async buildSixMonthOperationsSummaryRows(job: StoredReportJob) {
    const filters = this.extractSixMonthOperationsSummaryFilters(job.filters);
    const rows = await this.sixMonthOperationsSummaryProvider(filters);
    return rows.map((row) => ({
      ...row,
      complaintsByCategory: { ...row.complaintsByCategory },
    }));
  }

  private buildTenantMonthlyTripRows(
    job: StoredReportJob,
    requestId?: string,
  ): TenantMonthlyTripReportRow[] {
    const exportedAt = new Date().toISOString();
    const filterString = (camelKey: string, snakeKey: string) => {
      const value = job.filters[camelKey] ?? job.filters[snakeKey];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const tenantId = filterString("tenantId", "tenant_id");
    const orderId = filterString("orderId", "order_id");
    const userId = filterString("userId", "user_id");
    const costCenterCode = filterString("costCenterCode", "cost_center_code");
    const serviceProduct = filterString("serviceProduct", "service_product");
    const costCentersByTenant = new Map<
      string,
      Map<string, TenantCostCenterRecord>
    >();
    const lookupCostCenter = (order: OwnedOrderRecord) => {
      if (!order.tenantId || !order.costCenter) {
        return null;
      }
      let costCentersByCode = costCentersByTenant.get(order.tenantId);
      if (!costCentersByCode) {
        costCentersByCode = new Map(
          this.costCenterDirectoryProvider(order.tenantId).map((costCenter) => [
            costCenter.code.toUpperCase(),
            costCenter,
          ]),
        );
        costCentersByTenant.set(order.tenantId, costCentersByCode);
      }
      return costCentersByCode.get(order.costCenter.toUpperCase()) ?? null;
    };

    return this.orderFeedProvider()
      .map((order) => {
        const resolvedServiceProduct =
          order.businessDispatchSubtype ?? "enterprise_dispatch";
        const costCenter = lookupCostCenter(order);
        return { order, resolvedServiceProduct, costCenter };
      })
      .filter(({ order, resolvedServiceProduct, costCenter }) => {
        if (tenantId && order.tenantId !== tenantId) {
          return false;
        }
        if (orderId && order.orderId !== orderId) {
          return false;
        }
        if (
          costCenterCode &&
          (order.costCenter ?? "").toUpperCase() !==
            costCenterCode.toUpperCase()
        ) {
          return false;
        }
        if (serviceProduct && resolvedServiceProduct !== serviceProduct) {
          return false;
        }
        if (userId && costCenter?.ownerUserId !== userId) {
          return false;
        }
        return true;
      })
      .map(({ order, resolvedServiceProduct, costCenter }) => ({
        orderId: order.orderId,
        orderNo: order.orderNo,
        tenantId: order.tenantId,
        userId: costCenter?.ownerUserId ?? null,
        costCenterCode: order.costCenter,
        serviceProduct: resolvedServiceProduct,
        businessDispatchSubtype: order.businessDispatchSubtype,
        bookingId: order.bookingId,
        status: order.status,
        completedAt: order.status === "completed" ? order.updatedAt : null,
        sourceMarker: "owned_mobility_order_feed",
        costCenterSourceMarker: costCenter
          ? "tenant_partner_cost_center_directory"
          : null,
        sourceUpdatedAt: order.updatedAt,
        producerRequestId: requestId ?? null,
        exportedAt,
      }));
  }

  private extractDailyDispatchRecordFilters(
    filters: Record<string, unknown>,
  ): DailyDispatchRecordQuery {
    const readText = (key: string) => {
      const value = filters[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const query: DailyDispatchRecordQuery = {};
    const serviceDate = readText("serviceDate");
    const serviceDateFrom = readText("serviceDateFrom");
    const serviceDateTo = readText("serviceDateTo");
    const orderId = readText("orderId");
    const orderSource = readText("orderSource");
    const tenantId = readText("tenantId");
    const partnerId = readText("partnerId");
    const serviceProductCode = readText("serviceProductCode");
    const finalStatus = readText("finalStatus");

    if (serviceDate) {
      query.serviceDate = serviceDate;
    }
    if (serviceDateFrom) {
      query.serviceDateFrom = serviceDateFrom;
    }
    if (serviceDateTo) {
      query.serviceDateTo = serviceDateTo;
    }
    if (orderId) {
      query.orderId = orderId;
    }
    if (orderSource) {
      query.orderSource = orderSource;
    }
    if (tenantId) {
      query.tenantId = tenantId;
    }
    if (partnerId) {
      query.partnerId = partnerId;
    }
    if (serviceProductCode) {
      query.serviceProductCode = serviceProductCode;
    }
    if (finalStatus) {
      query.finalStatus = finalStatus;
    }

    return query;
  }

  private extractSixMonthOperationsSummaryFilters(
    filters: Record<string, unknown>,
  ) {
    const readText = (key: string) => {
      const value = filters[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const query: {
      from?: string;
      to?: string;
      businessArea?: string;
      serviceProductCode?: string;
    } = {};
    const from = readText("from");
    const to = readText("to");
    const businessArea = readText("businessArea");
    const serviceProductCode = readText("serviceProductCode");

    if (from) {
      query.from = from;
    }
    if (to) {
      query.to = to;
    }
    if (businessArea) {
      query.businessArea = businessArea;
    }
    if (serviceProductCode) {
      query.serviceProductCode = serviceProductCode;
    }

    return query;
  }

  private buildPartnerRevenueSummaryRows(): PartnerRevenueSummaryRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.orderFeedProvider()
      .filter(
        (order) =>
          order.serviceBucket === "business_dispatch" &&
          order.businessDispatchSubtype === "credit_card_airport_transfer" &&
          order.partnerId &&
          order.partnerEntrySlug,
      )
      .map((order) => ({
        orderId: order.orderId,
        orderNo: order.orderNo,
        tenantId: order.tenantId,
        costCenterCode: order.costCenter,
        costCenterName: null,
        ownerUserId: null,
        activeFlag: null,
        legacy_unmapped: false,
        partnerId: order.partnerId!,
        partnerProgramId: order.partnerProgramId,
        partnerEntrySlug: order.partnerEntrySlug!,
        eligibilityVerificationId: order.eligibilityVerificationId,
        issuerAuthorizationRef: maskOpaqueToken(
          order.issuerAuthorizationRef,
          8,
          4,
        ),
        benefitReference: maskOpaqueToken(order.benefitReference, 8, 4),
        businessDispatchSubtype: order.businessDispatchSubtype!,
        status: order.status,
        amount: order.quotedFare ?? {
          currency: "NTD",
          amountMinor: 0,
        },
        completedAt: order.status === "completed" ? order.updatedAt : null,
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
      partnerRevenueRows: (job.partnerRevenueRows ?? []).map((row) => ({
        ...row,
        amount: { ...row.amount },
      })),
      settlementMatrix: (job.settlementMatrix ?? []).map((row) => ({
        ...row,
        orderSources: [...row.orderSources],
        reportingArtifacts: [...row.reportingArtifacts],
      })),
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
      partnerRevenueRows: (job.partnerRevenueRows ?? []).map((row) => ({
        ...row,
        amount: { ...row.amount },
      })),
      settlementMatrix: (job.settlementMatrix ?? []).map((row) => ({
        ...row,
        orderSources: [...row.orderSources],
        reportingArtifacts: [...row.reportingArtifacts],
      })),
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

  private getReportJobTenantScopeId(job: StoredReportJob) {
    return typeof job.filters.tenantId === "string"
      ? job.filters.tenantId
      : null;
  }

  private assertReportJobTenantScope(
    job: StoredReportJob,
    tenantScopeId: string,
  ) {
    if (this.getReportJobTenantScopeId(job) === tenantScopeId) {
      return;
    }
    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "REPORT_JOB_TENANT_SCOPE_FORBIDDEN",
      "The requested report job is not available for this tenant scope.",
      {
        jobId: job.jobId,
        tenantId: tenantScopeId,
      },
    );
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

  private recordArtifactAccessAudit(
    input: Pick<
      AuditLogRecord,
      "actionName" | "resourceType" | "resourceId" | "newValuesSummary"
    >,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
    tenantId?: string | null,
    policy = assertEvidenceAccess({
      family:
        input.resourceType === "filing_package"
          ? "filing_package"
          : "report_artifact",
      identity,
      tenantId,
    }),
  ) {
    const hasPolicySummary =
      input.newValuesSummary &&
      typeof input.newValuesSummary === "object" &&
      "evidenceFamily" in input.newValuesSummary;
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: tenantId ?? identity?.tenantId ?? null,
        moduleName: "reporting-filing",
        actionName: input.actionName,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ...(input.newValuesSummary
          ? {
              newValuesSummary: {
                ...(hasPolicySummary
                  ? {}
                  : buildEvidenceAccessAuditSummary(policy, "download")),
                ...input.newValuesSummary,
              },
            }
          : {}),
      },
      requestId,
    );
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
