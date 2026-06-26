import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";

import {
  PHASE2_REGULATORY_REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import type {
  CorrelatedTakeoverCase,
  CreateRegulatoryReportJobCommand,
  GenerateResumeAuthorizationDossierCommand,
  IncidentRecord,
  Phase2RegulatoryReportJobType,
  RegulatoryComplianceSummaryCoverageRecord,
  RegulatoryComplianceSummaryRecord,
  RegulatoryNotificationRecord,
  RegulatoryReportEvidenceTraceRecord,
  RegulatoryReportJobDetailRecord,
  RegulatoryReportJobRecord,
  RegulatoryReportPeriodRecord,
  RegulatoryReportSectionRecord,
  ReportArtifactRecord,
  ReportJobAccepted,
  SandboxControlledEvidenceExportRecord,
  ResumeAuthorizationDossierRecord,
  ResumeAuthorizationDossierSectionRecord,
  ResumeAuthorizationDossierSourceRecord,
  SandboxComplianceSnapshotRecord,
  SandboxKpiBaselineWindowRecord,
  SandboxKpiDashboardRecord,
  SandboxKpiTargetRecord,
  SandboxSafetyGateRecord,
  SandboxLegalHoldRecord,
  TeslaAutonomyTransitionEvent,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  assertEvidenceAccess,
  buildEvidenceAccessAuditSummary,
  type EvidenceAccessIdentity,
} from "../../common/evidence-governance";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
  createControlledDownloadMetadata,
  type ControlledDownloadMetadata,
} from "../reporting-filing/download-signing.util";
import { IncidentService } from "../incident/incident.service";
import { RocOperationsService } from "../roc-operations/roc-operations.service";
import { RegulatoryReportingService } from "./regulatory-reporting.service";
import { ReportingService } from "../reporting/reporting.service";
import type { DailyDispatchRecordQuery } from "../reporting/reporting.repository";
import { SafetyOperatorService } from "../safety-operator/safety-operator.service";
import { SandboxGovernanceService } from "../sandbox-governance/sandbox-governance.service";
import { TeslaIntegrationService } from "../tesla-integration/tesla-integration.service";
import { PlatformAdminComplianceService } from "../platform-admin/platform-admin-compliance.service";

type RegulatoryArtifactView = ReportArtifactRecord & {
  downloadMetadata: ControlledDownloadMetadata;
};

type StoredRegulatoryReportJob = Omit<
  RegulatoryReportJobDetailRecord,
  "artifact" | "evidenceGovernance"
> & {
  artifact: RegulatoryArtifactView | null;
};

type StoredResumeAuthorizationDossier = Omit<
  ResumeAuthorizationDossierRecord,
  "artifact" | "evidenceGovernance"
> & {
  artifact: RegulatoryArtifactView | null;
};

type BuiltRegulatoryReport = {
  rows: Record<string, unknown>[];
  evidenceTrace: RegulatoryReportEvidenceTraceRecord[];
  sections: RegulatoryReportSectionRecord[];
  reportPeriod: RegulatoryReportPeriodRecord;
};

type ExperimentScope = {
  experimentId: string | null;
  asOf: string | null;
  programCode: string | null;
  snapshot: SandboxComplianceSnapshotRecord | null;
  vehicleIds: Set<string>;
};

const INTERNAL_SYSTEM_IDENTITY: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "system",
  actorId: "regulatory-report-jobs-service",
  realm: "system",
  tenantId: null,
  roleFamilies: ["ops"],
  roles: ["system"],
  scopes: [],
  requestId: "regulatory-report-jobs-service",
};

const REGULATORY_REPORT_TYPE_SET = new Set<string>(
  PHASE2_REGULATORY_REPORT_JOB_TYPES,
);
const REPORT_OUTPUT_FORMAT_SET = new Set<string>(REPORT_OUTPUT_FORMATS);

@Injectable()
export class RegulatoryReportJobsService {
  private readonly logger = new Logger(RegulatoryReportJobsService.name);

