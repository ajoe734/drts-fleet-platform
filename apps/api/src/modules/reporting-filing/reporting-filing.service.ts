import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  ComplaintCaseDetailRowRecord,
  DispatchRecordingIndexRowRecord,
  ComplaintCaseRecord,
  MaintenanceRecord,
  ContractRosterRowRecord,
  DriverRegistryRecord,
  DriverRosterRowRecord,
  FareVersionHistoryRowRecord,
  IncidentRecord,
  IncidentRegisterRowRecord,
  MaintenanceOverviewRowRecord,
  InsurancePolicyRecord,
  InsuranceRosterRowRecord,
  MultiTaxiOperatingAuthorizationRecord,
  VehicleContractRecord,
  VehicleMonthlyDeltaEntryRecord,
  VehicleMonthlyDeltaRowRecord,
  VehicleRegistryRecord,
  VehicleRosterRowRecord,
  CreateMultiTaxiTripOperationalExportJobCommand,
  CreateReportJobCommand,
  DispatchDailyRecord,
  EvidenceSubjectGovernanceRecord,
  FilingPackageAccepted,
  FilingPackageRecord,
  FilingPackageType,
  GenerateFilingPackageCommand,
  MultiTaxiTripOperationalExportDownload,
  MultiTaxiTripOperationalExportJobAccepted,
  MultiTaxiTripOperationalExportJobStatus,
  MultiTaxiTripOperationalExportJobView,
  MultiTaxiTripOperationalExportPreview,
  MultiTaxiTripOperationalExportRow,
  MultiTaxiTripOperationalRecordQuery,
  OwnedOrderRecord,
  PartnerRevenueSummaryRowRecord,
  PackageItemRecord,
  ReportArtifactRecord,
  ReportJobAccepted,
  ReportJobRowRecord,
  ReportOutputFormat,
  ReportJobRecord,
  ReportJobType,
  SettlementMatrixRecord,
  SixMonthOperationsSummary,
  TenantCostCenterRecord,
  TenantMonthlyTripReportRowRecord,
  TripSummaryRowRecord,
} from "@drts/contracts";

