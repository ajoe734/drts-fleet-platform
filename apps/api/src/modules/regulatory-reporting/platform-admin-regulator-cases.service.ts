import { HttpStatus, Injectable } from "@nestjs/common";

import type {
  AccidentCaseRecord,
  AccidentInvestigationBundleView,
  CorrelatedTakeoverCase,
  RegulatoryNotificationRecord,
  RegulatoryReportFiling,
  RequestSandboxRegulatorCaseExportCommand,
  SandboxControlledEvidenceExportRecord,
  SandboxEvidenceManifestView,
  SandboxLegalHoldRecord,
  SandboxRegulatorCaseAccessLogRecord,
  SandboxRegulatorCaseBundleState,
  SandboxRegulatorCaseSummary,
  SandboxRegulatorCaseView,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { AuditedActionResult } from "../../common/action-receipt";
import { getEvidenceRetentionPolicy } from "../../common/evidence-governance";
import { AccidentInvestigationService } from "../accident-investigation/accident-investigation.service";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { PlatformAdminComplianceService } from "../platform-admin/platform-admin-compliance.service";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

type RegulatorCaseContext = {
  caseRecord: AccidentCaseRecord;
  correlatedTakeover: CorrelatedTakeoverCase | null;
  report: RegulatoryReportFiling | null;
  notification: RegulatoryNotificationRecord | null;
  manifestId: string | null;
  manifest: SandboxEvidenceManifestView | null;
  latestBundle: AccidentInvestigationBundleView | null;
  activeHold: SandboxLegalHoldRecord | null;
  exports: SandboxControlledEvidenceExportRecord[];
  latestExport: SandboxControlledEvidenceExportRecord | null;
};

@Injectable()
export class PlatformAdminRegulatorCasesService {
  constructor(
    private readonly accidentInvestigationService: AccidentInvestigationService,
    private readonly auditNotificationService: AuditNotificationService,
    private readonly platformAdminComplianceService: PlatformAdminComplianceService,
    private readonly regulatoryReportingService: RegulatoryReportingService,
  ) {}

  listRegulatorCases(): SandboxRegulatorCaseSummary[] {
    return this.platformAdminComplianceService
      .listInvestigations()
      .map((caseRecord) => this.toSummary(this.buildCaseContext(caseRecord)))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  getRegulatorCase(caseId: string): SandboxRegulatorCaseView {
    const caseRecord =
      this.platformAdminComplianceService.getInvestigation(caseId);
    return this.toView(this.buildCaseContext(caseRecord));
  }

  listRegulatorCaseExports(
    caseId: string,
  ): SandboxControlledEvidenceExportRecord[] {
    const context = this.buildCaseContext(
      this.platformAdminComplianceService.getInvestigation(caseId),
    );
    return [...context.exports];
  }

  requestRegulatorCaseExport(
    caseId: string,
    command: RequestSandboxRegulatorCaseExportCommand,
    actorId: string,
    requestId?: string,
  ): AuditedActionResult<SandboxControlledEvidenceExportRecord> {
    const context = this.buildCaseContext(
      this.platformAdminComplianceService.getInvestigation(caseId),
    );
    if (!context.manifestId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SANDBOX_REGULATOR_CASE_MANIFEST_REQUIRED",
        "A regulator case export requires a linked evidence manifest.",
        { caseId },
      );
    }

    return this.platformAdminComplianceService.requestControlledExport(
      {
        caseId: context.caseRecord.caseId,
        manifestId: context.manifestId,
        reportId: context.report?.reportId ?? null,
        recipientLabel:
          this.normalizeOptional(command.recipientLabel) ??
          this.defaultRecipientLabel(context.report?.jurisdiction ?? null),
        recipientScope:
          this.normalizeOptional(command.recipientScope) ??
          this.defaultRecipientScope(context.report?.jurisdiction ?? null),
        reason: this.requireNonBlank(command.reason, "reason"),
      },
      actorId,
      requestId,
    );
  }

  listRegulatorCaseAccessLogs(
    caseId: string,
  ): SandboxRegulatorCaseAccessLogRecord[] {
    const context = this.buildCaseContext(
      this.platformAdminComplianceService.getInvestigation(caseId),
    );
    const relatedIds = new Set<string>(
      [
        context.caseRecord.caseId,
        context.caseRecord.orderId,
        context.manifestId,
        context.report?.reportId,
        context.latestBundle?.bundleId,
        context.latestBundle?.manifest.manifestId,
        context.activeHold?.holdId,
        context.notification?.notificationId,
        ...context.exports.map((record) => record.exportRequestId),
      ].filter((value): value is string => Boolean(value)),
    );

    return this.auditNotificationService
      .getAuditLogsSnapshot()
      .filter((auditLog) => this.matchesCaseAudit(auditLog, relatedIds))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((auditLog) => ({
        auditId: auditLog.auditId,
        createdAt: auditLog.createdAt,
        actorId: auditLog.actorId,
        actorType: auditLog.actorType,
        actionName: auditLog.actionName,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        requestId: auditLog.requestId,
      }));
  }

  private buildCaseContext(
    caseRecord: AccidentCaseRecord,
  ): RegulatorCaseContext {
    const reports = this.regulatoryReportingService.listReports();
    const notifications = this.regulatoryReportingService.listNotifications();
    const controlledExports =
      this.platformAdminComplianceService.listControlledExports();
    const legalHolds = this.platformAdminComplianceService.listLegalHolds();
    const correlatedTakeover = this.findCorrelatedTakeover(caseRecord);
    const report =
      reports.find(
        (candidate) => candidate.reportId === caseRecord.regulatoryReportId,
      ) ??
      reports.find((candidate) => candidate.caseId === caseRecord.caseId) ??
      null;
    const manifestId =
      caseRecord.evidenceManifestId ?? report?.evidenceManifestId ?? null;
    const manifest = manifestId
      ? this.tryGetEvidenceManifest(manifestId)
      : null;
    const activeHold =
      legalHolds.find(
        (record) =>
          record.status !== "released" &&
          ((manifestId && record.manifestId === manifestId) ||
            record.caseId === caseRecord.caseId),
      ) ?? null;
    const exports = controlledExports.filter(
      (record) =>
        record.caseId === caseRecord.caseId ||
        (manifestId !== null && record.manifestId === manifestId),
    );
    const notification =
      notifications.find(
        (record) =>
          (report?.reportId && record.reportId === report.reportId) ||
          record.incidentId === caseRecord.caseId,
      ) ?? null;
    const latestBundle =
      this.accidentInvestigationService.getLatestInvestigationBundleForCase(
        caseRecord.caseId,
      );

    return {
      caseRecord,
      correlatedTakeover,
      report,
      notification,
      manifestId,
      manifest,
      latestBundle,
      activeHold,
      exports,
      latestExport: exports[0] ?? null,
    };
  }

  private toSummary(
    context: RegulatorCaseContext,
  ): SandboxRegulatorCaseSummary {
    const { experimentId, experimentLabel } = this.resolveExperiment(context);
    return {
      caseId: context.caseRecord.caseId,
      caseLabel: this.caseLabel(context.caseRecord),
      experimentId,
      experimentLabel,
      jurisdiction: context.report?.jurisdiction ?? null,
      severity: context.caseRecord.severity,
      status: context.caseRecord.status,
      occurredAt: context.caseRecord.occurredAt,
      reportedAt: context.caseRecord.reportedAt,
      manifestId: context.manifestId,
      reportId: context.report?.reportId ?? null,
      reportStatus: context.report?.status ?? null,
      bundleState: this.resolveBundleState(context),
      notificationState: context.notification?.lifecycleStatus ?? "not_started",
      legalHoldActive: Boolean(context.activeHold),
      maskingApplied: true,
    };
  }

  private toView(context: RegulatorCaseContext): SandboxRegulatorCaseView {
    const { experimentId, experimentLabel } = this.resolveExperiment(context);
    const bundleState = this.resolveBundleState(context);
    const latestExportedAt =
      context.latestExport?.completedAt ??
      context.latestExport?.approvedAt ??
      context.latestExport?.requestedAt ??
      null;
    const maskingPolicy = getEvidenceRetentionPolicy("filing_package");

    return {
      caseId: context.caseRecord.caseId,
      caseLabel: this.caseLabel(context.caseRecord),
      experimentId,
      experimentLabel,
      jurisdiction: context.report?.jurisdiction ?? null,
      vehicleId: context.caseRecord.vehicleId,
      orderId: context.caseRecord.orderId,
      severity: context.caseRecord.severity,
      status: context.caseRecord.status,
      occurredAt: context.caseRecord.occurredAt,
      reportedAt: context.caseRecord.reportedAt,
      summary: context.caseRecord.summary,
      manifestSummary: {
        manifestId: context.manifestId,
        itemCount: context.manifest?.itemCount ?? 0,
        custodyState: context.manifest?.custodyState ?? null,
        windowStart: context.manifest?.windowStart ?? null,
        windowEnd: context.manifest?.windowEnd ?? null,
        knownGapCount: context.manifest?.knownGapCount ?? 0,
        artifactChecksumSha256:
          context.latestExport?.artifactChecksumSha256 ??
          context.latestBundle?.manifestHash ??
          null,
      },
      bundleStatus: {
        state: bundleState,
        bundleId: context.latestBundle?.bundleId ?? null,
        generatedAt: context.latestBundle?.generatedAt ?? null,
        manifestHash: context.latestBundle?.manifestHash ?? null,
        knownGapCount:
          context.latestBundle?.knownGaps.length ??
          context.manifest?.knownGapCount ??
          0,
        latestExportRequestId: context.latestExport?.exportRequestId ?? null,
        latestExportStatus: context.latestExport?.status ?? null,
        latestExportedAt,
      },
      report: {
        reportId: context.report?.reportId ?? null,
        reportType: context.report?.reportType ?? null,
        status: context.report?.status ?? null,
        acknowledgementRef: context.report?.acknowledgementRef ?? null,
        generatedAt: context.report?.generatedAt ?? null,
        submittedAt: context.report?.submittedAt ?? null,
      },
      notificationStatus: {
        state: context.notification?.lifecycleStatus ?? "not_started",
        notificationId: context.notification?.notificationId ?? null,
        severity: context.notification?.severity ?? null,
        deadlineAt: context.notification?.deadlineAt ?? null,
        overdue: context.notification?.overdue ?? false,
        submittedAt: context.notification?.submittedAt ?? null,
        acknowledgedAt: context.notification?.acknowledgedAt ?? null,
      },
      legalHold: {
        active: Boolean(context.activeHold),
        holdId: context.activeHold?.holdId ?? null,
        status: context.activeHold?.status ?? null,
        scopeSummary: context.activeHold?.scopeSummary ?? null,
      },
      masking: {
        applied: true,
        policyFamily: "filing_package",
        policyLabel: maskingPolicy.description,
        ruleSummary:
          maskingPolicy.maskingRules.find((rule) => rule.surface === "api_view")
            ?.rule ?? "Masked regulator-facing evidence posture is enforced.",
        maskedFields: [
          "passenger_identity",
          "commercial_terms",
          "raw_bundle_contents",
        ],
      },
    };
  }

  private resolveBundleState(
    context: RegulatorCaseContext,
  ): SandboxRegulatorCaseBundleState {
    switch (context.latestExport?.status) {
      case "pending_approval":
        return "export_pending_approval";
      case "approved":
        return "export_approved";
      case "completed":
        return "export_completed";
      case "rejected":
        return "export_rejected";
      default:
        break;
    }

    if (context.latestBundle) {
      return "bundle_generated";
    }
    if (context.manifestId) {
      return "manifest_ready";
    }
    return "missing_manifest";
  }

  private resolveExperiment(context: RegulatorCaseContext) {
    const experimentId =
      context.correlatedTakeover?.safetyOperatorTakeoverReport
        .sandboxProgramId ?? null;
    return {
      experimentId,
      experimentLabel: experimentId ?? "program_unassigned",
    };
  }

  private findCorrelatedTakeover(
    caseRecord: AccidentCaseRecord,
  ): CorrelatedTakeoverCase | null {
    const takeoverCases =
      this.accidentInvestigationService.listCorrelatedTakeoverCases();
    return (
      takeoverCases.find(
        (candidate) =>
          candidate.takeoverCorrelationId != null &&
          candidate.takeoverCorrelationId === caseRecord.takeoverCorrelationId,
      ) ??
      takeoverCases.find(
        (candidate) =>
          candidate.orderId != null && candidate.orderId === caseRecord.orderId,
      ) ??
      null
    );
  }

  private tryGetEvidenceManifest(manifestId: string) {
    try {
      return this.platformAdminComplianceService.getEvidenceManifest(
        manifestId,
      );
    } catch {
      return null;
    }
  }

  private caseLabel(caseRecord: AccidentCaseRecord) {
    return caseRecord.summary
      ? `${caseRecord.caseId} · ${caseRecord.summary}`
      : caseRecord.caseId;
  }

  private defaultRecipientLabel(jurisdiction: string | null) {
    switch (jurisdiction) {
      case "taipei_city":
        return "Taipei City Transportation Department";
      default:
        return `Regulator evidence desk · ${this.humanizeToken(jurisdiction)}`;
    }
  }

  private defaultRecipientScope(jurisdiction: string | null) {
    return `regulator.viewer.${jurisdiction?.trim() || "unknown"}`;
  }

  private matchesCaseAudit(
    auditLog: {
      resourceId: string | null;
      oldValuesSummary?: Record<string, unknown>;
      newValuesSummary?: Record<string, unknown>;
    },
    relatedIds: ReadonlySet<string>,
  ) {
    if (auditLog.resourceId && relatedIds.has(auditLog.resourceId)) {
      return true;
    }

    const summaryText = JSON.stringify({
      oldValuesSummary: auditLog.oldValuesSummary ?? null,
      newValuesSummary: auditLog.newValuesSummary ?? null,
    });
    return [...relatedIds].some((identifier) =>
      summaryText.includes(identifier),
    );
  }

  private humanizeToken(value: string | null | undefined) {
    if (!value) {
      return "Unknown";
    }
    return value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private requireNonBlank(value: string | null | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "SANDBOX_REGULATOR_CASE_INVALID_INPUT",
        `The ${field} field is required.`,
        { field },
      );
    }
    return normalized;
  }

  private normalizeOptional(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
