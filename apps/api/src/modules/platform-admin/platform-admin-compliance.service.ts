import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";

import type {
  AccidentCaseRecord,
  AccidentTimelineEntry,
  ApproveSandboxControlledEvidenceExportCommand,
  ApproveSandboxLegalHoldReleaseCommand,
  CrossAppResourceLink,
  CorrelatedTakeoverCase,
  CreateSandboxLegalHoldCommand,
  EvidenceDiscrepancyCase,
  SandboxControlledEvidenceExportRecord,
  SandboxEvidenceManifestView,
  SandboxLegalHoldRecord,
  RequestSandboxControlledEvidenceExportCommand,
  RequestSandboxLegalHoldReleaseCommand,
  AuditLogRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { AuditedActionResult } from "../../common/action-receipt";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { AccidentInvestigationService } from "../accident-investigation/accident-investigation.service";
import { VehicleEvidenceService } from "../vehicle-evidence/vehicle-evidence.service";

@Injectable()
export class PlatformAdminComplianceService {
  private readonly controlledExports = new Map<
    string,
    SandboxControlledEvidenceExportRecord
  >();
  private readonly legalHolds = new Map<string, SandboxLegalHoldRecord>();

  constructor(
    private readonly accidentInvestigationService: AccidentInvestigationService,
    private readonly auditNotificationService: AuditNotificationService,
    private readonly vehicleEvidenceService: VehicleEvidenceService,
  ) {}

  listInvestigations(): AccidentCaseRecord[] {
    return this.accidentInvestigationService.listAccidentCases();
  }

  getInvestigation(caseId: string): AccidentCaseRecord {
    return this.accidentInvestigationService.getAccidentCase(caseId);
  }

  getInvestigationTimeline(caseId: string): AccidentTimelineEntry[] {
    return this.accidentInvestigationService.getTimeline(caseId);
  }

  listTakeoverReviews(): CorrelatedTakeoverCase[] {
    const investigations = this.listInvestigations();
    return this.accidentInvestigationService
      .listCorrelatedTakeoverCases()
      .map((record) => ({
        ...record,
        investigationLink: this.resolveTakeoverInvestigationLink(
          record,
          investigations,
        ),
      }));
  }

  listEvidenceDiscrepancies(): EvidenceDiscrepancyCase[] {
    const investigations = this.listInvestigations();
    return this.accidentInvestigationService
      .listEvidenceDiscrepancyCases()
      .map((record) => ({
        ...record,
        investigationLink: this.resolveDiscrepancyInvestigationLink(
          record,
          investigations,
        ),
      }));
  }

  getEvidenceManifest(manifestId: string): SandboxEvidenceManifestView {
    const normalizedManifestId = this.requireNonBlank(manifestId, "manifestId");
    const items =
      this.vehicleEvidenceService.listManifestItems(normalizedManifestId);
    if (items.length === 0) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "SANDBOX_EVIDENCE_MANIFEST_NOT_FOUND",
        "The requested sandbox evidence manifest could not be found.",
        { manifestId: normalizedManifestId },
      );
    }

    const relatedCase =
      this.listInvestigations().find(
        (candidate) => candidate.evidenceManifestId === normalizedManifestId,
      ) ?? null;
    const legalHoldActive = [...this.legalHolds.values()].some(
      (hold) =>
        hold.manifestId === normalizedManifestId && hold.status !== "released",
    );
    const capturedAtValues = items.map((item) => item.capturedAt).sort();
    const custodyState = items.every(
      (item) => item.custodyState === items[0]?.custodyState,
    )
      ? (items[0]?.custodyState ?? "captured")
      : "sealed";

    return {
      manifestId: normalizedManifestId,
      vehicleId: relatedCase?.vehicleId ?? items[0]?.vehicleId ?? "unknown",
      caseId: relatedCase?.caseId ?? items[0]?.caseId ?? null,
      windowStart: capturedAtValues[0] ?? new Date().toISOString(),
      windowEnd:
        capturedAtValues[capturedAtValues.length - 1] ??
        new Date().toISOString(),
      itemCount: items.length,
      custodyState,
      createdAt: items[0]?.source.ingestedAt ?? new Date().toISOString(),
      legalHoldActive,
      knownGapCount: items.filter(
        (item) => item.source.sourceSystem === "manual_entry",
      ).length,
      items,
    };
  }

  listControlledExports(): SandboxControlledEvidenceExportRecord[] {
    return [...this.controlledExports.values()]
      .map((record) => this.cloneControlledExport(record))
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }

  requestControlledExport(
    command: RequestSandboxControlledEvidenceExportCommand,
    actorId: string,
    requestId?: string,
  ): AuditedActionResult<SandboxControlledEvidenceExportRecord> {
    const manifest = this.getEvidenceManifest(command.manifestId);
    const now = new Date().toISOString();
    const exportRequestId = `sandbox-export-${randomUUID()}`;
    const record: SandboxControlledEvidenceExportRecord = {
      exportRequestId,
      caseId: manifest.caseId,
      manifestId: manifest.manifestId,
      reportId: this.normalizeOptional(command.reportId),
      recipientLabel: this.requireNonBlank(
        command.recipientLabel,
        "recipientLabel",
      ),
      recipientScope: this.requireNonBlank(
        command.recipientScope,
        "recipientScope",
      ),
      reason: this.requireNonBlank(command.reason, "reason"),
      status: "pending_approval",
      requestedByActorId: actorId,
      requestedAt: now,
      approvedByActorId: null,
      approvedAt: null,
      approvalNote: null,
      completedAt: null,
      artifactChecksumSha256: this.computeManifestHash(manifest),
    };
    this.controlledExports.set(exportRequestId, record);

    const auditLog = this.recordAudit(
      {
        actorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin-compliance",
        actionName: "request_sandbox_evidence_export",
        resourceType: "sandbox_evidence_export",
        resourceId: exportRequestId,
        newValuesSummary: {
          caseId: record.caseId,
          manifestId: record.manifestId,
          recipientLabel: record.recipientLabel,
          recipientScope: record.recipientScope,
        },
      },
      requestId,
    );

    return {
      data: this.cloneControlledExport(record),
      auditLog,
    };
  }

  approveControlledExport(
    exportRequestId: string,
    command: ApproveSandboxControlledEvidenceExportCommand,
    actorId: string,
    requestId?: string,
  ): AuditedActionResult<SandboxControlledEvidenceExportRecord> {
    const record = this.requireControlledExport(exportRequestId);
    if (record.requestedByActorId === actorId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "SANDBOX_EXPORT_SELF_APPROVAL_FORBIDDEN",
        "The same actor who requested the export cannot approve it.",
        { exportRequestId: record.exportRequestId, actorId },
      );
    }
    if (record.status !== "pending_approval") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SANDBOX_EXPORT_NOT_PENDING_APPROVAL",
        "The controlled export request is no longer awaiting approval.",
        {
          exportRequestId: record.exportRequestId,
          status: record.status,
        },
      );
    }

    const updated: SandboxControlledEvidenceExportRecord = {
      ...record,
      status: "approved",
      approvedByActorId: actorId,
      approvedAt: new Date().toISOString(),
      approvalNote: this.normalizeOptional(command.approvalNote),
    };
    this.controlledExports.set(updated.exportRequestId, updated);

    const auditLog = this.recordAudit(
      {
        actorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin-compliance",
        actionName: "approve_sandbox_evidence_export",
        resourceType: "sandbox_evidence_export",
        resourceId: updated.exportRequestId,
        oldValuesSummary: {
          status: record.status,
          requestedByActorId: record.requestedByActorId,
        },
        newValuesSummary: {
          status: updated.status,
          approvedByActorId: updated.approvedByActorId,
        },
      },
      requestId,
    );

    return {
      data: this.cloneControlledExport(updated),
      auditLog,
    };
  }

  listLegalHolds(): SandboxLegalHoldRecord[] {
    return [...this.legalHolds.values()]
      .map((record) => this.cloneLegalHold(record))
      .sort((left, right) => right.placedAt.localeCompare(left.placedAt));
  }

  placeLegalHold(
    command: CreateSandboxLegalHoldCommand,
    actorId: string,
    requestId?: string,
  ): AuditedActionResult<SandboxLegalHoldRecord> {
    const manifest = this.getEvidenceManifest(command.manifestId);
    const caseRecord = this.getInvestigation(command.caseId);
    if (caseRecord.evidenceManifestId !== manifest.manifestId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SANDBOX_LEGAL_HOLD_CASE_MANIFEST_MISMATCH",
        "The requested legal hold case and manifest do not match.",
        {
          caseId: caseRecord.caseId,
          manifestId: manifest.manifestId,
        },
      );
    }

    const now = new Date().toISOString();
    const holdId = `sandbox-hold-${randomUUID()}`;
    const record: SandboxLegalHoldRecord = {
      holdId,
      caseId: caseRecord.caseId,
      manifestId: manifest.manifestId,
      scopeSummary: this.requireNonBlank(command.scopeSummary, "scopeSummary"),
      reason: this.requireNonBlank(command.reason, "reason"),
      status: "active",
      retentionConflictResolved: true,
      placedByActorId: actorId,
      placedAt: now,
      expiresAt: this.normalizeOptional(command.expiresAt),
      releaseRequestedByActorId: null,
      releaseRequestedAt: null,
      releaseRequestReason: null,
      releasedByActorId: null,
      releasedAt: null,
      approvalNote: null,
    };
    this.legalHolds.set(holdId, record);

    const auditLog = this.recordAudit(
      {
        actorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin-compliance",
        actionName: "place_sandbox_legal_hold",
        resourceType: "sandbox_legal_hold",
        resourceId: holdId,
        newValuesSummary: {
          caseId: record.caseId,
          manifestId: record.manifestId,
          scopeSummary: record.scopeSummary,
        },
      },
      requestId,
    );

    return {
      data: this.cloneLegalHold(record),
      auditLog,
    };
  }

  requestLegalHoldRelease(
    holdId: string,
    command: RequestSandboxLegalHoldReleaseCommand,
    actorId: string,
    requestId?: string,
  ): AuditedActionResult<SandboxLegalHoldRecord> {
    const record = this.requireLegalHold(holdId);
    if (record.status === "released") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SANDBOX_LEGAL_HOLD_ALREADY_RELEASED",
        "The sandbox legal hold has already been released.",
        { holdId: record.holdId },
      );
    }
    if (record.status === "release_requested") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SANDBOX_LEGAL_HOLD_RELEASE_ALREADY_REQUESTED",
        "A release request is already pending approval for this legal hold.",
        { holdId: record.holdId },
      );
    }

    const updated: SandboxLegalHoldRecord = {
      ...record,
      status: "release_requested",
      releaseRequestedByActorId: actorId,
      releaseRequestedAt: new Date().toISOString(),
      releaseRequestReason: this.requireNonBlank(
        command.releaseReason,
        "releaseReason",
      ),
    };
    this.legalHolds.set(updated.holdId, updated);

    const auditLog = this.recordAudit(
      {
        actorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin-compliance",
        actionName: "request_sandbox_legal_hold_release",
        resourceType: "sandbox_legal_hold",
        resourceId: updated.holdId,
        oldValuesSummary: { status: record.status },
        newValuesSummary: {
          status: updated.status,
          releaseRequestedByActorId: updated.releaseRequestedByActorId,
        },
      },
      requestId,
    );

    return {
      data: this.cloneLegalHold(updated),
      auditLog,
    };
  }

  approveLegalHoldRelease(
    holdId: string,
    command: ApproveSandboxLegalHoldReleaseCommand,
    actorId: string,
    requestId?: string,
  ): AuditedActionResult<SandboxLegalHoldRecord> {
    const record = this.requireLegalHold(holdId);
    if (record.status !== "release_requested") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SANDBOX_LEGAL_HOLD_RELEASE_NOT_PENDING",
        "The sandbox legal hold is not awaiting a release approval.",
        {
          holdId: record.holdId,
          status: record.status,
        },
      );
    }
    if (record.releaseRequestedByActorId === actorId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "SANDBOX_LEGAL_HOLD_SELF_APPROVAL_FORBIDDEN",
        "The same actor who requested the release cannot approve it.",
        { holdId: record.holdId, actorId },
      );
    }

    const updated: SandboxLegalHoldRecord = {
      ...record,
      status: "released",
      releasedByActorId: actorId,
      releasedAt: new Date().toISOString(),
      approvalNote: this.normalizeOptional(command.approvalNote),
    };
    this.legalHolds.set(updated.holdId, updated);

    const auditLog = this.recordAudit(
      {
        actorId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin-compliance",
        actionName: "approve_sandbox_legal_hold_release",
        resourceType: "sandbox_legal_hold",
        resourceId: updated.holdId,
        oldValuesSummary: {
          status: record.status,
          releaseRequestedByActorId: record.releaseRequestedByActorId,
        },
        newValuesSummary: {
          status: updated.status,
          releasedByActorId: updated.releasedByActorId,
        },
      },
      requestId,
    );

    return {
      data: this.cloneLegalHold(updated),
      auditLog,
    };
  }

  private requireControlledExport(exportRequestId: string) {
    const record = this.controlledExports.get(exportRequestId);
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "SANDBOX_CONTROLLED_EXPORT_NOT_FOUND",
        "The requested sandbox controlled export could not be found.",
        { exportRequestId },
      );
    }
    return record;
  }

  private requireLegalHold(holdId: string) {
    const record = this.legalHolds.get(holdId);
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "SANDBOX_LEGAL_HOLD_NOT_FOUND",
        "The requested sandbox legal hold could not be found.",
        { holdId },
      );
    }
    return record;
  }

  private computeManifestHash(manifest: SandboxEvidenceManifestView) {
    return createHash("sha256")
      .update(
        JSON.stringify({
          manifestId: manifest.manifestId,
          itemCount: manifest.itemCount,
          items: manifest.items.map((item) => ({
            artifactId: item.artifactId,
            checksumSha256: item.checksumSha256,
          })),
        }),
      )
      .digest("hex");
  }

  private resolveTakeoverInvestigationLink(
    record: CorrelatedTakeoverCase,
    investigations: readonly AccidentCaseRecord[],
  ): CrossAppResourceLink {
    const linkedCase =
      investigations.find(
        (candidate) =>
          record.takeoverCorrelationId != null &&
          candidate.takeoverCorrelationId === record.takeoverCorrelationId,
      ) ??
      investigations.find(
        (candidate) =>
          record.orderId != null && candidate.orderId === record.orderId,
      ) ??
      null;

    if (linkedCase) {
      return this.buildInvestigationDetailLink(linkedCase.caseId);
    }

    return this.buildInvestigationQueueLink(
      "sandbox_takeover_case",
      record.correlatedTakeoverCaseId,
    );
  }

  private resolveDiscrepancyInvestigationLink(
    record: EvidenceDiscrepancyCase,
    investigations: readonly AccidentCaseRecord[],
  ): CrossAppResourceLink {
    const linkedCase =
      investigations.find((candidate) =>
        candidate.discrepancyCaseIds.includes(record.discrepancyCaseId),
      ) ?? null;

    if (linkedCase) {
      return this.buildInvestigationDetailLink(linkedCase.caseId);
    }

    return this.buildInvestigationQueueLink(
      "sandbox_takeover_discrepancy",
      record.discrepancyCaseId,
    );
  }

  private buildInvestigationDetailLink(caseId: string): CrossAppResourceLink {
    return {
      targetApp: "platform-admin",
      route: `/platform-admin/investigations/${encodeURIComponent(caseId)}`,
      resourceType: "sandbox_investigation_case",
      resourceId: caseId,
      openMode: "new_tab",
      label: "Open investigation case",
      requiredScopes: ["sandbox.investigation.read"],
    };
  }

  private buildInvestigationQueueLink(
    resourceType: string,
    resourceId: string,
  ): CrossAppResourceLink {
    return {
      targetApp: "platform-admin",
      route: "/platform-admin/investigations",
      resourceType,
      resourceId,
      openMode: "new_tab",
      label: "Open investigations queue",
      requiredScopes: ["sandbox.investigation.read"],
    };
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    return this.auditNotificationService.recordAuditLog({
      ...input,
      ...(requestId ? { requestId } : {}),
    });
  }

  private requireNonBlank(value: string | null | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "SANDBOX_COMPLIANCE_INVALID_INPUT",
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

  private cloneControlledExport(
    record: SandboxControlledEvidenceExportRecord,
  ): SandboxControlledEvidenceExportRecord {
    return { ...record };
  }

  private cloneLegalHold(
    record: SandboxLegalHoldRecord,
  ): SandboxLegalHoldRecord {
    return { ...record };
  }
}