import {
  PLATFORM_CURRENCY,
  REGULATORY_REPORT_JOB_TYPES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { recordsToCsv } from "../../common/csv";
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
  type MultiTaxiTripExportJobMetadata,
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
import { recordsToXlsx, recordsToPdf } from "./report-renderers";

type ReportJobView = ReportJobRecord & {
  artifact: ReportArtifactView | null;
  rows?: ReportJobRowRecord[];
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
  rows: ReportJobRowRecord[];
  partnerRevenueRows: PartnerRevenueSummaryRowRecord[];
  settlementMatrix: SettlementMatrixRecord[];
  multiTaxiTripExport?: MultiTaxiTripExportJobMetadata;
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

/**
 * Fills in whatever a completed job of one report type is supposed to carry --
 * `rows` for most, `partnerRevenueRows` for the revenue summary. Returning
 * nothing is not the same as having no builder: see `reportRowBuilders`.
 */
type ReportRowBuilder = (
  job: StoredReportJob,
  requestId?: string,
) => Promise<void> | void;

type VehicleRegistryFeedProvider = () => VehicleRegistryRecord[];
type DriverRegistryFeedProvider = () => DriverRegistryRecord[];
type VehicleContractFeedProvider = () => VehicleContractRecord[];
type InsurancePolicyFeedProvider = () => InsurancePolicyRecord[];
type ComplaintCaseFeedProvider = () => ComplaintCaseRecord[];
type IncidentFeedProvider = () => IncidentRecord[];
type MaintenanceFeedProvider = () => MaintenanceRecord[];
type OperatingAuthorizationFeedProvider =
  () => MultiTaxiOperatingAuthorizationRecord[];

const REGULATORY_REPORT_JOB_TYPE_SET: ReadonlySet<string> = new Set(
  REGULATORY_REPORT_JOB_TYPES,
);

const MULTI_TAXI_TRIP_EXPORT_JOB_TYPE = "multi_taxi_trip_records";
const MULTI_TAXI_TRIP_EXPORT_SCOPE = "multi_taxi_records:export";
const MAX_EXPORT_PURPOSE_LENGTH = 500;
const MAX_EXPORT_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_EXPORT_QUERY_LENGTH = 200;

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

  private vehicleRegistryFeedProvider: VehicleRegistryFeedProvider = () => [];

  private driverRegistryFeedProvider: DriverRegistryFeedProvider = () => [];

  private vehicleContractFeedProvider: VehicleContractFeedProvider = () => [];

  private insurancePolicyFeedProvider: InsurancePolicyFeedProvider = () => [];

  private complaintCaseFeedProvider: ComplaintCaseFeedProvider = () => [];

  private operatingAuthorizationFeedProvider: OperatingAuthorizationFeedProvider =
    () => [];

  private incidentFeedProvider: IncidentFeedProvider = () => [];

  private maintenanceFeedProvider: MaintenanceFeedProvider = () => [];

  /**
   * Every declared report type states here whether it produces anything.
   *
   * This replaces a chain of `if (job.jobType === ...)` with no fallback. A type
   * that matched no branch did not fail: it reached `completed` carrying
   * `rows: []`, a manifest and a checksum, so a caller could not tell "this
   * report was never built" from "no data in this period". `createReportJob`
   * validated only that `jobType` was a non-blank string, so any string at all
   * produced that same convincing empty result.
   *
   * `Record` over `ReportJobType` is the guard that outlives this change: adding
   * a tenth report to the enum without deciding about it here fails to compile.
   * `null` is that decision, made explicitly -- the type is declared but not
   * built, and `createReportJob` rejects it rather than accepting the job.
   */
  private readonly reportRowBuilders: Record<
    ReportJobType,
    ReportRowBuilder | null
  > = {
    // Operational reports.
    trip_summary: (job) => {
      job.rows = this.buildTripSummaryRows(job);
    },
    monthly_trip_report: (job, requestId) => {
      job.rows = this.buildTenantMonthlyTripRows(job, requestId);
    },
    revenue_summary: (job) => {
      job.partnerRevenueRows = this.buildPartnerRevenueSummaryRows();
    },
    incident_register: (job) => {
      job.rows = this.buildIncidentRegisterRows();
    },
    maintenance_overview: (job) => {
      job.rows = this.buildMaintenanceOverviewRows();
    },
    // Rows are built by `createMultiTaxiTripOperationalExportJob`, which is the
    // only way to create one of these: the export needs a purpose and a scope
    // that `createReportJob` has no field for. Rejected there by name.
    multi_taxi_trip_records: () => {},
    daily_dispatch_record: async (job) => {
      job.rows = await this.buildDailyDispatchRecordRows(job);
    },
    six_month_operations_summary: async (job) => {
      job.rows = await this.buildSixMonthOperationsSummaryRows(job);
    },

    // Regulatory reports, PRD 9.10.1.
    vehicle_roster: (job) => {
      job.rows = this.buildVehicleRosterRows();
    },
    driver_roster: (job) => {
      job.rows = this.buildDriverRosterRows();
    },
    contract_roster: (job) => {
      job.rows = this.buildContractRosterRows();
    },
    insurance_roster: (job) => {
      job.rows = this.buildInsuranceRosterRows();
    },
    vehicle_monthly_delta: (job) => {
      job.rows = this.buildVehicleMonthlyDeltaRows(job);
    },
    // PRD 9.10.1 item 6 under its regulatory name. The builder already existed
    // behind the operational job type `six_month_operations_summary`, and
    // `SixMonthOperationsSummary` already carries exactly the four figures the
    // PRD names: 乘客要求派車次數, 派遣次數, 平均可派車輛數, 申訴次數.
    // Two names, one report, one builder -- rather than a second implementation
    // that would drift from the first.
    six_month_statistics: async (job) => {
      job.rows = await this.buildSixMonthOperationsSummaryRows(job);
    },
    fare_version_history: (job) => {
      job.rows = this.buildFareVersionHistoryRows();
    },
    complaint_case_detail: (job) => {
      job.rows = this.buildComplaintCaseDetailRows();
    },
    dispatch_recording_index: (job) => {
      job.rows = this.buildDispatchRecordingIndexRows();
    },
  };

  /**
   * How each declared output format is rendered.
   *
   * `format` used to be decoration: accepted, stored, echoed back, and never
   * read by anything that produced content. Same `Record` guard as the row
   * builders -- a format added to the contract without a renderer fails to
   * compile, and `null` is an explicit "declared, not rendered" that
   * `createReportJob` rejects rather than silently ignoring.
   *
   * csv: synchronous Buffer (same as before).
   * xlsx: async via exceljs (SR-REPORT-001, N05 gap closure).
   * pdf: async via pdfkit (SR-REPORT-001, N05 gap closure).
   * zip: not offered (filing ZIP is explicitly out of scope for general reports).
   */
  private readonly reportArtifactRenderers: Record<
    ReportOutputFormat,
    {
      contentType: string;
      render: (job: StoredReportJob) => Buffer | Promise<Buffer>;
    } | null
  > = {
    csv: {
      contentType: "text/csv; charset=utf-8",
      render: (job) =>
        Buffer.from(
          recordsToCsv(
            (job.rows as unknown as Record<string, unknown>[]) ?? [],
          ),
          "utf8",
        ),
    },
    xlsx: {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      render: (job) =>
        recordsToXlsx(
          (job.rows as unknown as Record<string, unknown>[]) ?? [],
          job.jobType,
        ),
    },
    pdf: {
      contentType: "application/pdf",
      render: (job) =>
        recordsToPdf(
          (job.rows as unknown as Record<string, unknown>[]) ?? [],
          `${job.jobType} - ${job.jobId}`,
        ),
    },
    zip: null,
  };

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
        if (
          job.status === "pending" ||
          job.status === "queued" ||
          job.status === "running"
        ) {
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

  registerVehicleRegistryFeedProvider(provider: VehicleRegistryFeedProvider) {
    this.vehicleRegistryFeedProvider = provider;
  }

  registerDriverRegistryFeedProvider(provider: DriverRegistryFeedProvider) {
    this.driverRegistryFeedProvider = provider;
  }

  registerVehicleContractFeedProvider(provider: VehicleContractFeedProvider) {
    this.vehicleContractFeedProvider = provider;
  }

  registerInsurancePolicyFeedProvider(provider: InsurancePolicyFeedProvider) {
    this.insurancePolicyFeedProvider = provider;
  }

  registerComplaintCaseFeedProvider(provider: ComplaintCaseFeedProvider) {
    this.complaintCaseFeedProvider = provider;
  }

  /**
   * Registered from `MultiTaxiModule`, not from this module's own `imports`.
   * `MultiTaxiModule` already imports `ReportingFilingModule`, so importing it
   * back would be a cycle; the dependency runs one way and the data is pushed.
   */
  registerIncidentFeedProvider(provider: IncidentFeedProvider) {
    this.incidentFeedProvider = provider;
  }

  registerMaintenanceFeedProvider(provider: MaintenanceFeedProvider) {
    this.maintenanceFeedProvider = provider;
  }

  registerOperatingAuthorizationFeedProvider(
    provider: OperatingAuthorizationFeedProvider,
  ) {
    this.operatingAuthorizationFeedProvider = provider;
  }

  registerSixMonthOperationsSummaryProvider(
    provider: SixMonthOperationsSummaryProvider,
  ) {
    this.sixMonthOperationsSummaryProvider = provider;
  }

  previewMultiTaxiTripExport(
    scope: MultiTaxiTripOperationalRecordQuery,
    recordCount: number,
    identity: EvidenceAccessIdentity | null,
    requestId?: string,
  ): MultiTaxiTripOperationalExportPreview {
    const { actorId, policy } = this.assertMultiTaxiTripExportAccess(identity);
    const normalizedScope = this.normalizeMultiTaxiTripExportScope(scope);
    if (!Number.isSafeInteger(recordCount) || recordCount < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_EXPORT_RECORD_COUNT_INVALID",
        "Export preview recordCount must be a non-negative integer.",
      );
    }

    const preview: MultiTaxiTripOperationalExportPreview = {
      scope: normalizedScope,
      recordCount,
      format: "csv",
      purposeRequired: true,
      previewedAt: new Date().toISOString(),
    };
    this.recordArtifactAccessAudit(
      {
        actionName: "preview_multi_taxi_trip_export",
        resourceType: "report_job",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "export", {
          actorId,
          scope: normalizedScope,
          recordCount,
          format: preview.format,
        }),
      },
      requestId,
      identity,
      null,
      policy,
    );
    return preview;
  }

  createMultiTaxiTripExportJob(
    command: CreateMultiTaxiTripOperationalExportJobCommand,
    rows: readonly MultiTaxiTripOperationalExportRow[],
    identity: EvidenceAccessIdentity | null,
    requestId?: string,
  ): MultiTaxiTripOperationalExportJobAccepted {
    const { actorId, policy } = this.assertMultiTaxiTripExportAccess(identity);
    const scope = this.normalizeMultiTaxiTripExportScope(command.scope ?? {});
    const purpose = this.normalizeRequiredText(
      command.purpose,
      "purpose",
      MAX_EXPORT_PURPOSE_LENGTH,
    );
    const idempotencyKey = this.normalizeRequiredText(
      command.idempotencyKey,
      "idempotencyKey",
      MAX_EXPORT_IDEMPOTENCY_KEY_LENGTH,
    );
    const existing = this.reportJobs.find(
      (job) =>
        job.jobType === MULTI_TAXI_TRIP_EXPORT_JOB_TYPE &&
        job.multiTaxiTripExport?.requestedByActorId === actorId &&
        job.multiTaxiTripExport.idempotencyKey === idempotencyKey,
    );

    if (existing) {
      const existingMetadata =
        this.requireMultiTaxiTripExportMetadata(existing);
      if (
        this.stableSerialize(existingMetadata.scope) !==
          this.stableSerialize(scope) ||
        existingMetadata.purpose !== purpose
      ) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "MULTI_TAXI_EXPORT_IDEMPOTENCY_CONFLICT",
          "The idempotency key is already bound to a different export request.",
          {
            jobId: existing.jobId,
          },
        );
      }
      this.recordArtifactAccessAudit(
        {
          actionName: "replay_multi_taxi_trip_export_job",
          resourceType: "report_job",
          resourceId: existing.jobId,
          newValuesSummary: buildEvidenceAccessAuditSummary(policy, "export", {
            actorId,
            status: existing.status,
            recordCount: existingMetadata.recordCount,
          }),
        },
        requestId,
        identity,
        null,
        policy,
      );
      return {
        jobId: existing.jobId,
        status: this.toMultiTaxiTripExportStatus(existing.status),
        idempotentReplay: true,
      };
    }

    const createdAt = new Date().toISOString();
    const metadata: MultiTaxiTripExportJobMetadata = {
      scope,
      purpose,
      idempotencyKey,
      requestedByActorId: actorId,
      recordCount: rows.length,
    };
    const job: StoredReportJob = {
      jobId: `JOB-${randomUUID()}`,
      jobType: MULTI_TAXI_TRIP_EXPORT_JOB_TYPE,
      format: "csv",
      status: "pending",
      filters: { ...scope },
      artifact: null,
      rows: rows.map((row) => ({ ...row })),
      partnerRevenueRows: [],
      settlementMatrix: [],
      multiTaxiTripExport: metadata,
      createdAt,
      updatedAt: createdAt,
    };

    this.reportJobs = [job, ...this.reportJobs];
    this.persistChanges(
      {
        reportJobs: [this.cloneStoredReportJob(job)],
      },
      "queue_multi_taxi_trip_export",
    );
    this.recordArtifactAccessAudit(
      {
        actionName: "create_multi_taxi_trip_export_job",
        resourceType: "report_job",
        resourceId: job.jobId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "export", {
          actorId,
          status: job.status,
          scope,
          purpose,
          recordCount: metadata.recordCount,
          format: job.format,
        }),
      },
      requestId,
      identity,
      null,
      policy,
    );
    this.scheduleReportJobCompletion(job.jobId, requestId);

    return {
      jobId: job.jobId,
      status: "pending",
      idempotentReplay: false,
    };
  }

  getMultiTaxiTripExportJob(
    jobId: string,
    identity: EvidenceAccessIdentity | null,
    requestId?: string,
  ): MultiTaxiTripOperationalExportJobView {
    const { policy } = this.assertMultiTaxiTripExportAccess(identity);
    const job = this.requireMultiTaxiTripExportJob(jobId);
    const view = this.toMultiTaxiTripExportView(job);
    this.recordArtifactAccessAudit(
      {
        actionName: "read_multi_taxi_trip_export_job",
        resourceType: "report_job",
        resourceId: job.jobId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "read", {
          status: view.status,
          recordCount: view.recordCount,
          downloadAvailable: view.downloadAvailable,
        }),
      },
      requestId,
      identity,
      null,
      policy,
    );
    return view;
  }

  issueMultiTaxiTripExportDownload(
    jobId: string,
    identity: EvidenceAccessIdentity | null,
    requestId?: string,
  ): MultiTaxiTripOperationalExportDownload {
    const { policy } = this.assertMultiTaxiTripExportAccess(identity);
    const job = this.requireMultiTaxiTripExportJob(jobId);
    const metadata = this.requireMultiTaxiTripExportMetadata(job);
    if (job.status !== "completed" || !job.artifact) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MULTI_TAXI_EXPORT_NOT_READY",
        "The export is not ready for download.",
        {
          jobId,
          status: job.status,
        },
      );
    }

    const download = createControlledDownloadMetadata({
      kind: "multi-taxi-trip-records",
      subjectId: job.artifact.artifactId,
      manifestHash: job.artifact.manifestHash,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });
    this.recordArtifactAccessAudit(
      {
        actionName: "issue_multi_taxi_trip_export_download",
        resourceType: "report_artifact",
        resourceId: job.artifact.artifactId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "download", {
          jobId,
          recordCount: metadata.recordCount,
          manifestHash: job.artifact.manifestHash,
          expiresAt: download.expiresAt,
          ttlMinutes: download.ttlMinutes,
        }),
      },
      requestId,
      identity,
      null,
      policy,
    );
    return {
      jobId,
      recordCount: metadata.recordCount,
      manifestHash: job.artifact.manifestHash,
      download,
    };
  }

  /**
   * Refuses a report that would succeed empty.
   *
   * This is a deliberate, visible behaviour change for the types that have no
   * builder: they used to return a queued job, then a completed one with zero
   * rows and a valid checksum. An error naming the report is safer than a
   * result that looks real, and it stops anyone building on numbers that were
   * never computed.
   */
  private assertReportTypeProducesRows(jobType: string) {
    if (jobType === MULTI_TAXI_TRIP_EXPORT_JOB_TYPE) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REPORT_TYPE_REQUIRES_DEDICATED_ENDPOINT",
        "Multi-taxi trip records are exported through the dedicated export endpoint, which records the access purpose this endpoint has no field for.",
        { jobType },
      );
    }
    if (!Object.hasOwn(this.reportRowBuilders, jobType)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REPORT_TYPE_UNKNOWN",
        `Unknown report type "${jobType}".`,
        { jobType, supportedJobTypes: this.listImplementedReportTypes() },
      );
    }
    if (!this.reportRowBuilders[jobType as ReportJobType]) {
      throw new ApiRequestError(
        HttpStatus.NOT_IMPLEMENTED,
        "REPORT_TYPE_NOT_IMPLEMENTED",
        `Report "${jobType}" is declared but not implemented. It would return an empty result indistinguishable from a period with no data.`,
        { jobType, supportedJobTypes: this.listImplementedReportTypes() },
      );
    }
  }

  /**
   * PRD 9.10.1 reports describe the operator's fleet to 公路主管機關, not one
   * tenant's slice of it. Their sources are the regulatory registry and the
   * complaint case book, none of which carry a tenant: `VehicleRegistryRecord`
   * has no `tenantId` to filter on, so a roster produced for a tenant would be
   * every tenant's data.
   *
   * `POST /tenant/reports/jobs` accepts realm `tenant`, and the tenant scope is
   * stamped into `filters.tenantId`, which is what job listing filters on. A
   * tenant could therefore create one of these and then read it back. That was
   * already reachable for `dispatch_recording_index`, the one regulatory report
   * that had a builder -- its rows are every phone order on the platform.
   */
  private assertReportTypeIsAvailableToScope(
    jobType: string,
    tenantScopeId: string | null,
  ) {
    if (!tenantScopeId || !REGULATORY_REPORT_JOB_TYPE_SET.has(jobType)) {
      return;
    }
    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "REPORT_TYPE_NOT_TENANT_SCOPED",
      `Report "${jobType}" is a platform-wide regulatory report and cannot be produced within a tenant scope.`,
      { jobType, tenantId: tenantScopeId },
    );
  }

  /**
   * Renders a completed report and returns the bytes.
   *
   * The access checks are the same ones `getReportJob` applies -- tenant scope,
   * then evidence-access policy -- because handing over the file is a stronger
   * act than describing it, not a weaker one, and the audit trail records the
   * download rather than the intent to download.
   */
  async renderReportArtifact(
    jobId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
    tenantScopeId?: string | null,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const job = this.requireGenericReportJob(jobId);
    const normalizedTenantScopeId = tenantScopeId?.trim() || null;
    if (normalizedTenantScopeId) {
      this.assertReportJobTenantScope(job, normalizedTenantScopeId);
    }
    assertEvidenceAccess({
      family: "report_artifact",
      identity,
      tenantId: normalizedTenantScopeId,
    });

    if (job.status !== "completed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REPORT_ARTIFACT_NOT_READY",
        `Report job ${jobId} is ${job.status}; there is nothing to download yet.`,
        { jobId, status: job.status },
      );
    }

    const renderer = this.reportArtifactRenderers[job.format];
    if (!renderer) {
      // Reachable only for a job created before its format was declared
      // unrendered; new jobs are rejected at creation.
      throw new ApiRequestError(
        HttpStatus.NOT_IMPLEMENTED,
        "REPORT_FORMAT_NOT_IMPLEMENTED",
        `Report format "${job.format}" has no renderer.`,
        { jobId, format: job.format },
      );
    }

    const buffer = await renderer.render(job);
    this.recordArtifactAccessAudit(
      {
        actionName: "download_report_artifact",
        resourceType: "report_artifact",
        resourceId: job.artifact?.artifactId ?? null,
        newValuesSummary: {
          jobId: job.jobId,
          jobType: job.jobType,
          format: job.format,
          rowCount: job.rows.length,
          byteLength: buffer.byteLength,
          tenantId: normalizedTenantScopeId,
        },
      },
      requestId,
      identity,
      normalizedTenantScopeId,
    );

    return {
      buffer,
      contentType: renderer.contentType,
      fileName: `${job.jobType}-${job.jobId}.${job.format}`,
    };
  }

  private assertReportFormatRenders(format: string) {
    if (!Object.hasOwn(this.reportArtifactRenderers, format)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REPORT_FORMAT_UNKNOWN",
        `Unknown report format "${format}".`,
        { format, supportedFormats: this.listRenderableFormats() },
      );
    }
    if (!this.reportArtifactRenderers[format as ReportOutputFormat]) {
      throw new ApiRequestError(
        HttpStatus.NOT_IMPLEMENTED,
        "REPORT_FORMAT_NOT_IMPLEMENTED",
        `Report format "${format}" is declared but has no renderer, so the export would produce no file.`,
        { format, supportedFormats: this.listRenderableFormats() },
      );
    }
  }

  private listRenderableFormats(): string[] {
    return Object.entries(this.reportArtifactRenderers)
      .filter(([, renderer]) => renderer !== null)
      .map(([format]) => format)
      .sort();
  }

  private listImplementedReportTypes(): string[] {
    return Object.entries(this.reportRowBuilders)
      .filter(
        ([jobType, builder]) =>
          builder !== null && jobType !== MULTI_TAXI_TRIP_EXPORT_JOB_TYPE,
      )
      .map(([jobType]) => jobType)
      .sort();
  }

  createReportJob(
    command: CreateReportJobCommand,
    requestId?: string,
    tenantScopeId?: string | null,
  ): ReportJobAccepted {
    this.assertNonBlank(command.jobType, "jobType");
    this.assertReportTypeProducesRows(command.jobType);
    this.assertReportFormatRenders(command.format);
    const normalizedTenantScopeId = tenantScopeId?.trim() || null;
    this.assertReportTypeIsAvailableToScope(
      command.jobType,
      normalizedTenantScopeId,
    );
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
      .filter((job) => job.jobType !== MULTI_TAXI_TRIP_EXPORT_JOB_TYPE)
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
    const job = this.requireGenericReportJob(jobId);
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
    if (
      !job ||
      (job.status !== "pending" &&
        job.status !== "queued" &&
        job.status !== "running")
    ) {
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
    // A job persisted before the builder registry existed can still carry an
    // unimplemented type. Those complete empty as they always did; the guard
    // that stops new ones is in `createReportJob`, not here.
    const buildRows = this.reportRowBuilders[job.jobType as ReportJobType];
    if (buildRows) {
      await buildRows(job, requestId);
    }

    const artifactPayload =
      job.jobType === MULTI_TAXI_TRIP_EXPORT_JOB_TYPE
        ? {
            jobId: job.jobId,
            jobType: job.jobType,
            format: job.format,
            filters: job.filters,
            purpose: this.requireMultiTaxiTripExportMetadata(job).purpose,
            recordCount:
              this.requireMultiTaxiTripExportMetadata(job).recordCount,
            rows: job.rows,
          }
        : {
            jobId: job.jobId,
            jobType: job.jobType,
            format: job.format,
            filters: job.filters,
            rows: job.rows,
            partnerRevenueRows: job.partnerRevenueRows,
            settlementMatrix: buildSettlementMatrix(),
          };
    job.settlementMatrix =
      job.jobType === MULTI_TAXI_TRIP_EXPORT_JOB_TYPE
        ? []
        : buildSettlementMatrix();
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

  // PRD 9.10.1 items 1-4 and 8. Each is a projection of live registry state:
  // the regulator asks what the fleet looks like now, not what a nightly job
  // captured. `exportedAt` is stamped once per report so every row in one
  // export agrees on when it was taken.

  private buildVehicleRosterRows(): VehicleRosterRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.vehicleRegistryFeedProvider().map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      plateNo: vehicle.plateNo,
      licenseType: vehicle.licenseType ?? null,
      operatingArea: vehicle.operatingArea,
      supportedServiceBuckets: [...vehicle.supportedServiceBuckets],
      dispatchableFlag: vehicle.dispatchableFlag,
      exclusivityApproved: vehicle.exclusivityApproved,
      insuranceStatus: vehicle.insuranceStatus,
      supplyLifecycleStatus: vehicle.supplyLifecycle.dispatch.eligible
        ? "dispatchable"
        : "blocked",
      blockedReasons: [...vehicle.supplyLifecycle.dispatch.blockedReasons],
      updatedAt: vehicle.updatedAt,
      exportedAt,
    }));
  }

  private buildDriverRosterRows(): DriverRosterRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.driverRegistryFeedProvider().map((driver) => ({
      driverId: driver.driverId,
      name: driver.name,
      supportedServiceBuckets: [...driver.supportedServiceBuckets],
      workState: driver.workState,
      lifecycleStatus: driver.lifecycleStatus,
      licensesValid: driver.licensesValid,
      dispatchEligible: driver.dispatchEligible,
      eligibilityBlockedReasons: [...driver.eligibilityBlockedReasons],
      createdAt: driver.createdAt,
      activatedAt: driver.activatedAt,
      suspendedAt: driver.suspendedAt,
      retiredAt: driver.retiredAt,
      exportedAt,
    }));
  }

  private buildContractRosterRows(): ContractRosterRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.vehicleContractFeedProvider().map((contract) => ({
      contractId: contract.contractId,
      vehicleId: contract.vehicleId,
      partnerId: contract.partnerId,
      partnerType: contract.partnerType,
      contractType: contract.contractType,
      operatingAreaId: contract.operatingAreaId,
      serviceScope: contract.serviceScope,
      startAt: contract.startAt,
      endAt: contract.endAt,
      status: contract.status,
      lifecycleStatus: contract.lifecycleStatus,
      approvedBy: contract.approvedBy,
      approvedAt: contract.approvedAt,
      exportedAt,
    }));
  }

  private buildInsuranceRosterRows(): InsuranceRosterRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.insurancePolicyFeedProvider().map((policy) => ({
      policyId: policy.policyId,
      vehicleId: policy.vehicleId,
      policyNo: policy.policyNo,
      insuranceType: policy.insuranceType,
      insurerName: policy.insurerName,
      coverageAmount: policy.coverageAmount,
      startAt: policy.startAt,
      endAt: policy.endAt,
      status: policy.status,
      lifecycleStatus: policy.lifecycleStatus,
      exportedAt,
    }));
  }

  private buildComplaintCaseDetailRows(): ComplaintCaseDetailRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.complaintCaseFeedProvider().map((complaintCase) => ({
      caseNo: complaintCase.caseNo,
      caseSource: complaintCase.caseSource,
      category: complaintCase.category,
      severity: complaintCase.severity,
      status: complaintCase.status,
      description: complaintCase.description,
      relatedOrderId: complaintCase.relatedOrderId,
      // Masked for the same reason the dispatch recording index masks it: the
      // report is an index of what exists, and a call id is the key to a
      // recording rather than a fact about the complaint.
      relatedCallId: maskOpaqueToken(complaintCase.relatedCallId, 8, 4),
      relatedIncidentId: complaintCase.relatedIncidentId,
      assigneeId: complaintCase.assigneeId,
      slaDueAt: complaintCase.slaDueAt,
      slaBreach: complaintCase.slaBreach,
      reopenCount: complaintCase.reopenCount,
      resolutionCode: complaintCase.resolutionCode,
      closingNote: complaintCase.closingNote,
      createdAt: complaintCase.createdAt,
      updatedAt: complaintCase.updatedAt,
      exportedAt,
    }));
  }

  /**
   * PRD 9.10.1 item 7, 收費標準版本歷程.
   *
   * The history is already in the data, held as a set of rows rather than a
   * versioned column: `reg.multi_taxi_operating_authorizations` is unique on
   * (operator, authority code, business plan version), and an authorization is
   * only editable while `draft`. Publishing a new fare version therefore means
   * a new authorization row, each carrying its own fare version and effective
   * window. Reporting the history is reading them in order.
   */
  /**
   * PRD 9.10.1 item 5, 每月車輛增減月報.
   *
   * A vehicle is *added* in the month it entered the registry (`createdAt`) and
   * *removed* in the month its offboarding took effect. Removal reads
   * `supplyLifecycle.offboarding`, which already records `effectiveAt`,
   * `completedAt` and a reason -- offboarding is the act of taking a vehicle
   * out of the fleet, and it is the only one.
   *
   * It deliberately does **not** read `dispatchableFlag`. That flag is
   * effective dispatchability, and it drops whenever insurance lapses, a
   * contract expires or an operator sets a manual hold -- all of which recover.
   * Counting those as 減車 would report a fleet shrinking and growing every
   * time a policy renewed late, which is a different and much larger number
   * than the one the regulator is asking for.
   */
  private buildVehicleMonthlyDeltaRows(
    job: StoredReportJob,
  ): VehicleMonthlyDeltaRowRecord[] {
    const exportedAt = new Date().toISOString();
    const monthFilter = this.extractMonthFilter(job.filters);
    const vehicles = this.vehicleRegistryFeedProvider();

    const added = new Map<string, VehicleMonthlyDeltaEntryRecord[]>();
    const removed = new Map<string, VehicleMonthlyDeltaEntryRecord[]>();
    const push = (
      bucket: Map<string, VehicleMonthlyDeltaEntryRecord[]>,
      month: string,
      entry: VehicleMonthlyDeltaEntryRecord,
    ) => {
      const entries = bucket.get(month);
      if (entries) {
        entries.push(entry);
        return;
      }
      bucket.set(month, [entry]);
    };

    for (const vehicle of vehicles) {
      const joinedAt = vehicle.createdAt;
      if (joinedAt) {
        push(added, joinedAt.slice(0, 7), {
          vehicleId: vehicle.vehicleId,
          plateNo: vehicle.plateNo,
          occurredAt: joinedAt,
          reason: null,
        });
      }

      const offboarding = vehicle.supplyLifecycle.offboarding;
      // `requested` means somebody started the paperwork; the vehicle is out of
      // the fleet once offboarding takes effect or completes, so a pending
      // request is not counted until then.
      const leftAt =
        offboarding.status === "completed"
          ? (offboarding.effectiveAt ?? offboarding.completedAt)
          : null;
      if (leftAt) {
        push(removed, leftAt.slice(0, 7), {
          vehicleId: vehicle.vehicleId,
          plateNo: vehicle.plateNo,
          occurredAt: leftAt,
          reason: offboarding.reason,
        });
      }
    }

    const months = [...new Set([...added.keys(), ...removed.keys()])]
      .filter((month) => !monthFilter || month === monthFilter)
      .sort();

    let closingCount = 0;
    const rowsInOrder: VehicleMonthlyDeltaRowRecord[] = [];
    // Closing count is cumulative, so it is computed over every month present
    // and only then narrowed to the requested one -- a single-month report must
    // not restart the running total at zero.
    for (const month of [
      ...new Set([...added.keys(), ...removed.keys()]),
    ].sort()) {
      const addedEntries = added.get(month) ?? [];
      const removedEntries = removed.get(month) ?? [];
      closingCount += addedEntries.length - removedEntries.length;
      if (!months.includes(month)) {
        continue;
      }
      rowsInOrder.push({
        periodMonth: month,
        addedCount: addedEntries.length,
        removedCount: removedEntries.length,
        netChange: addedEntries.length - removedEntries.length,
        closingCount,
        added: [...addedEntries].sort((left, right) =>
          left.occurredAt.localeCompare(right.occurredAt),
        ),
        removed: [...removedEntries].sort((left, right) =>
          left.occurredAt.localeCompare(right.occurredAt),
        ),
        exportedAt,
      });
    }

    return rowsInOrder;
  }

  /** `filters.month` / `filters.period_month`, as `YYYY-MM`. */
  private extractMonthFilter(filters: Record<string, unknown>): string | null {
    for (const key of ["month", "periodMonth", "period_month"]) {
      const value = filters[key];
      if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value.trim())) {
        return value.trim();
      }
    }
    return null;
  }

  /**
   * An aggregate, deliberately. `monthly_trip_report` already lists orders one
   * per row; a summary that is a listing under another name would be a second
   * thing to maintain for no answer the first does not already give.
   */
  private buildTripSummaryRows(job: StoredReportJob): TripSummaryRowRecord[] {
    const exportedAt = new Date().toISOString();
    const from = this.extractFilterText(job.filters, [
      "from",
      "periodStart",
      "period_start",
    ]);
    const to = this.extractFilterText(job.filters, [
      "to",
      "periodEnd",
      "period_end",
    ]);
    const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
    const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;

    const byProduct = new Map<string, TripSummaryRowRecord>();
    for (const order of this.orderFeedProvider()) {
      const stamp = Date.parse(order.createdAt);
      if (!Number.isNaN(stamp) && (stamp < fromMs || stamp > toMs)) {
        continue;
      }
      const key = order.serviceProductCode ?? "unknown";
      const row =
        byProduct.get(key) ??
        ({
          serviceProduct: key,
          from,
          to,
          totalOrders: 0,
          completedTrips: 0,
          cancelledOrders: 0,
          inFlightOrders: 0,
          completionRate: null,
          exportedAt,
        } satisfies TripSummaryRowRecord);

      row.totalOrders += 1;
      if (order.status === "completed") {
        row.completedTrips += 1;
      } else if (order.status === "cancelled") {
        row.cancelledOrders += 1;
      } else {
        row.inFlightOrders += 1;
      }
      byProduct.set(key, row);
    }

    return [...byProduct.values()]
      .map((row) => ({
        ...row,
        // `null` rather than 0 when nothing happened: a rate of zero says every
        // trip failed, which is a different claim from having no trips.
        completionRate:
          row.totalOrders === 0
            ? null
            : Number((row.completedTrips / row.totalOrders).toFixed(4)),
      }))
      .sort((left, right) =>
        left.serviceProduct.localeCompare(right.serviceProduct),
      );
  }

  private buildIncidentRegisterRows(): IncidentRegisterRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.incidentFeedProvider().map((incident) => ({
      incidentId: incident.incidentId,
      title: incident.title,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      relatedOrderId: incident.relatedOrderId,
      relatedVehicleId: incident.relatedVehicleId,
      relatedDriverId: incident.relatedDriverId,
      relatedComplaintCaseNo: incident.relatedComplaintCaseNo,
      reportedBy: incident.reportedBy,
      assignedTo: incident.assignedTo,
      occurredAt: incident.occurredAt,
      location: incident.location,
      resolutionNote: incident.resolutionNote,
      serviceRecoveryActionCount: incident.serviceRecoveryActions.length,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      exportedAt,
    }));
  }

  private buildMaintenanceOverviewRows(): MaintenanceOverviewRowRecord[] {
    const exportedAt = new Date().toISOString();
    const now = Date.now();
    return this.maintenanceFeedProvider().map((record) => {
      // Overdue is the reason anybody opens a maintenance overview, and it is
      // not stored: it is scheduled-and-not-done measured against now.
      const scheduled = record.scheduledAt
        ? Date.parse(record.scheduledAt)
        : Number.NaN;
      const overdueDays =
        record.completedAt || Number.isNaN(scheduled) || scheduled >= now
          ? null
          : Math.floor((now - scheduled) / 86_400_000);

      return {
        maintenanceId: record.maintenanceId,
        vehicleId: record.vehicleId,
        type: record.type,
        status: record.status,
        description: record.description,
        scheduledAt: record.scheduledAt,
        completedAt: record.completedAt,
        overdueDays,
        technician: record.technician,
        cost: record.cost,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        exportedAt,
      };
    });
  }

  private extractFilterText(
    filters: Record<string, unknown>,
    keys: readonly string[],
  ): string | null {
    for (const key of keys) {
      const value = filters[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private buildFareVersionHistoryRows(): FareVersionHistoryRowRecord[] {
    const exportedAt = new Date().toISOString();
    return this.operatingAuthorizationFeedProvider()
      .map((authorization) => ({
        authorizationId: authorization.authorizationId,
        operatorId: authorization.operatorId,
        authorityCode: authorization.authorityCode,
        businessPlanVersion: authorization.businessPlanVersion,
        fareVersionId: authorization.activeFareVersionId,
        status: authorization.status,
        serviceAreaCodes: [...authorization.serviceAreaCodes],
        effectiveFrom: authorization.effectiveFrom,
        effectiveUntil: authorization.effectiveUntil,
        createdAt: authorization.createdAt,
        updatedAt: authorization.updatedAt,
        exportedAt,
      }))
      .sort((left, right) =>
        left.effectiveFrom === right.effectiveFrom
          ? left.businessPlanVersion.localeCompare(right.businessPlanVersion)
          : left.effectiveFrom.localeCompare(right.effectiveFrom),
      );
  }

  private buildDispatchRecordingIndexRows(): DispatchRecordingIndexRowRecord[] {
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
  ): TenantMonthlyTripReportRowRecord[] {
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
          currency: PLATFORM_CURRENCY,
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
    // `downloadMetadata` stays the signed governance record it always was. What
    // changes is `downloadUrl`, which callers and both consoles render as a
    // link: for a report it now addresses the route that streams the file
    // instead of `downloads.drts.local`, which does not resolve and which no
    // controller serves. A filing package still has no bytes by decision
    // (SD-DP-20260820-012), so its link is unchanged and still goes nowhere.
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
      downloadUrl:
        artifactType === "report"
          ? `/reports/${encodeURIComponent(subjectId)}/artifact`
          : downloadMetadata.downloadUrl,
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
      jobId: job.jobId,
      jobType: job.jobType,
      format: job.format,
      status: job.status,
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
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private cloneStoredReportJob(job: StoredReportJob): StoredReportJob {
    return {
      ...job,
      filters: { ...job.filters },
      ...(job.multiTaxiTripExport
        ? {
            multiTaxiTripExport: {
              ...job.multiTaxiTripExport,
              scope: { ...job.multiTaxiTripExport.scope },
            },
          }
        : {}),
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

  /**
   * `reports:read` never grants P5 access -- generic list/get/artifact routes
   * must not become a side door into `multi_taxi_records:export` rows. The
   * dedicated multi-taxi endpoints (`getMultiTaxiTripExportJob`,
   * `issueMultiTaxiTripExportDownload`) are the only path to that job type, so
   * a generic caller sees it as absent, matching the creation-time rejection
   * in `assertReportTypeProducesRows`.
   */
  private requireGenericReportJob(jobId: string) {
    const job = this.requireReportJob(jobId);
    if (job.jobType === MULTI_TAXI_TRIP_EXPORT_JOB_TYPE) {
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

  private requireMultiTaxiTripExportJob(jobId: string) {
    const job = this.requireReportJob(jobId);
    if (
      job.jobType !== MULTI_TAXI_TRIP_EXPORT_JOB_TYPE ||
      !job.multiTaxiTripExport
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "MULTI_TAXI_EXPORT_JOB_NOT_FOUND",
        "Multi-taxi trip export job was not found.",
        {
          jobId,
        },
      );
    }
    return job;
  }

  private requireMultiTaxiTripExportMetadata(job: StoredReportJob) {
    if (!job.multiTaxiTripExport) {
      throw new Error(
        `Report job ${job.jobId} is missing multi-taxi export metadata.`,
      );
    }
    return job.multiTaxiTripExport;
  }

  private toMultiTaxiTripExportView(
    job: StoredReportJob,
  ): MultiTaxiTripOperationalExportJobView {
    const metadata = this.requireMultiTaxiTripExportMetadata(job);
    return {
      jobId: job.jobId,
      status: this.toMultiTaxiTripExportStatus(job.status),
      scope: { ...metadata.scope },
      purpose: metadata.purpose,
      recordCount: metadata.recordCount,
      requestedByActorId: metadata.requestedByActorId,
      downloadAvailable: job.status === "completed" && Boolean(job.artifact),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private toMultiTaxiTripExportStatus(
    status: ReportJobRecord["status"],
  ): MultiTaxiTripOperationalExportJobStatus {
    if (status === "queued") {
      return "pending";
    }
    if (
      status === "pending" ||
      status === "running" ||
      status === "completed" ||
      status === "failed"
    ) {
      return status;
    }
    throw new Error(`Unsupported multi-taxi export job status: ${status}`);
  }

  private assertMultiTaxiTripExportAccess(
    identity: EvidenceAccessIdentity | null,
  ) {
    const actorId = identity?.actorId?.trim();
    if (
      identity?.realm !== "platform" ||
      identity.actorType !== "platform_admin" ||
      !actorId ||
      !identity.scopes.includes(MULTI_TAXI_TRIP_EXPORT_SCOPE)
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "MULTI_TAXI_EXPORT_FORBIDDEN",
        "A platform actor with multi_taxi_records:export is required.",
      );
    }
    return {
      actorId,
      policy: assertEvidenceAccess({
        family: "report_artifact",
        identity,
      }),
    };
  }

  private normalizeMultiTaxiTripExportScope(
    scope: MultiTaxiTripOperationalRecordQuery,
  ): MultiTaxiTripOperationalRecordQuery {
    const normalized: MultiTaxiTripOperationalRecordQuery = {};
    const month = scope.month?.trim();
    if (month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "MULTI_TAXI_EXPORT_MONTH_INVALID",
          "Export month must use YYYY-MM.",
        );
      }
      normalized.month = month;
    }
    const query = scope.q?.trim();
    if (query) {
      if (query.length > MAX_EXPORT_QUERY_LENGTH) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "MULTI_TAXI_EXPORT_QUERY_TOO_LONG",
          `Export q must not exceed ${MAX_EXPORT_QUERY_LENGTH} characters.`,
        );
      }
      normalized.q = query;
    }
    return normalized;
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    field: string,
    maxLength: number,
  ) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_EXPORT_FIELD_REQUIRED",
        `${field} is required.`,
        {
          field,
        },
      );
    }
    if (normalized.length > maxLength) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_EXPORT_FIELD_TOO_LONG",
        `${field} must not exceed ${maxLength} characters.`,
        {
          field,
          maxLength,
        },
      );
    }
    return normalized;
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
    if (!(value ?? "").trim()) {
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