  private readonly reportJobs: StoredRegulatoryReportJob[] = [];
  private readonly resumeDossiers: StoredResumeAuthorizationDossier[] = [];
  private readonly scheduledReportJobIds = new Set<string>();

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
    private readonly reportingService?: ReportingService,
    @Optional()
    private readonly rocOperationsService?: RocOperationsService,
    @Optional()
    private readonly teslaIntegrationService?: TeslaIntegrationService,
    @Optional()
    private readonly sandboxGovernanceService?: SandboxGovernanceService,
    @Optional()
    private readonly incidentService?: IncidentService,
    @Optional()
    private readonly regulatoryReportingService?: RegulatoryReportingService,
    @Optional()
    private readonly safetyOperatorService?: SafetyOperatorService,
    @Optional()
    private readonly platformAdminComplianceService?: PlatformAdminComplianceService,
  ) {}

  createReportJob(
    command: CreateRegulatoryReportJobCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): ReportJobAccepted {
    const reportType = this.requireReportType(command?.reportType);
    const format = this.requireFormat(command?.format);
    const filters = this.normalizeFilters(command?.filters);
    const createdAt = new Date().toISOString();
    const job: StoredRegulatoryReportJob = {
      jobId: `REGJOB-${randomUUID()}`,
      reportType,
      format,
      status: "queued",
      filters,
      artifact: null,
      rowCount: 0,
      evidenceCount: 0,
      reportPeriod: this.deriveRequestedPeriod(filters),
      generatedAt: null,
      createdAt,
      updatedAt: createdAt,
      rows: [],
      evidenceTrace: [],
      sections: [],
    };

    this.reportJobs.unshift(job);
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: this.toAuditActorType(identity?.actorType),
        tenantId: identity?.tenantId ?? null,
        moduleName: "regulatory-reporting",
        actionName: "queue_regulatory_report_job",
        resourceType: "regulatory_report_job",
        resourceId: job.jobId,
        newValuesSummary: {
          reportType: job.reportType,
          format: job.format,
          filters: job.filters,
          status: job.status,
        },
      },
      requestId,
    );
    this.scheduleReportJob(job.jobId, identity?.actorId ?? null, requestId);

    return {
      jobId: job.jobId,
      status: "queued",
    };
  }

  listReportJobs(
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ): RegulatoryReportJobRecord[] {
    const policy = assertEvidenceAccess({
      family: "report_artifact",
      identity,
    });
    const items = this.reportJobs.map((job) => this.cloneReportJob(job));
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: this.toAuditActorType(identity?.actorType),
        tenantId: identity?.tenantId ?? null,
        moduleName: "regulatory-reporting",
        actionName: "list_regulatory_report_job_evidence",
        resourceType: "regulatory_report_job",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
        }),
      },
      requestId,
    );
    return items;
  }

  getReportJob(
    jobId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ): RegulatoryReportJobDetailRecord {
    const policy = assertEvidenceAccess({
      family: "report_artifact",
      identity,
    });
    const job = this.requireReportJob(jobId);
    const view = this.cloneReportJobDetail(job);
    view.evidenceGovernance = view.artifact
      ? this.auditNotificationService.getEvidenceSubjectGovernance(
          "report_artifact",
          view.artifact.artifactId,
          {
            manifestHash: view.artifact.manifestHash,
          },
        )
      : null;
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: this.toAuditActorType(identity?.actorType),
        tenantId: identity?.tenantId ?? null,
        moduleName: "regulatory-reporting",
        actionName: "issue_regulatory_report_artifact_download",
        resourceType: "report_artifact",
        resourceId: view.artifact?.artifactId ?? null,
        newValuesSummary: view.artifact
          ? {
              jobId: view.jobId,
              reportType: view.reportType,
              manifestHash: view.artifact.manifestHash,
              expiresAt: view.artifact.expiresAt,
              ttlMinutes: view.artifact.downloadMetadata.ttlMinutes,
            }
          : buildEvidenceAccessAuditSummary(policy, "download", {
              jobId: view.jobId,
              reportType: view.reportType,
              artifactAvailable: false,
            }),
      },
      requestId,
    );
    return view;
  }

  generateComplianceSummary(
    experimentId: string,
    asOf?: string,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ): RegulatoryComplianceSummaryRecord {
    const generatedBy = identity?.actorId ?? null;
    const snapshot =
      this.requireSandboxGovernanceService().generateComplianceSnapshot(
        experimentId.trim(),
        this.buildSnapshotCommand(asOf?.trim(), generatedBy),
      );
    const scope = this.buildScopeFromSnapshot(experimentId.trim(), snapshot);
    const summary = this.buildComplianceSummary(scope, generatedBy);
    this.recordAudit(
      {
        actorId: generatedBy,
        actorType: this.toAuditActorType(identity?.actorType),
        tenantId: identity?.tenantId ?? null,
        moduleName: "regulatory-reporting",
        actionName: "generate_regulatory_compliance_summary",
        resourceType: "sandbox_experiment",
        resourceId: experimentId.trim(),
        newValuesSummary: {
          authorizationStatus: summary.authorizationStatus,
          snapshotHashSha256: summary.snapshotHashSha256,
          vehicleEnrollmentCount: summary.vehicleEnrollmentCount,
          telemetryGapVehicleCount: summary.telemetryGapVehicleCount,
          openIncidentCount: summary.openIncidentCount,
          openNotificationCount: summary.openNotificationCount,
        },
      },
      requestId,
    );
    return summary;
  }

  async generateKpiDashboard(
    experimentId: string,
    asOf?: string,
    baselineWindowDays?: number,
    baselineWindowTrips?: number,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<SandboxKpiDashboardRecord> {
    const generatedBy = identity?.actorId ?? null;
    const snapshot =
      this.requireSandboxGovernanceService().generateComplianceSnapshot(
        experimentId.trim(),
        this.buildSnapshotCommand(asOf?.trim(), generatedBy),
      );
    const scope = this.buildScopeFromSnapshot(experimentId.trim(), snapshot);
    const filters = this.buildKpiDashboardDispatchFilters(scope, snapshot);

    const dispatchRecords = this.reportingService
      ? (await this.loadDailyDispatchRecords(filters)).filter((record) =>
          this.matchesDispatchRecord(record, filters, scope),
        )
      : [];
    const telemetryRows = this.buildTelemetryCoverageRows(scope);
    const takeovers = this.filterTakeovers(this.listTakeovers(), {}, scope);
    const notifications = this.filterNotifications(
      this.listNotifications(),
      scope.vehicleIds,
      new Set(snapshot.jurisdictions.map((item) => item.jurisdictionCode)),
    );
    const providerHealth =
      this.rocOperationsService?.getProviderHealthSnapshot().items ?? [];
    const rocAlerts = this.rocOperationsService?.listAlerts(null) ?? [];
    const investigations = this.filterInvestigations(scope);
    const legalHolds = this.filterLegalHolds(scope, investigations);
    const controlledExports = this.filterControlledExports(
      scope,
      investigations,
      legalHolds,
    );
    const baselineWindow = this.buildKpiBaselineWindow(
      snapshot,
      dispatchRecords.length,
      baselineWindowDays,
      baselineWindowTrips,
    );

    const dashboard: SandboxKpiDashboardRecord = {
      experimentId: scope.experimentId ?? experimentId.trim(),
      experimentVersionId: snapshot.experimentVersionId,
      programCode: scope.programCode,
      asOf: scope.asOf ?? snapshot.asOf,
      generatedAt: new Date().toISOString(),
      generatedBy,
      baselineWindow,
      targets: this.buildKpiTargets({
        snapshot,
        telemetryRows,
        takeovers,
        notifications,
        providerHealth,
        investigations,
        legalHolds,
        controlledExports,
        dispatchRecordCount: dispatchRecords.length,
        activeHumanFallbackCount: rocAlerts.filter(
          (alert) => alert.alertType === "human_fallback",
        ).length,
      }),
      safetyGates: this.buildSafetyGates({
        snapshot,
        telemetryRows,
        notifications,
        rocAlerts,
        legalHolds,
      }),
    };

    this.recordAudit(
      {
        actorId: generatedBy,
        actorType: this.toAuditActorType(identity?.actorType),
        tenantId: identity?.tenantId ?? null,
        moduleName: "regulatory-reporting",
        actionName: "generate_sandbox_kpi_dashboard",
        resourceType: "sandbox_experiment",
        resourceId: experimentId.trim(),
        newValuesSummary: {
          baselineWindow,
          targetStatusSet: [
            ...new Set(dashboard.targets.map((target) => target.targetStatus)),
          ],
          safetyGateStates: dashboard.safetyGates.map((gate) => ({
            key: gate.key,
            state: gate.state,
          })),
        },
      },
      requestId,
    );

    return dashboard;
  }

  async generateResumeAuthorizationDossier(
    experimentId: string,
    command: GenerateResumeAuthorizationDossierCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ResumeAuthorizationDossierRecord> {
    const generatedBy = command?.actorId?.trim() || identity?.actorId || null;
    const snapshot =
      this.requireSandboxGovernanceService().generateComplianceSnapshot(
        experimentId.trim(),
        this.buildSnapshotCommand(command?.asOf?.trim(), generatedBy),
      );
    const scope = this.buildScopeFromSnapshot(experimentId.trim(), snapshot);
    const reportJobs: StoredRegulatoryReportJob[] = [];

    for (const reportType of PHASE2_REGULATORY_REPORT_JOB_TYPES) {
      const filters: Record<string, unknown> = {
        experimentId: scope.experimentId,
        asOf: scope.asOf,
      };
      if (scope.programCode) {
        filters.sandboxProgramId = scope.programCode;
      }
      const job = await this.ensureCompletedReportJob(
        {
          reportType,
          format: "pdf",
          filters,
        },
        generatedBy,
        requestId,
      );
      reportJobs.push(job);
    }

    const summary = this.buildComplianceSummary(scope, generatedBy);
    const dossierPayload = {
      experimentId: scope.experimentId,
      asOf: scope.asOf,
      summary,
      snapshot,
      reportJobs: reportJobs.map((job) => this.cloneReportJob(job)),
      note: command?.note?.trim() || null,
    };
    const artifact = this.createArtifact(
      "filing",
      `resume-dossier-${experimentId.trim()}`,
      dossierPayload,
    );
    const dossierId = `RESDOS-${randomUUID()}`;
    const sourceRefs = this.buildResumeDossierSourceRefs(snapshot, reportJobs);
    const sections = this.buildResumeDossierSections(
      summary,
      snapshot,
      reportJobs,
    );
    const record: StoredResumeAuthorizationDossier = {
      dossierId,
      experimentId: scope.experimentId as string,
      experimentVersionId: snapshot.experimentVersionId,
      asOf: scope.asOf as string,
      generatedAt: new Date().toISOString(),
      generatedBy,
      authorizationStatus: snapshot.authorizationStatus,
      manifestHash: artifact.manifestHash,
      immutable: true,
      artifact,
      complianceSummary: summary,
      complianceSnapshot: this.cloneJson(snapshot),
      reportJobs: reportJobs.map((job) => this.cloneReportJob(job)),
      sections,
      sourceRefs,
    };

    this.resumeDossiers.unshift(record);
    this.recordAudit(
      {
        actorId: generatedBy,
        actorType: this.toAuditActorType(identity?.actorType),
        tenantId: identity?.tenantId ?? null,
        moduleName: "regulatory-reporting",
        actionName: "assemble_resume_authorization_dossier",
        resourceType: "resume_authorization_dossier",
        resourceId: dossierId,
        newValuesSummary: {
          experimentId: record.experimentId,
          authorizationStatus: record.authorizationStatus,
          manifestHash: record.manifestHash,
          reportJobIds: record.reportJobs.map((job) => job.jobId),
          note: command?.note?.trim() || null,
        },
      },
      requestId,
    );

    return this.cloneResumeDossier(record);
  }

  getResumeAuthorizationDossier(
    dossierId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ): ResumeAuthorizationDossierRecord {
    const policy = assertEvidenceAccess({
      family: "filing_package",
      identity,
    });
    const dossier = this.requireResumeDossier(dossierId);
    const view = this.cloneResumeDossier(dossier);
    view.evidenceGovernance =
      this.auditNotificationService.getEvidenceSubjectGovernance(
        "filing_package",
        view.dossierId,
        {
          manifestHash: view.manifestHash,
        },
      );
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: this.toAuditActorType(identity?.actorType),
        tenantId: identity?.tenantId ?? null,
        moduleName: "regulatory-reporting",
        actionName: "issue_resume_authorization_dossier_download",
        resourceType: "filing_package",
        resourceId: view.dossierId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "download", {
          experimentId: view.experimentId,
          manifestHash: view.manifestHash,
          expiresAt: view.artifact?.downloadMetadata.expiresAt ?? null,
        }),
      },
      requestId,
    );
    return view;
  }

  private scheduleReportJob(
    jobId: string,
    actorId?: string | null,
    requestId?: string,
  ) {
    if (this.scheduledReportJobIds.has(jobId)) {
      return;
    }
    this.scheduledReportJobIds.add(jobId);
    queueMicrotask(() => {
      void this.runReportJob(jobId, actorId ?? null, requestId).finally(() => {
        this.scheduledReportJobIds.delete(jobId);
      });
    });
  }

  private async ensureCompletedReportJob(
    command: CreateRegulatoryReportJobCommand,
    actorId: string | null,
    requestId?: string,
  ): Promise<StoredRegulatoryReportJob> {
    const job: StoredRegulatoryReportJob = {
      jobId: `REGJOB-${randomUUID()}`,
      reportType: this.requireReportType(command.reportType),
      format: this.requireFormat(command.format),
      status: "queued",
      filters: this.normalizeFilters(command.filters),
      artifact: null,
      rowCount: 0,
      evidenceCount: 0,
      reportPeriod: this.deriveRequestedPeriod(command.filters ?? {}),
      generatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rows: [],
      evidenceTrace: [],
      sections: [],
    };
    this.reportJobs.unshift(job);
    this.startReportJob(job);
    await this.completeReportJob(job, actorId, requestId);
    return job;
  }

  private async runReportJob(
    jobId: string,
    actorId: string | null,
    requestId?: string,
  ) {
    const job = this.reportJobs.find((candidate) => candidate.jobId === jobId);
    if (!job || (job.status !== "queued" && job.status !== "running")) {
      return;
    }

    try {
      this.startReportJob(job);
      await this.completeReportJob(job, actorId, requestId);
    } catch (error) {
      this.failReportJob(job, error, requestId);
    }
  }

  private startReportJob(job: StoredRegulatoryReportJob) {
    job.status = "running";
    job.updatedAt = new Date().toISOString();
  }

  private async completeReportJob(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
    requestId?: string,
  ) {
    const built = await this.buildRegulatoryReport(job, actorId);
    const payload = {
      jobId: job.jobId,
      reportType: job.reportType,
      format: job.format,
      filters: job.filters,
      rows: built.rows,
      evidenceTrace: built.evidenceTrace,
      sections: built.sections,
      reportPeriod: built.reportPeriod,
    };
    job.rows = built.rows.map((row) => this.cloneJson(row));
    job.evidenceTrace = built.evidenceTrace.map((trace) =>
      this.cloneJson(trace),
    );
    job.sections = built.sections.map((section) => this.cloneJson(section));
    job.reportPeriod = { ...built.reportPeriod };
    job.rowCount = job.rows.length;
    job.evidenceCount = job.evidenceTrace.length;
    job.generatedAt = new Date().toISOString();
    job.updatedAt = job.generatedAt;
    job.artifact = this.createArtifact("report", job.jobId, payload);
    job.status = "completed";
    this.recordAudit(
      {
        actorId,
        actorType: actorId ? "ops_user" : "system",
        tenantId: null,
        moduleName: "regulatory-reporting",
        actionName: "complete_regulatory_report_job",
        resourceType: "regulatory_report_job",
        resourceId: job.jobId,
        newValuesSummary: {
          reportType: job.reportType,
          rowCount: job.rowCount,
          evidenceCount: job.evidenceCount,
          manifestHash: job.artifact.manifestHash,
          expiresAt: job.artifact.expiresAt,
        },
      },
      requestId,
    );
  }

  private failReportJob(
    job: StoredRegulatoryReportJob,
    error: unknown,
    requestId?: string,
  ) {
    job.status = "failed";
    job.updatedAt = new Date().toISOString();
    this.logger.warn(
      `Failed to complete regulatory report job ${job.jobId}: ${this.describeError(
        error,
      )}`,
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "regulatory-reporting",
        actionName: "fail_regulatory_report_job",
        resourceType: "regulatory_report_job",
        resourceId: job.jobId,
        newValuesSummary: {
          reportType: job.reportType,
          error: this.describeError(error),
        },
      },
      requestId,
    );
  }

  private async buildRegulatoryReport(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
  ): Promise<BuiltRegulatoryReport> {
    switch (job.reportType) {
      case "daily_ops_report":
        return this.buildDailyOpsReport(job, actorId);
      case "trip_report":
        return this.buildTripReport(job, actorId);
      case "takeover_report":
        return this.buildTakeoverReport(job, actorId);
      case "fsd_session_report":
        return this.buildFsdSessionReport(job, actorId);
      case "telemetry_completeness_report":
        return this.buildTelemetryCompletenessReport(job, actorId);
      case "incident_report":
        return this.buildIncidentReport(job, actorId);
      default:
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "REGULATORY_REPORT_TYPE_UNSUPPORTED",
          `Unsupported regulatory report type '${job.reportType}'.`,
        );
    }
  }

  private async buildDailyOpsReport(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
  ): Promise<BuiltRegulatoryReport> {
    const dispatchRecords = await this.loadDailyDispatchRecords(job.filters);
    const scope = this.resolveExperimentScope(job.filters, actorId);
    const takeovers = this.filterTakeovers(
      this.listTakeovers(),
      job.filters,
      scope,
    );
    const incidents = this.filterIncidents(
      this.listIncidents(),
      job.filters,
      scope,
    );
    const rowsByDay = new Map<
      string,
      {
        serviceDate: string;
        dispatchTripCount: number;
        completedTripCount: number;
        cancelledTripCount: number;
        takeoverCount: number;
        incidentCount: number;
      }
    >();
    const evidenceTrace: RegulatoryReportEvidenceTraceRecord[] = [];

    for (const record of dispatchRecords) {
      const day = this.resolveServiceDate(
        record.serviceDate ?? record.requestedAt,
      );
      const row = rowsByDay.get(day) ?? {
        serviceDate: day,
        dispatchTripCount: 0,
        completedTripCount: 0,
        cancelledTripCount: 0,
        takeoverCount: 0,
        incidentCount: 0,
      };
      row.dispatchTripCount += 1;
      if (record.finalStatus === "completed") {
        row.completedTripCount += 1;
      }
      if (record.finalStatus === "cancelled") {
        row.cancelledTripCount += 1;
      }
      rowsByDay.set(day, row);
      evidenceTrace.push(
        this.createEvidenceTrace(
          "reporting",
          "dispatch_daily_record",
          record.orderId,
          record.requestedAt,
          `Dispatch daily record for order ${record.orderNo}.`,
          record,
        ),
      );
    }

    for (const candidate of takeovers) {
      const day = this.resolveServiceDate(
        candidate.sourceTimestamps.safetyOccurredAt,
      );
      const row = rowsByDay.get(day) ?? {
        serviceDate: day,
        dispatchTripCount: 0,
        completedTripCount: 0,
        cancelledTripCount: 0,
        takeoverCount: 0,
        incidentCount: 0,
      };
      row.takeoverCount += 1;
      rowsByDay.set(day, row);
      evidenceTrace.push(
        this.createEvidenceTrace(
          "roc-operations",
          "correlated_takeover_case",
          candidate.correlatedTakeoverCaseId,
          candidate.sourceTimestamps.safetyOccurredAt,
          `Correlated takeover case ${candidate.correlatedTakeoverCaseId}.`,
          candidate,
        ),
      );
    }

    for (const incident of incidents) {
      const day = this.resolveServiceDate(
        incident.occurredAt ?? incident.createdAt,
      );
      const row = rowsByDay.get(day) ?? {
        serviceDate: day,
        dispatchTripCount: 0,
        completedTripCount: 0,
        cancelledTripCount: 0,
        takeoverCount: 0,
        incidentCount: 0,
      };
      row.incidentCount += 1;
      rowsByDay.set(day, row);
      evidenceTrace.push(
        this.createEvidenceTrace(
          "incident",
          "incident_record",
          incident.incidentId,
          incident.occurredAt ?? incident.createdAt,
          `Incident ${incident.incidentId} (${incident.status}).`,
          incident,
        ),
      );
    }

    const rows = [...rowsByDay.values()].sort((left, right) =>
      left.serviceDate.localeCompare(right.serviceDate),
    );
    const sections = [
      {
        sectionId: "daily_ops_summary",
        title: "Daily operations summary",
        summary:
          "Dispatch, takeover, and incident counts grouped by service date.",
        rowCount: rows.length,
        evidenceCount: evidenceTrace.length,
        payload: {
          totals: {
            dispatchTripCount: rows.reduce(
              (sum, row) => sum + Number(row.dispatchTripCount),
              0,
            ),
            completedTripCount: rows.reduce(
              (sum, row) => sum + Number(row.completedTripCount),
              0,
            ),
            cancelledTripCount: rows.reduce(
              (sum, row) => sum + Number(row.cancelledTripCount),
              0,
            ),
            takeoverCount: rows.reduce(
              (sum, row) => sum + Number(row.takeoverCount),
              0,
            ),
            incidentCount: rows.reduce(
              (sum, row) => sum + Number(row.incidentCount),
              0,
            ),
          },
        },
      },
    ] satisfies RegulatoryReportSectionRecord[];

    return {
      rows,
      evidenceTrace,
      sections,
      reportPeriod: this.resolveReportPeriod(
        this.deriveRequestedPeriod(job.filters),
        evidenceTrace,
      ),
    };
  }

  private async buildTripReport(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
  ): Promise<BuiltRegulatoryReport> {
    const dispatchRecords = await this.loadDailyDispatchRecords(job.filters);
    const scope = this.resolveExperimentScope(job.filters, actorId);
    const filtered = dispatchRecords.filter((record) =>
      this.matchesDispatchRecord(record, job.filters, scope),
    );
    const rows = filtered.map(
      (record) => this.cloneJson(record) as unknown as Record<string, unknown>,
    );
    const evidenceTrace = filtered.map((record) =>
      this.createEvidenceTrace(
        "reporting",
        "dispatch_daily_record",
        record.orderId,
        record.requestedAt,
        `Trip record for order ${record.orderNo}.`,
        record,
      ),
    );
    const sections = [
      {
        sectionId: "trip_rows",
        title: "Trip rows",
        summary:
          "Canonical dispatch daily records for the requested trip scope.",
        rowCount: rows.length,
        evidenceCount: evidenceTrace.length,
        payload: {
          finalStatuses: this.countBy(rows, "finalStatus"),
        },
      },
    ] satisfies RegulatoryReportSectionRecord[];

    return {
      rows,
      evidenceTrace,
      sections,
      reportPeriod: this.resolveReportPeriod(
        this.deriveRequestedPeriod(job.filters),
        evidenceTrace,
      ),
    };
  }

  private async buildTakeoverReport(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
  ): Promise<BuiltRegulatoryReport> {
    const scope = this.resolveExperimentScope(job.filters, actorId);
    const takeovers = this.filterTakeovers(
      this.listTakeovers(),
      job.filters,
      scope,
    );
    const rows = takeovers.map((candidate) => ({
      correlatedTakeoverCaseId: candidate.correlatedTakeoverCaseId,
      vehicleId: candidate.vehicleId,
      orderId: candidate.orderId,
      takeoverCorrelationId: candidate.takeoverCorrelationId,
      correlationPriority: candidate.correlationPriority,
      matchedBy: candidate.matchedBy,
      discrepancyCaseIds: [...candidate.discrepancyCaseIds],
      safetyOccurredAt: candidate.sourceTimestamps.safetyOccurredAt,
      teslaOccurredAt: candidate.sourceTimestamps.teslaOccurredAt,
      rocRequestedAt: candidate.sourceTimestamps.rocRequestedAt,
      rocRespondedAt: candidate.sourceTimestamps.rocRespondedAt,
      sandboxProgramId: candidate.safetyOperatorTakeoverReport.sandboxProgramId,
    }));
    const evidenceTrace: RegulatoryReportEvidenceTraceRecord[] = [];

    for (const candidate of takeovers) {
      evidenceTrace.push(
        this.createEvidenceTrace(
          "roc-operations",
          "correlated_takeover_case",
          candidate.correlatedTakeoverCaseId,
          candidate.sourceTimestamps.safetyOccurredAt,
          `Correlated takeover case ${candidate.correlatedTakeoverCaseId}.`,
          candidate,
        ),
      );
      evidenceTrace.push(
        this.createEvidenceTrace(
          "safety-operator",
          "takeover_report",
          candidate.safetyOperatorTakeoverReport.reportId,
          candidate.safetyOperatorTakeoverReport.occurredAt,
          `Safety-operator takeover report ${candidate.safetyOperatorTakeoverReport.reportId}.`,
          candidate.safetyOperatorTakeoverReport,
        ),
      );
      if (candidate.teslaEvent) {
        evidenceTrace.push(
          this.createEvidenceTrace(
            "roc-operations",
            "tesla_autonomy_transition",
            candidate.teslaEvent.eventId,
            candidate.teslaEvent.occurredAt,
            `Tesla autonomy transition ${candidate.teslaEvent.eventId}.`,
            candidate.teslaEvent,
          ),
        );
      }
      if (candidate.rocTakeoverResponse) {
        evidenceTrace.push(
          this.createEvidenceTrace(
            "roc-operations",
            "roc_takeover_response",
            candidate.rocTakeoverResponse.responseId,
            candidate.rocTakeoverResponse.requestedAt,
            `ROC takeover response ${candidate.rocTakeoverResponse.responseId}.`,
            candidate.rocTakeoverResponse,
          ),
        );
      }
    }

    const sections = [
      {
        sectionId: "takeover_summary",
        title: "Takeover summary",
        summary:
          "Correlated takeover cases with explicit source record linkage and discrepancy flags.",
        rowCount: rows.length,
        evidenceCount: evidenceTrace.length,
        payload: {
          discrepancyCaseCount: takeovers.reduce(
            (sum, candidate) => sum + candidate.discrepancyCaseIds.length,
            0,
          ),
          matchedBy: this.countBy(rows, "matchedBy"),
        },
      },
    ] satisfies RegulatoryReportSectionRecord[];

    return {
      rows,
      evidenceTrace,
      sections,
      reportPeriod: this.resolveReportPeriod(
        this.deriveRequestedPeriod(job.filters),
        evidenceTrace,
      ),
    };
  }

  private async buildFsdSessionReport(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
  ): Promise<BuiltRegulatoryReport> {
    const scope = this.resolveExperimentScope(job.filters, actorId);
    const events = this.filterTeslaEvents(
      this.listTeslaAutonomyTransitionEvents(),
      job.filters,
      scope,
    );
    const sessions = new Map<
      string,
      {
        autonomySessionId: string;
        vehicleId: string;
        orderIds: string[];
        takeoverCorrelationIds: string[];
        firstOccurredAt: string;
        lastOccurredAt: string;
        transitionCount: number;
        disengagementCount: number;
        manualTakeoverCount: number;
        autonomyResumedCount: number;
      }
    >();
    const evidenceTrace = events.map((event) =>
      this.createEvidenceTrace(
        "roc-operations",
        "tesla_autonomy_transition",
        event.eventId,
        event.occurredAt,
        `Tesla autonomy transition ${event.transitionType}.`,
        event,
      ),
    );

    for (const event of events) {
      const sessionId =
        event.autonomySessionId?.trim() ||
        `session-${event.vehicleId}-${this.resolveServiceDate(event.occurredAt)}`;
      const row = sessions.get(sessionId) ?? {
        autonomySessionId: sessionId,
        vehicleId: event.vehicleId,
        orderIds: [],
        takeoverCorrelationIds: [],
        firstOccurredAt: event.occurredAt,
        lastOccurredAt: event.occurredAt,
        transitionCount: 0,
        disengagementCount: 0,
        manualTakeoverCount: 0,
        autonomyResumedCount: 0,
      };
      row.transitionCount += 1;
      row.firstOccurredAt =
        row.firstOccurredAt < event.occurredAt
          ? row.firstOccurredAt
          : event.occurredAt;
      row.lastOccurredAt =
        row.lastOccurredAt > event.occurredAt
          ? row.lastOccurredAt
          : event.occurredAt;
      if (event.orderId && !row.orderIds.includes(event.orderId)) {
        row.orderIds.push(event.orderId);
      }
      if (
        event.takeoverCorrelationId &&
        !row.takeoverCorrelationIds.includes(event.takeoverCorrelationId)
      ) {
        row.takeoverCorrelationIds.push(event.takeoverCorrelationId);
      }
      if (event.transitionType === "fsd_disengagement") {
        row.disengagementCount += 1;
      }
      if (event.transitionType === "manual_takeover") {
        row.manualTakeoverCount += 1;
      }
      if (event.transitionType === "autonomy_resumed") {
        row.autonomyResumedCount += 1;
      }
      sessions.set(sessionId, row);
    }

    const rows = [...sessions.values()].sort((left, right) =>
      left.autonomySessionId.localeCompare(right.autonomySessionId),
    );
    const sections = [
      {
        sectionId: "fsd_sessions",
        title: "FSD session summary",
        summary:
          "Tesla autonomy transitions grouped into autonomy sessions for regulatory review.",
        rowCount: rows.length,
        evidenceCount: evidenceTrace.length,
        payload: {
          transitionCounts: {
            manualTakeoverCount: rows.reduce(
              (sum, row) => sum + row.manualTakeoverCount,
              0,
            ),
            disengagementCount: rows.reduce(
              (sum, row) => sum + row.disengagementCount,
              0,
            ),
            autonomyResumedCount: rows.reduce(
              (sum, row) => sum + row.autonomyResumedCount,
              0,
            ),
          },
        },
      },
    ] satisfies RegulatoryReportSectionRecord[];

    return {
      rows,
      evidenceTrace,
      sections,
      reportPeriod: this.resolveReportPeriod(
        this.deriveRequestedPeriod(job.filters),
        evidenceTrace,
      ),
    };
  }

  private async buildTelemetryCompletenessReport(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
  ): Promise<BuiltRegulatoryReport> {
    const teslaIntegrationService = this.requireTeslaIntegrationService();
    const scope = this.resolveExperimentScope(job.filters, actorId);
    const bindingMap = new Map(
      teslaIntegrationService
        .listBindings()
        .map(
          (binding) => [binding.vehicleId, this.cloneJson(binding)] as const,
        ),
    );
    const vehicleIds =
      scope.vehicleIds.size > 0
        ? [...scope.vehicleIds]
        : [
            ...bindingMap.keys(),
            ...this.readStringArray(job.filters, "vehicleIds"),
            ...(this.readString(job.filters, "vehicleId")
              ? [this.readString(job.filters, "vehicleId") as string]
              : []),
          ];
    const dedupedVehicleIds = [...new Set(vehicleIds)].sort();
    const rows: Record<string, unknown>[] = [];
    const evidenceTrace: RegulatoryReportEvidenceTraceRecord[] = [];

    for (const vehicleId of dedupedVehicleIds) {
      const binding = bindingMap.get(vehicleId) ?? null;
      const status = this.tryLoadTelemetryStatus(vehicleId);
      const sample = this.tryLoadPublicTelemetrySample(vehicleId);
      const projection = this.tryLoadTelemetryProjection(vehicleId);
      const gapCodes: string[] = [];
      if (!binding) {
        gapCodes.push("MISSING_BINDING");
      }
      if (!status) {
        gapCodes.push("MISSING_TELEMETRY_STATUS");
      }
      if (!sample) {
        gapCodes.push("MISSING_PUBLIC_SAMPLE");
      }
      if (!projection) {
        gapCodes.push("MISSING_PROJECTION");
      }

      rows.push({
        vehicleId,
        externalVehicleRef: binding?.externalVehicleRef ?? null,
        telemetryConfigured: Boolean(status?.enabled),
        telemetryHealth: status?.health ?? null,
        lastSyncAt: status?.lastSyncAt ?? null,
        lastProjectionAt: status?.lastProjectionAt ?? null,
        hasPublicSample: sample !== null,
        hasProjection: projection !== null,
        completenessStatus: gapCodes.length === 0 ? "complete" : "gap",
        gapCodes,
      });

      if (binding) {
        evidenceTrace.push(
          this.createEvidenceTrace(
            "tesla-integration",
            "tesla_vehicle_binding",
            String(binding.bindingId),
            String(binding.boundAt),
            `Tesla vehicle binding for ${vehicleId}.`,
            binding,
          ),
        );
      }
      if (status) {
        evidenceTrace.push(
          this.createEvidenceTrace(
            "tesla-integration",
            "tesla_telemetry_status",
            vehicleId,
            status.lastSyncAt ?? status.configuredAt,
            `Telemetry status for ${vehicleId}.`,
            status,
          ),
        );
      }
      if (sample) {
        evidenceTrace.push(
          this.createEvidenceTrace(
            "tesla-integration",
            "tesla_public_telemetry_sample",
            sample.sampleId,
            sample.capturedAt,
            `Public telemetry sample ${sample.sampleId}.`,
            sample,
          ),
        );
      }
      if (projection) {
        evidenceTrace.push(
          this.createEvidenceTrace(
            "tesla-integration",
            "tesla_vehicle_state_snapshot",
            projection.snapshotId,
            projection.capturedAt,
            `Vehicle telemetry projection ${projection.snapshotId}.`,
            projection,
          ),
        );
      }
    }

    const sections = [
      {
        sectionId: "telemetry_completeness",
        title: "Telemetry completeness",
        summary:
          "Vehicle-level binding, telemetry, public sample, and projection coverage.",
        rowCount: rows.length,
        evidenceCount: evidenceTrace.length,
        payload: {
          completeVehicleCount: rows.filter(
            (row) => row.completenessStatus === "complete",
          ).length,
          gapVehicleCount: rows.filter(
            (row) => row.completenessStatus === "gap",
          ).length,
          gapCodes: this.flattenCount(rows, "gapCodes"),
        },
      },
    ] satisfies RegulatoryReportSectionRecord[];

    return {
      rows,
      evidenceTrace,
      sections,
      reportPeriod: this.resolveReportPeriod(
        this.deriveRequestedPeriod(job.filters),
        evidenceTrace,
      ),
    };
  }

  private async buildIncidentReport(
    job: StoredRegulatoryReportJob,
    actorId: string | null,
  ): Promise<BuiltRegulatoryReport> {
    const scope = this.resolveExperimentScope(job.filters, actorId);
    const incidents = this.filterIncidents(
      this.listIncidents(),
      job.filters,
      scope,
    );
    const rows = incidents.map((incident) => ({
      incidentId: incident.incidentId,
      title: incident.title,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      relatedOrderId: incident.relatedOrderId,
      relatedVehicleId: incident.relatedVehicleId,
      reportedBy: incident.reportedBy,
      occurredAt: incident.occurredAt,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    }));
    const evidenceTrace = incidents.map((incident) =>
      this.createEvidenceTrace(
        "incident",
        "incident_record",
        incident.incidentId,
        incident.occurredAt ?? incident.createdAt,
        `Incident ${incident.incidentId} (${incident.status}).`,
        incident,
      ),
    );
    const sections = [
      {
        sectionId: "incident_summary",
        title: "Incident summary",
        summary:
          "Incident register filtered to the regulatory reporting scope.",
        rowCount: rows.length,
        evidenceCount: evidenceTrace.length,
        payload: {
          statuses: this.countBy(rows, "status"),
          severities: this.countBy(rows, "severity"),
          categories: this.countBy(rows, "category"),
        },
      },
    ] satisfies RegulatoryReportSectionRecord[];

    return {
      rows,
      evidenceTrace,
      sections,
      reportPeriod: this.resolveReportPeriod(
        this.deriveRequestedPeriod(job.filters),
        evidenceTrace,
      ),
    };
  }

  private buildComplianceSummary(
    scope: ExperimentScope,
    generatedBy: string | null,
  ): RegulatoryComplianceSummaryRecord {
    const snapshot = scope.snapshot;
    if (!snapshot || !scope.experimentId || !scope.asOf) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REGULATORY_COMPLIANCE_SCOPE_INVALID",
        "Compliance summary requires a resolved experiment scope.",
      );
    }

    const takeovers = this.filterTakeovers(this.listTakeovers(), {}, scope);
    const incidents = this.filterIncidents(this.listIncidents(), {}, scope);
    const telemetryRows = this.buildTelemetryCoverageRows(scope);
    const notifications = this.filterNotifications(
      this.listNotifications(),
      scope.vehicleIds,
      new Set(snapshot.jurisdictions.map((item) => item.jurisdictionCode)),
    );
    const reportCoverage = PHASE2_REGULATORY_REPORT_JOB_TYPES.map(
      (reportType) => this.buildReportCoverage(scope, reportType),
    );
    const notes = this.buildComplianceNotes({
      snapshot,
      telemetryRows,
      takeovers,
      incidents,
      notifications,
      reportCoverage,
    });

    return {
      experimentId: scope.experimentId,
      experimentVersionId: snapshot.experimentVersionId,
      programCode: scope.programCode,
      asOf: scope.asOf,
      generatedAt: new Date().toISOString(),
      generatedBy,
      authorizationStatus: snapshot.authorizationStatus,
      snapshotHashSha256: snapshot.snapshotHashSha256,
      jurisdictionCodes: snapshot.jurisdictions.map(
        (jurisdiction) => jurisdiction.jurisdictionCode,
      ),
      approvalDocumentCount: snapshot.approvalDocuments.length,
      requiredCapabilityCount: snapshot.requiredCapabilities.length,
      operatingAreaCount: snapshot.operatingAreas.length,
      routeCount: snapshot.routes.length,
      vehicleEnrollmentCount: snapshot.vehicleEnrollments.length,
      telemetryConfiguredVehicleCount: telemetryRows.filter(
        (row) => row.telemetryConfigured,
      ).length,
      telemetryGapVehicleCount: telemetryRows.filter(
        (row) => row.completenessStatus === "gap",
      ).length,
      activeTakeoverCount: takeovers.length,
      takeoverDiscrepancyCount: takeovers.reduce(
        (sum, candidate) => sum + candidate.discrepancyCaseIds.length,
        0,
      ),
      openIncidentCount: incidents.filter(
        (incident) => incident.status !== "closed",
      ).length,
      openNotificationCount: notifications.filter(
        (notification) => notification.lifecycleStatus !== "acknowledged",
      ).length,
      reportCoverage,
      notes,
    };
  }

  private buildKpiBaselineWindow(
    snapshot: SandboxComplianceSnapshotRecord,
    tripsCollected: number,
    baselineWindowDays?: number,
    baselineWindowTrips?: number,
  ): SandboxKpiBaselineWindowRecord {
    const configuredDays = this.normalizePositiveInteger(
      baselineWindowDays,
      30,
    );
    const configuredTrips = this.normalizePositiveInteger(
      baselineWindowTrips,
      50,
    );
    const collectionStartAt = this.resolveBaselineCollectionStartAt(snapshot);
    const elapsedDays = collectionStartAt
      ? Math.max(
          0,
          Math.floor(
            (new Date(snapshot.asOf).getTime() -
              new Date(collectionStartAt).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 0;
    const readyByDays = elapsedDays >= configuredDays;
    const readyByTrips = tripsCollected >= configuredTrips;

    return {
      targetStatus: "baseline_collecting",
      configuredDays,
      configuredTrips,
      collectionStartAt,
      evaluatedAt: snapshot.generatedAt,
      elapsedDays,
      tripsCollected,
      ready: readyByDays || readyByTrips,
      readinessReason: readyByDays
        ? "days"
        : readyByTrips
          ? "trips"
          : "collecting",
    };
  }

  private resolveBaselineCollectionStartAt(
    snapshot: SandboxComplianceSnapshotRecord,
  ) {
    const experiment = this.sandboxGovernanceService
      ?.listExperiments(snapshot.asOf)
      .find((candidate) => candidate.experimentId === snapshot.experimentId);
    const version = experiment?.versions.find(
      (candidate) => candidate.versionId === snapshot.experimentVersionId,
    );
    return version?.effectiveFrom ?? null;
  }

  private buildKpiTargets(input: {
    snapshot: SandboxComplianceSnapshotRecord;
    telemetryRows: Array<{
      completenessStatus: string;
      telemetryConfigured: boolean;
    }>;
    takeovers: CorrelatedTakeoverCase[];
    notifications: RegulatoryNotificationRecord[];
    providerHealth: Array<{
      status: "healthy" | "degraded" | "down" | "unknown";
      lastCheckedAt: string;
    }>;
    investigations: Array<{
      status: string;
      occurredAt: string;
    }>;
    legalHolds: SandboxLegalHoldRecord[];
    controlledExports: SandboxControlledEvidenceExportRecord[];
    dispatchRecordCount: number;
    activeHumanFallbackCount: number;
  }): SandboxKpiTargetRecord[] {
    const activeVehicleCount = input.snapshot.vehicleEnrollments.filter(
      (enrollment) => enrollment.status === "active",
    ).length;
    const providerHealthyCount = input.providerHealth.filter(
      (item) => item.status === "healthy",
    ).length;
    const correlatedTakeoverCount = input.takeovers.filter(
      (candidate) =>
        Boolean(candidate.takeoverCorrelationId) &&
        candidate.discrepancyCaseIds.length === 0,
    ).length;
    const frozenInvestigationCount = input.investigations.filter((caseRecord) =>
      [
        "evidence_frozen",
        "initial_notification_sent",
        "under_investigation",
        "regulator_review",
        "closed",
      ].includes(caseRecord.status),
    ).length;
    const onTimeNotificationCount = input.notifications.filter(
      (notification) => !notification.overdue,
    ).length;
    const telemetryFreshVehicleCount = input.telemetryRows.filter(
      (row) => row.telemetryConfigured && row.completenessStatus === "complete",
    ).length;
    const successfulExportCount = input.controlledExports.filter((record) =>
      ["approved", "completed"].includes(record.status),
    ).length;
    const releasedHoldDurationsHours = input.legalHolds
      .filter((hold) => hold.releaseRequestedAt && hold.releasedAt)
      .map((hold) =>
        this.diffHours(
          hold.releasedAt as string,
          hold.releaseRequestedAt as string,
        ),
      )
      .filter((value): value is number => value !== null);

    return [
      this.buildKpiTarget("readiness", {
        label: "Authorization readiness",
        measurementKind: "status",
        value: input.snapshot.authorizationStatus ?? "unknown",
        observedAt: input.snapshot.asOf,
        note:
          input.snapshot.authorizationStatus === "active"
            ? "Experiment authorization is active."
            : "Experiment authorization is not active.",
      }),
      this.buildKpiTarget("eligibility", {
        label: "Vehicle eligibility",
        measurementKind: "percentage",
        value: this.toPercent(
          activeVehicleCount,
          input.snapshot.vehicleEnrollments.length,
        ),
        unit: "percent",
        numerator: activeVehicleCount,
        denominator: input.snapshot.vehicleEnrollments.length,
        observedAt: input.snapshot.asOf,
        note: `${activeVehicleCount}/${input.snapshot.vehicleEnrollments.length} enrolled vehicles are active.`,
      }),
      this.buildKpiTarget("provider_completeness", {
        label: "Provider completeness",
        measurementKind: "percentage",
        value: this.toPercent(
          providerHealthyCount,
          input.providerHealth.length,
        ),
        unit: "percent",
        numerator: providerHealthyCount,
        denominator: input.providerHealth.length,
        observedAt:
          input.providerHealth[0]?.lastCheckedAt ?? input.snapshot.asOf,
        note:
          input.providerHealth.length > 0
            ? `${providerHealthyCount}/${input.providerHealth.length} provider feeds are healthy.`
            : "No provider health feed is wired for this scope yet.",
      }),
      this.buildKpiTarget("takeover_correlation", {
        label: "Takeover correlation",
        measurementKind: "percentage",
        value: this.toPercent(correlatedTakeoverCount, input.takeovers.length),
        unit: "percent",
        numerator: correlatedTakeoverCount,
        denominator: input.takeovers.length,
        observedAt:
          input.takeovers[0]?.sourceTimestamps.safetyOccurredAt ??
          input.snapshot.asOf,
        note:
          input.takeovers.length > 0
            ? `${correlatedTakeoverCount}/${input.takeovers.length} takeover cases are correlated without discrepancies.`
            : "No takeover cases observed in the current scope.",
      }),
      this.buildKpiTarget("freeze_success", {
        label: "Freeze success",
        measurementKind: "percentage",
        value: this.toPercent(
          frozenInvestigationCount,
          input.investigations.length,
        ),
        unit: "percent",
        numerator: frozenInvestigationCount,
        denominator: input.investigations.length,
        observedAt: input.investigations[0]?.occurredAt ?? input.snapshot.asOf,
        note:
          input.investigations.length > 0
            ? `${frozenInvestigationCount}/${input.investigations.length} investigations reached evidence-freeze or later workflow states.`
            : "No investigation cases observed in the current scope.",
      }),
      this.buildKpiTarget("fallback_success", {
        label: "Fallback success",
        measurementKind: "percentage",
        value: this.toPercent(
          Math.max(
            input.dispatchRecordCount - input.activeHumanFallbackCount,
            0,
          ),
          input.dispatchRecordCount,
        ),
        unit: "percent",
        numerator: Math.max(
          input.dispatchRecordCount - input.activeHumanFallbackCount,
          0,
        ),
        denominator: input.dispatchRecordCount,
        observedAt: input.snapshot.asOf,
        note:
          input.dispatchRecordCount > 0
            ? `${input.activeHumanFallbackCount} active human fallbacks remain against ${input.dispatchRecordCount} observed trips.`
            : "Trip volume has not yet been collected for fallback success.",
      }),
      this.buildKpiTarget("notification_timeliness", {
        label: "Notification timeliness",
        measurementKind: "percentage",
        value: this.toPercent(
          onTimeNotificationCount,
          input.notifications.length,
        ),
        unit: "percent",
        numerator: onTimeNotificationCount,
        denominator: input.notifications.length,
        observedAt: input.notifications[0]?.updatedAt ?? input.snapshot.asOf,
        note:
          input.notifications.length > 0
            ? `${onTimeNotificationCount}/${input.notifications.length} regulatory notifications are within deadline.`
            : "No regulatory notifications observed in the current scope.",
      }),
      this.buildKpiTarget("telemetry_freshness", {
        label: "Telemetry freshness",
        measurementKind: "percentage",
        value: this.toPercent(
          telemetryFreshVehicleCount,
          input.telemetryRows.length,
        ),
        unit: "percent",
        numerator: telemetryFreshVehicleCount,
        denominator: input.telemetryRows.length,
        observedAt: input.snapshot.asOf,
        note:
          input.telemetryRows.length > 0
            ? `${telemetryFreshVehicleCount}/${input.telemetryRows.length} vehicles have complete telemetry coverage.`
            : "No vehicle telemetry rows are available in the current scope.",
      }),
      this.buildKpiTarget("export_success", {
        label: "Export success",
        measurementKind: "percentage",
        value: this.toPercent(
          successfulExportCount,
          input.controlledExports.length,
        ),
        unit: "percent",
        numerator: successfulExportCount,
        denominator: input.controlledExports.length,
        observedAt:
          input.controlledExports[0]?.requestedAt ?? input.snapshot.asOf,
        note:
          input.controlledExports.length > 0
            ? `${successfulExportCount}/${input.controlledExports.length} controlled evidence exports reached approved or completed status.`
            : "No controlled evidence export requests observed in the current scope.",
      }),
      this.buildKpiTarget("legal_hold_release_cycle", {
        label: "Legal-hold release cycle",
        measurementKind: "duration_hours",
        value: this.average(releasedHoldDurationsHours),
        unit: "hours",
        numerator: releasedHoldDurationsHours.length,
        denominator: input.legalHolds.length,
        observedAt: input.legalHolds[0]?.placedAt ?? input.snapshot.asOf,
        note:
          releasedHoldDurationsHours.length > 0
            ? `Average release cycle is calculated from ${releasedHoldDurationsHours.length} released legal hold(s).`
            : "No released legal holds observed in the current scope.",
      }),
    ];
  }

  private buildKpiTarget(
    key: SandboxKpiTargetRecord["key"],
    input: Omit<
      SandboxKpiTargetRecord,
      "key" | "targetStatus" | "unit" | "numerator" | "denominator"
    > &
      Partial<
        Pick<SandboxKpiTargetRecord, "unit" | "numerator" | "denominator">
      >,
  ): SandboxKpiTargetRecord {
    return {
      key,
      targetStatus: "baseline_collecting",
      ...input,
      unit: input.unit ?? null,
      numerator: input.numerator ?? null,
      denominator: input.denominator ?? null,
    };
  }

  private buildSafetyGates(input: {
    snapshot: SandboxComplianceSnapshotRecord;
    telemetryRows: Array<{
      completenessStatus: string;
    }>;
    notifications: RegulatoryNotificationRecord[];
    rocAlerts: Array<{
      alertType: string;
      providerCode: string | null;
      summary: string;
      updatedAt: string;
    }>;
    legalHolds: SandboxLegalHoldRecord[];
  }): SandboxSafetyGateRecord[] {
    const telemetryGap = input.telemetryRows.some(
      (row) => row.completenessStatus === "gap",
    );
    const recorderAlert = input.rocAlerts.find(
      (alert) => alert.providerCode === "onboard_recorder",
    );
    const providerAlert = input.rocAlerts.find(
      (alert) => alert.alertType === "provider_health",
    );
    const overdueNotification = input.notifications.find(
      (notification) => notification.overdue,
    );
    const activeHold = input.legalHolds.find(
      (hold) => hold.status !== "released",
    );
    const operatorCoverage = this.resolveSafetyOperatorCoverage(input.snapshot);

    return [
      this.buildSafetyGate(
        "feed_missing",
        "Provider feed missing",
        providerAlert ? "alert" : "pass",
        providerAlert?.summary ?? null,
        providerAlert?.updatedAt ?? input.snapshot.asOf,
      ),
      this.buildSafetyGate(
        "telemetry_stale",
        "Telemetry stale",
        telemetryGap ? "alert" : "pass",
        telemetryGap
          ? "One or more vehicles have telemetry completeness gaps."
          : null,
        input.snapshot.asOf,
      ),
      this.buildSafetyGate(
        "recorder_offline",
        "Recorder offline",
        recorderAlert ? "alert" : "pass",
        recorderAlert?.summary ?? null,
        recorderAlert?.updatedAt ?? input.snapshot.asOf,
      ),
      this.buildSafetyGate(
        "operator_missing",
        "Safety operator missing",
        operatorCoverage.state,
        operatorCoverage.message,
        input.snapshot.asOf,
      ),
      this.buildSafetyGate(
        "outside_area",
        "Outside approved area",
        "unknown",
        "ODD geofence breach monitoring remains fail-closed and is not summarized in this KPI aggregate yet.",
        input.snapshot.asOf,
      ),
      this.buildSafetyGate(
        "experiment_expired",
        "Experiment expired",
        input.snapshot.authorizationStatus === "active" ? "pass" : "alert",
        input.snapshot.authorizationStatus === "active"
          ? null
          : `Authorization status is '${input.snapshot.authorizationStatus}'.`,
        input.snapshot.asOf,
      ),
      this.buildSafetyGate(
        "legal_hold_blocks_deletion",
        "Legal hold blocks deletion",
        activeHold ? "alert" : "pass",
        activeHold
          ? `Legal hold ${activeHold.holdId} remains ${activeHold.status}.`
          : null,
        activeHold?.placedAt ?? input.snapshot.asOf,
      ),
      this.buildSafetyGate(
        "notification_overdue",
        "Notification overdue",
        overdueNotification ? "alert" : "pass",
        overdueNotification
          ? `${overdueNotification.notificationId} missed its deadline.`
          : null,
        overdueNotification?.updatedAt ?? input.snapshot.asOf,
      ),
    ];
  }

  private buildSafetyGate(
    key: string,
    label: string,
    state: SandboxSafetyGateRecord["state"],
    reason: string | null,
    observedAt: string | null,
  ): SandboxSafetyGateRecord {
    return {
      key,
      label,
      hardAlert: true,
      failClosed: true,
      state,
      reason,
      observedAt,
    };
  }

  private resolveSafetyOperatorCoverage(
    snapshot: SandboxComplianceSnapshotRecord,
  ): {
    state: SandboxSafetyGateRecord["state"];
    message: string;
  } {
    const enrolledVehicleIds = [
      ...new Set(
        snapshot.vehicleEnrollments.map((enrollment) => enrollment.vehicleId),
      ),
    ];
    if (enrolledVehicleIds.length === 0) {
      return {
        state: "pass",
        message: "No enrolled vehicles require safety-operator coverage.",
      };
    }

    if (!this.safetyOperatorService) {
      return {
        state: "unknown",
        message:
          "Live operator assignment and shift coverage are not available in this read model.",
      };
    }

    const enrolledVehicleIdSet = new Set(enrolledVehicleIds);
    const coveredVehicleIds = new Set(
      this.safetyOperatorService
        .listAssignments({}, INTERNAL_SYSTEM_IDENTITY)
        .filter(
          (assignment) =>
            (assignment.status === "assigned" ||
              assignment.status === "engaged") &&
            enrolledVehicleIdSet.has(assignment.vehicleId),
        )
        .map((assignment) => assignment.vehicleId),
    );

    for (const shift of this.safetyOperatorService.listShifts(
      { status: "active" },
      INTERNAL_SYSTEM_IDENTITY,
    )) {
      if (shift.vehicleId && enrolledVehicleIdSet.has(shift.vehicleId)) {
        coveredVehicleIds.add(shift.vehicleId);
      }
    }

    const uncoveredVehicleIds = enrolledVehicleIds.filter(
      (vehicleId) => !coveredVehicleIds.has(vehicleId),
    );
    if (uncoveredVehicleIds.length > 0) {
      return {
        state: "alert",
        message: `Active safety-operator coverage missing for vehicles: ${uncoveredVehicleIds.join(", ")}.`,
      };
    }

    return {
      state: "pass",
      message: `${coveredVehicleIds.size}/${enrolledVehicleIds.length} enrolled vehicles have active safety-operator coverage.`,
    };
  }

  private buildReportCoverage(
    scope: ExperimentScope,
    reportType: Phase2RegulatoryReportJobType,
  ): RegulatoryComplianceSummaryCoverageRecord {
    const latest = this.reportJobs.find(
      (job) =>
        job.reportType === reportType &&
        this.readString(job.filters, "experimentId") === scope.experimentId,
    );
    return {
      reportType,
      latestJobId: latest?.jobId ?? null,
      status: latest?.status ?? null,
      generatedAt: latest?.generatedAt ?? null,
      rowCount: latest?.rowCount ?? 0,
      evidenceCount: latest?.evidenceCount ?? 0,
      artifactId: latest?.artifact?.artifactId ?? null,
    };
  }

  private buildComplianceNotes(input: {
    snapshot: SandboxComplianceSnapshotRecord;
    telemetryRows: Array<{
      completenessStatus: string;
      gapCodes: string[];
      telemetryConfigured: boolean;
    }>;
    takeovers: CorrelatedTakeoverCase[];
    incidents: IncidentRecord[];
    notifications: RegulatoryNotificationRecord[];
    reportCoverage: RegulatoryComplianceSummaryCoverageRecord[];
  }) {
    const notes: string[] = [];
    if (input.snapshot.authorizationStatus !== "active") {
      notes.push(
        `Authorization status is '${input.snapshot.authorizationStatus}' as of ${input.snapshot.asOf}.`,
      );
    }
    if (input.snapshot.approvalDocuments.length === 0) {
      notes.push(
        "No published approval documents are present in the effective compliance snapshot.",
      );
    }
    const gapVehicleCount = input.telemetryRows.filter(
      (row) => row.completenessStatus === "gap",
    ).length;
    if (gapVehicleCount > 0) {
      notes.push(
        `${gapVehicleCount} vehicle(s) have telemetry completeness gaps in the current scope.`,
      );
    }
    if (
      input.takeovers.some(
        (candidate) => candidate.discrepancyCaseIds.length > 0,
      )
    ) {
      notes.push(
        "One or more takeover cases still carry unresolved discrepancy evidence.",
      );
    }
    if (input.incidents.some((incident) => incident.status !== "closed")) {
      notes.push(
        "Open or unresolved incidents remain in the current sandbox scope.",
      );
    }
    if (
      input.notifications.some(
        (notification) => notification.lifecycleStatus !== "acknowledged",
      )
    ) {
      notes.push("Unacknowledged regulatory notifications remain open.");
    }
    for (const coverage of input.reportCoverage) {
      if (!coverage.latestJobId || coverage.status !== "completed") {
        notes.push(
          `Report coverage missing or incomplete for ${coverage.reportType}.`,
        );
      }
    }
    if (notes.length === 0) {
      notes.push(
        "No blocking compliance gaps were detected in the assembled summary.",
      );
    }
    return notes;
  }

  private buildTelemetryCoverageRows(scope: ExperimentScope) {
    return [...scope.vehicleIds].sort().map((vehicleId) => {
      const status = this.tryLoadTelemetryStatus(vehicleId);
      const sample = this.tryLoadPublicTelemetrySample(vehicleId);
      const projection = this.tryLoadTelemetryProjection(vehicleId);
      const gapCodes: string[] = [];
      if (!status) {
        gapCodes.push("MISSING_TELEMETRY_STATUS");
      }
      if (!sample) {
        gapCodes.push("MISSING_PUBLIC_SAMPLE");
      }
      if (!projection) {
        gapCodes.push("MISSING_PROJECTION");
      }
      return {
        vehicleId,
        telemetryConfigured: Boolean(status?.enabled),
        completenessStatus: gapCodes.length === 0 ? "complete" : "gap",
        gapCodes,
      };
    });
  }

  private buildResumeDossierSections(
    summary: RegulatoryComplianceSummaryRecord,
    snapshot: SandboxComplianceSnapshotRecord,
    reportJobs: StoredRegulatoryReportJob[],
  ): ResumeAuthorizationDossierSectionRecord[] {
    return [
      {
        sectionId: "authorization_readiness",
        title: "Authorization readiness",
        summary:
          "Current authorization state, blocker notes, and vehicle enrollment scope.",
        evidenceCount:
          summary.reportCoverage.reduce(
            (sum, coverage) => sum + coverage.evidenceCount,
            0,
          ) + snapshot.approvalDocuments.length,
        payload: {
          authorizationStatus: summary.authorizationStatus,
          vehicleEnrollmentCount: summary.vehicleEnrollmentCount,
          notes: summary.notes,
        },
      },
      {
        sectionId: "approval_documents",
        title: "Approval documents",
        summary:
          "Published approval artifacts effective at the dossier as-of time.",
        evidenceCount: snapshot.approvalDocuments.length,
        payload: {
          documents: snapshot.approvalDocuments.map((document) => ({
            documentId: document.documentId,
            versionId: document.versionId,
            title: document.title,
            documentType: document.documentType,
            artifactSha256: document.artifactSha256,
            publishedAt: document.publishedAt,
          })),
        },
      },
      {
        sectionId: "report_artifacts",
        title: "Regulatory report artifacts",
        summary:
          "Fresh regulatory report jobs assembled for resume authorization review.",
        evidenceCount: reportJobs.reduce(
          (sum, job) => sum + job.evidenceCount,
          0,
        ),
        payload: {
          reportJobs: reportJobs.map((job) => ({
            jobId: job.jobId,
            reportType: job.reportType,
            rowCount: job.rowCount,
            evidenceCount: job.evidenceCount,
            manifestHash: job.artifact?.manifestHash ?? null,
          })),
        },
      },
    ];
  }

  private buildResumeDossierSourceRefs(
    snapshot: SandboxComplianceSnapshotRecord,
    reportJobs: StoredRegulatoryReportJob[],
  ): ResumeAuthorizationDossierSourceRecord[] {
    const sourceRefs: ResumeAuthorizationDossierSourceRecord[] = [
      {
        sourceType: "sandbox_compliance_snapshot",
        sourceId: snapshot.snapshotId,
        manifestHash: snapshot.snapshotHashSha256,
        description:
          "Effective sandbox compliance snapshot used for the dossier.",
      },
    ];
    for (const document of snapshot.approvalDocuments) {
      sourceRefs.push({
        sourceType: "approval_document_version",
        sourceId: document.versionId,
        manifestHash: document.artifactSha256,
        description: `Approval document ${document.title}.`,
      });
    }
    for (const job of reportJobs) {
      sourceRefs.push({
        sourceType: "regulatory_report_job",
        sourceId: job.jobId,
        manifestHash: job.artifact?.manifestHash ?? null,
        description: `${job.reportType} artifact.`,
      });
    }
    return sourceRefs;
  }

  private buildScopeFromSnapshot(
    experimentId: string,
    snapshot: SandboxComplianceSnapshotRecord,
  ): ExperimentScope {
    const programCode =
      snapshot.vehicleEnrollments[0]?.sandboxProgramId ??
      snapshot.routes[0]?.sandboxProgramId ??
      snapshot.operatingAreas[0]?.sandboxProgramId ??
      null;
    return {
      experimentId,
      asOf: snapshot.asOf,
      programCode,
      snapshot: this.cloneJson(snapshot),
      vehicleIds: new Set(
        snapshot.vehicleEnrollments.map((enrollment) => enrollment.vehicleId),
      ),
    };
  }

  private resolveExperimentScope(
    filters: Record<string, unknown>,
    actorId: string | null,
  ): ExperimentScope {
    const experimentId = this.readString(filters, "experimentId");
    if (!experimentId) {
      return {
        experimentId: null,
        asOf: this.readString(filters, "asOf"),
        programCode: this.readString(filters, "sandboxProgramId"),
        snapshot: null,
        vehicleIds: new Set(this.readStringArray(filters, "vehicleIds")),
      };
    }

    const snapshot =
      this.requireSandboxGovernanceService().generateComplianceSnapshot(
        experimentId,
        this.buildSnapshotCommand(this.readString(filters, "asOf"), actorId),
      );
    return this.buildScopeFromSnapshot(experimentId, snapshot);
  }

  private buildKpiDashboardDispatchFilters(
    scope: ExperimentScope,
    snapshot: SandboxComplianceSnapshotRecord,
  ): Record<string, unknown> {
    const filters: Record<string, unknown> = {
      experimentId: scope.experimentId,
      asOf: scope.asOf,
    };
    if (scope.programCode) {
      filters.sandboxProgramId = scope.programCode;
    }

    const collectionStartAt = this.resolveBaselineCollectionStartAt(snapshot);
    if (collectionStartAt) {
      filters.serviceDateFrom = this.resolveServiceDate(collectionStartAt);
    }
    if (scope.asOf) {
      filters.serviceDateTo = this.resolveServiceDate(scope.asOf);
    }

    return filters;
  }

  private async loadDailyDispatchRecords(filters: Record<string, unknown>) {
    const reportingService = this.requireReportingService();
    const query = this.buildDispatchQuery(filters);
    return reportingService.listDailyDispatchRecords(query);
  }

  private buildDispatchQuery(
    filters: Record<string, unknown>,
  ): DailyDispatchRecordQuery {
    const query: DailyDispatchRecordQuery = {};
    const serviceDate = this.readString(filters, "serviceDate");
    if (serviceDate) {
      query.serviceDate = serviceDate;
    }
    const serviceDateFrom =
      this.readString(filters, "serviceDateFrom") ??
      this.readString(filters, "from");
    if (serviceDateFrom) {
      query.serviceDateFrom = serviceDateFrom;
    }
    const serviceDateTo =
      this.readString(filters, "serviceDateTo") ??
      this.readString(filters, "to");
    if (serviceDateTo) {
      query.serviceDateTo = serviceDateTo;
    }
    const orderId = this.readString(filters, "orderId");
    if (orderId) {
      query.orderId = orderId;
    }
    const tenantId = this.readString(filters, "tenantId");
    if (tenantId) {
      query.tenantId = tenantId;
    }
    const partnerId = this.readString(filters, "partnerId");
    if (partnerId) {
      query.partnerId = partnerId;
    }
    const serviceProductCode = this.readString(filters, "serviceProductCode");
    if (serviceProductCode) {
      query.serviceProductCode = serviceProductCode;
    }
    const finalStatus = this.readString(filters, "finalStatus");
    if (finalStatus) {
      query.finalStatus = finalStatus;
    }
    return query;
  }

  private filterTakeovers(
    takeovers: CorrelatedTakeoverCase[],
    filters: Record<string, unknown>,
    scope: ExperimentScope,
  ) {
    const vehicleId = this.readString(filters, "vehicleId");
    const orderId = this.readString(filters, "orderId");
    const correlationId = this.readString(filters, "takeoverCorrelationId");
    const from =
      this.readString(filters, "occurredAtFrom") ??
      this.readString(filters, "from");
    const to =
      this.readString(filters, "occurredAtTo") ??
      this.readString(filters, "to");

    return takeovers.filter((candidate) => {
      if (
        scope.vehicleIds.size > 0 &&
        !scope.vehicleIds.has(candidate.vehicleId)
      ) {
        return false;
      }
      if (
        scope.programCode &&
        candidate.safetyOperatorTakeoverReport.sandboxProgramId !==
          scope.programCode
      ) {
        return false;
      }
      if (vehicleId && candidate.vehicleId !== vehicleId) {
        return false;
      }
      if (orderId && candidate.orderId !== orderId) {
        return false;
      }
      if (correlationId && candidate.takeoverCorrelationId !== correlationId) {
        return false;
      }
      return this.matchesTimeRange(
        candidate.sourceTimestamps.safetyOccurredAt,
        from,
        to,
      );
    });
  }

  private filterTeslaEvents(
    events: TeslaAutonomyTransitionEvent[],
    filters: Record<string, unknown>,
    scope: ExperimentScope,
  ) {
    const vehicleId = this.readString(filters, "vehicleId");
    const orderId = this.readString(filters, "orderId");
    const autonomySessionId = this.readString(filters, "autonomySessionId");
    const from =
      this.readString(filters, "occurredAtFrom") ??
      this.readString(filters, "from");
    const to =
      this.readString(filters, "occurredAtTo") ??
      this.readString(filters, "to");

    return events.filter((event) => {
      if (scope.vehicleIds.size > 0 && !scope.vehicleIds.has(event.vehicleId)) {
        return false;
      }
      if (vehicleId && event.vehicleId !== vehicleId) {
        return false;
      }
      if (orderId && event.orderId !== orderId) {
        return false;
      }
      if (autonomySessionId && event.autonomySessionId !== autonomySessionId) {
        return false;
      }
      return this.matchesTimeRange(event.occurredAt, from, to);
    });
  }

  private filterIncidents(
    incidents: IncidentRecord[],
    filters: Record<string, unknown>,
    scope: ExperimentScope,
  ) {
    const vehicleId = this.readString(filters, "vehicleId");
    const orderId = this.readString(filters, "orderId");
    const status = this.readString(filters, "incidentStatus");
    const category = this.readString(filters, "incidentCategory");
    const from =
      this.readString(filters, "occurredAtFrom") ??
      this.readString(filters, "from");
    const to =
      this.readString(filters, "occurredAtTo") ??
      this.readString(filters, "to");

    return incidents.filter((incident) => {
      if (scope.vehicleIds.size > 0) {
        if (!incident.relatedVehicleId) {
          return false;
        }
        if (!scope.vehicleIds.has(incident.relatedVehicleId)) {
          return false;
        }
      }
      if (vehicleId && incident.relatedVehicleId !== vehicleId) {
        return false;
      }
      if (orderId && incident.relatedOrderId !== orderId) {
        return false;
      }
      if (status && incident.status !== status) {
        return false;
      }
      if (category && incident.category !== category) {
        return false;
      }
      return this.matchesTimeRange(
        incident.occurredAt ?? incident.createdAt,
        from,
        to,
      );
    });
  }

  private filterNotifications(
    notifications: RegulatoryNotificationRecord[],
    vehicleIds: Set<string>,
    jurisdictionCodes: Set<string>,
  ) {
    return notifications.filter(
      (notification) =>
        vehicleIds.has(notification.vehicleId) ||
        jurisdictionCodes.has(notification.jurisdiction),
    );
  }

  private matchesDispatchRecord(
    record: {
      finalVehicleId?: unknown;
      serviceDate?: unknown;
      requestedAt?: unknown;
    },
    filters: Record<string, unknown>,
    scope: ExperimentScope,
  ) {
    if (scope.vehicleIds.size > 0) {
      if (typeof record.finalVehicleId !== "string") {
        return false;
      }
      if (!scope.vehicleIds.has(record.finalVehicleId)) {
        return false;
      }
    }
    const vehicleId = this.readString(filters, "vehicleId");
    if (
      vehicleId &&
      typeof record.finalVehicleId === "string" &&
      record.finalVehicleId !== vehicleId
    ) {
      return false;
    }
    const from =
      this.readString(filters, "serviceDateFrom") ??
      this.readString(filters, "from");
    const to =
      this.readString(filters, "serviceDateTo") ??
      this.readString(filters, "to");
    return this.matchesTimeRange(
      typeof record.serviceDate === "string"
        ? record.serviceDate
        : typeof record.requestedAt === "string"
          ? record.requestedAt
          : null,
      from,
      to,
    );
  }

  private listTakeovers() {
    return this.requireRocOperationsService().listTakeovers();
  }

  private listTeslaAutonomyTransitionEvents() {
    return this.requireRocOperationsService().listTeslaAutonomyTransitionEvents();
  }

  private listIncidents() {
    return this.requireIncidentService().listIncidents();
  }

  private listNotifications() {
    return this.regulatoryReportingService?.listNotifications() ?? [];
  }

  private filterInvestigations(scope: ExperimentScope) {
    return (
      this.platformAdminComplianceService?.listInvestigations() ?? []
    ).filter(
      (caseRecord) =>
        scope.vehicleIds.size === 0 ||
        scope.vehicleIds.has(caseRecord.vehicleId),
    );
  }

  private filterLegalHolds(
    scope: ExperimentScope,
    investigations: Array<{ caseId: string }>,
  ) {
    const caseIds = new Set(
      investigations.map((caseRecord) => caseRecord.caseId),
    );
    return (this.platformAdminComplianceService?.listLegalHolds() ?? []).filter(
      (hold) =>
        caseIds.size > 0
          ? caseIds.has(hold.caseId)
          : scope.vehicleIds.size === 0,
    );
  }

  private filterControlledExports(
    scope: ExperimentScope,
    investigations: Array<{ caseId: string }>,
    legalHolds: SandboxLegalHoldRecord[],
  ) {
    const caseIds = new Set(
      investigations.map((caseRecord) => caseRecord.caseId),
    );
    const manifestIds = new Set(legalHolds.map((hold) => hold.manifestId));
    return (
      this.platformAdminComplianceService?.listControlledExports() ?? []
    ).filter((record) => {
      if (caseIds.size === 0 && manifestIds.size === 0) {
        return scope.vehicleIds.size === 0;
      }
      return (
        (record.caseId !== null && caseIds.has(record.caseId)) ||
        manifestIds.has(record.manifestId)
      );
    });
  }

  private tryLoadTelemetryStatus(vehicleId: string) {
    try {
      return this.requireTeslaIntegrationService().getTelemetryStatus(
        vehicleId,
      );
    } catch {
      return null;
    }
  }

  private tryLoadPublicTelemetrySample(vehicleId: string) {
    try {
      return this.requireTeslaIntegrationService().getPublicTelemetrySample(
        vehicleId,
      );
    } catch {
      return null;
    }
  }

  private tryLoadTelemetryProjection(vehicleId: string) {
    try {
      return this.requireTeslaIntegrationService().getTelemetryProjection(
        vehicleId,
      );
    } catch {
      return null;
    }
  }

  private createEvidenceTrace(
    sourceModule: string,
    sourceType: string,
    sourceId: string,
    occurredAt: string | null,
    summary: string,
    record: unknown,
  ): RegulatoryReportEvidenceTraceRecord {
    return {
      evidenceId: `${sourceType}:${sourceId}`,
      sourceModule,
      sourceType,
      sourceId,
      occurredAt,
      manifestHash: this.computeHash(record),
      summary,
      record: this.cloneJson(record as Record<string, unknown>),
    };
  }

  private createArtifact(
    artifactType: "report" | "filing",
    subjectId: string,
    payload: Record<string, unknown>,
  ): RegulatoryArtifactView {
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

  private requireReportJob(jobId: string) {
    const job = this.reportJobs.find((candidate) => candidate.jobId === jobId);
    if (!job) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "REGULATORY_REPORT_JOB_NOT_FOUND",
        `Regulatory report job '${jobId}' was not found.`,
      );
    }
    return job;
  }

  private requireResumeDossier(dossierId: string) {
    const dossier = this.resumeDossiers.find(
      (candidate) => candidate.dossierId === dossierId,
    );
    if (!dossier) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "RESUME_AUTHORIZATION_DOSSIER_NOT_FOUND",
        `Resume authorization dossier '${dossierId}' was not found.`,
      );
    }
    return dossier;
  }

  private requireReportType(value: unknown): Phase2RegulatoryReportJobType {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (REGULATORY_REPORT_TYPE_SET.has(normalized)) {
      return normalized as Phase2RegulatoryReportJobType;
    }
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "REGULATORY_REPORT_TYPE_INVALID",
      "Invalid regulatory report type.",
      {
        allowedValues: [...PHASE2_REGULATORY_REPORT_JOB_TYPES],
        received: value,
      },
    );
  }

  private requireFormat(value: unknown) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (REPORT_OUTPUT_FORMAT_SET.has(normalized)) {
      return normalized as CreateRegulatoryReportJobCommand["format"];
    }
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "REGULATORY_REPORT_FORMAT_INVALID",
      "Invalid regulatory report output format.",
      {
        allowedValues: [...REPORT_OUTPUT_FORMATS],
        received: value,
      },
    );
  }

  private normalizeFilters(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    return { ...(input as Record<string, unknown>) };
  }

  private deriveRequestedPeriod(filters: Record<string, unknown>) {
    const serviceDate = this.readString(filters, "serviceDate");
    const from =
      this.readString(filters, "from") ??
      this.readString(filters, "serviceDateFrom") ??
      this.readString(filters, "occurredAtFrom") ??
      serviceDate;
    const to =
      this.readString(filters, "to") ??
      this.readString(filters, "serviceDateTo") ??
      this.readString(filters, "occurredAtTo") ??
      serviceDate;
    return {
      from,
      to,
      asOf: this.readString(filters, "asOf"),
    };
  }

  private resolveReportPeriod(
    requested: RegulatoryReportPeriodRecord,
    evidenceTrace: RegulatoryReportEvidenceTraceRecord[],
  ): RegulatoryReportPeriodRecord {
    if (requested.from && requested.to) {
      return requested;
    }
    const timestamps = evidenceTrace
      .map((trace) => trace.occurredAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    return {
      from: requested.from ?? timestamps[0] ?? null,
      to: requested.to ?? timestamps[timestamps.length - 1] ?? null,
      asOf: requested.asOf,
    };
  }

  private readString(filters: Record<string, unknown>, key: string) {
    const value = filters[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private readStringArray(filters: Record<string, unknown>, key: string) {
    const value = filters[key];
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private matchesTimeRange(
    value: string | null,
    from: string | null,
    to: string | null,
  ) {
    if (!value) {
      return from === null && to === null;
    }
    const comparable = value.length === 10 ? `${value}T00:00:00.000Z` : value;
    const lowerBound =
      from && from.length === 10 ? `${from}T00:00:00.000Z` : from;
    const upperBound = to && to.length === 10 ? `${to}T23:59:59.999Z` : to;
    if (lowerBound && comparable < lowerBound) {
      return false;
    }
    if (upperBound && comparable > upperBound) {
      return false;
    }
    return true;
  }

  private resolveServiceDate(value: string | null | undefined) {
    if (!value) {
      return "unknown";
    }
    return value.slice(0, 10);
  }

  private countBy(rows: Record<string, unknown>[], key: string) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value =
        typeof row[key] === "string" && row[key] ? String(row[key]) : "unknown";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Object.fromEntries(
      [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  private flattenCount(rows: Record<string, unknown>[], key: string) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const values = Array.isArray(row[key]) ? row[key] : [];
      for (const value of values) {
        if (typeof value !== "string" || !value) {
          continue;
        }
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return Object.fromEntries(
      [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  private cloneReportJob(
    job: StoredRegulatoryReportJob,
  ): RegulatoryReportJobRecord {
    return {
      jobId: job.jobId,
      reportType: job.reportType,
      format: job.format,
      status: job.status,
      filters: this.cloneJson(job.filters),
      artifact: job.artifact
        ? {
            artifactId: job.artifact.artifactId,
            artifactType: job.artifact.artifactType,
            downloadUrl: job.artifact.downloadUrl,
            expiresAt: job.artifact.expiresAt,
            manifestHash: job.artifact.manifestHash,
            immutable: true,
          }
        : null,
      rowCount: job.rowCount,
      evidenceCount: job.evidenceCount,
      reportPeriod: { ...job.reportPeriod },
      generatedAt: job.generatedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private cloneReportJobDetail(
    job: StoredRegulatoryReportJob,
  ): RegulatoryReportJobDetailRecord {
    return {
      ...this.cloneReportJob(job),
      artifact: job.artifact
        ? {
            ...job.artifact,
            downloadMetadata: { ...job.artifact.downloadMetadata },
          }
        : null,
      rows: job.rows.map((row) => this.cloneJson(row)),
      evidenceTrace: job.evidenceTrace.map((trace) => this.cloneJson(trace)),
      sections: job.sections.map((section) => this.cloneJson(section)),
    };
  }

  private cloneResumeDossier(
    dossier: StoredResumeAuthorizationDossier,
  ): ResumeAuthorizationDossierRecord {
    return {
      ...dossier,
      artifact: dossier.artifact
        ? {
            ...dossier.artifact,
            downloadMetadata: { ...dossier.artifact.downloadMetadata },
          }
        : null,
      complianceSummary: this.cloneJson(dossier.complianceSummary),
      complianceSnapshot: this.cloneJson(dossier.complianceSnapshot),
      reportJobs: dossier.reportJobs.map((job) => this.cloneJson(job)),
      sections: dossier.sections.map((section) => this.cloneJson(section)),
      sourceRefs: dossier.sourceRefs.map((sourceRef) =>
        this.cloneJson(sourceRef),
      ),
    };
  }

  private cloneJson<T>(value: T): T {
    return structuredClone(value);
  }

  private computeHash(payload: unknown) {
    return createHash("sha256")
      .update(this.stableSerialize(payload))
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
          const nested = (value as Record<string, unknown>)[key];
          return `${JSON.stringify(key)}:${this.stableSerialize(nested)}`;
        })
        .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
  }

  private buildSnapshotCommand(
    asOf: string | null | undefined,
    actorId: string | null,
  ) {
    const command: {
      actorId: string | null;
      asOf?: string | null;
    } = {
      actorId,
    };
    if (asOf !== undefined) {
      command.asOf = asOf;
    }
    return command;
  }

  private normalizePositiveInteger(
    value: number | undefined,
    fallback: number,
  ) {
    if (!Number.isInteger(value) || (value as number) <= 0) {
      return fallback;
    }
    return value as number;
  }

  private toPercent(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return null;
    }
    return Math.round((numerator / denominator) * 10_000) / 100;
  }

  private average(values: number[]) {
    if (values.length === 0) {
      return null;
    }
    return (
      Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
      ) / 100
    );
  }

  private diffHours(later: string, earlier: string) {
    const laterMs = new Date(later).getTime();
    const earlierMs = new Date(earlier).getTime();
    if (Number.isNaN(laterMs) || Number.isNaN(earlierMs)) {
      return null;
    }
    return Math.round(((laterMs - earlierMs) / (60 * 60 * 1000)) * 100) / 100;
  }

  private toAuditActorType(
    actorType:
      | BootstrapRequestIdentity["actorType"]
      | EvidenceAccessIdentity["actorType"]
      | undefined
      | null,
  ) {
    switch (actorType) {
      case "platform_admin":
      case "tenant_admin":
      case "ops_user":
      case "partner_api_key":
      case "referral_passenger":
      case "system":
        return actorType;
      default:
        return "system";
    }
  }

  private describeError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private recordAudit(
    input: Parameters<AuditNotificationService["recordAuditLog"]>[0],
    requestId?: string,
  ) {
    if (requestId) {
      this.auditNotificationService.recordAuditLog({
        ...input,
        requestId,
      });
      return;
    }
    this.auditNotificationService.recordAuditLog(input);
  }

  private requireReportingService() {
    if (!this.reportingService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REGULATORY_REPORTING_SOURCE_UNAVAILABLE",
        "Reporting service is not wired for regulatory report jobs.",
      );
    }
    return this.reportingService;
  }

  private requireRocOperationsService() {
    if (!this.rocOperationsService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ROC_OPERATIONS_SERVICE_UNAVAILABLE",
        "ROC operations service is not wired for regulatory report jobs.",
      );
    }
    return this.rocOperationsService;
  }

  private requireTeslaIntegrationService() {
    if (!this.teslaIntegrationService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "TESLA_INTEGRATION_SERVICE_UNAVAILABLE",
        "Tesla integration service is not wired for telemetry completeness reporting.",
      );
    }
    return this.teslaIntegrationService;
  }

  private requireSandboxGovernanceService() {
    if (!this.sandboxGovernanceService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SANDBOX_GOVERNANCE_SERVICE_UNAVAILABLE",
        "Sandbox governance service is not wired for compliance summary generation.",
      );
    }
    return this.sandboxGovernanceService;
  }

  private requireIncidentService() {
    if (!this.incidentService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "INCIDENT_SERVICE_UNAVAILABLE",
        "Incident service is not wired for regulatory incident reporting.",
      );
    }
    return this.incidentService;
  }
}
