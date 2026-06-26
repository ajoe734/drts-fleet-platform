import { describe, expect, it, vi } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import type { Phase2SourceMetadata } from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { PlatformAdminComplianceService } from "../../src/modules/platform-admin/platform-admin-compliance.service";
import { PlatformAdminRegulatorCasesService } from "../../src/modules/regulatory-reporting/platform-admin-regulator-cases.service";
import { RegulatoryReportingService } from "../../src/modules/regulatory-reporting/regulatory-reporting.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

function buildDriverIdentity(
  safetyOperatorId: string,
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: safetyOperatorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write"],
    requestId: "req-sandbox-compliance-001",
  };
}

function buildGovernanceService() {
  return {
    listSafetyOperatorQualifications: vi.fn(() => [
      {
        qualificationId: "qual-sandbox-001",
        sandboxProgramId: "sandbox-demo-001",
        safetyOperatorId: "safe-op-001",
        providerCode: "tesla",
        version: 1,
        status: "qualified",
        approvedAreaIds: ["area-001"],
        approvedRouteIds: ["route-001"],
        certificationRefs: ["cert-001"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]),
  };
}

function buildSource(
  sourceSystem: Phase2SourceMetadata["sourceSystem"],
  sourceRef: string,
  recordedAt: string,
): Phase2SourceMetadata {
  return {
    sourceSystem,
    sourceRef,
    ingestedAt: recordedAt,
    recordedAt,
    signatureRef: null,
    schemaVersion: "2026-06",
  };
}

describe("E2E-P2 sandbox compliance controls", () => {
  it("enforces four-eyes workflows and emits backend-provided investigation links", async () => {
    const auditNotificationService = new AuditNotificationService();
    const safetyOperatorService = new SafetyOperatorService(
      auditNotificationService,
      undefined,
      buildGovernanceService() as never,
    );
    const rocOperationsService = new RocOperationsService(
      safetyOperatorService,
    );
    const accidentInvestigationService = new AccidentInvestigationService(
      rocOperationsService,
    );
    const vehicleEvidenceService = new VehicleEvidenceService();
    const complianceService = new PlatformAdminComplianceService(
      accidentInvestigationService,
      auditNotificationService,
      vehicleEvidenceService,
    );
    const regulatoryReportingService = new RegulatoryReportingService(
      auditNotificationService,
    );
    const regulatorCasesService = new PlatformAdminRegulatorCasesService(
      accidentInvestigationService,
      auditNotificationService,
      complianceService,
      regulatoryReportingService,
    );

    const recorder = buildMockRecorderFixture({
      recorderId: "rec-sandbox-001",
      vehicleId: "veh-safe-001",
    });
    vehicleEvidenceService.registerRecorder(recorder);

    const identity = buildDriverIdentity("safe-op-001");
    const assignment = await safetyOperatorService.createAssignment(
      {
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
      },
      identity,
    );
    const shift = await safetyOperatorService.startShift(
      {
        safetyOperatorId: "safe-op-001",
        sandboxProgramId: "sandbox-demo-001",
        deviceId: "device-safe-001",
        vehicleId: "veh-safe-001",
        assignmentId: assignment.assignmentId,
        startLocation: { lat: 25.04, lng: 121.56 },
        notes: "Sandbox compliance integration test shift.",
      },
      identity,
    );

    await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-safe-001",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        correlationId: "corr-safe-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: "inc-safe-001",
        evidenceArtifactIds: ["mock-artifact-001"],
        notes: "Takeover report for compliance controls integration.",
        occurredAt: "2026-06-26T08:00:00.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent({
      eventId: "tesla-safe-001",
      takeoverCorrelationId: "corr-safe-001",
      autonomySessionId: "session-safe-001",
      vehicleId: "veh-safe-001",
      orderId: "ord-safe-001",
      transitionType: "manual_takeover",
      occurredAt: "2026-06-26T08:00:20.000Z",
      source: buildSource(
        "tesla_fleet_api",
        "tesla-safe-001",
        "2026-06-26T08:00:20.000Z",
      ),
    });
    rocOperationsService.recordRocTakeoverResponseRecord({
      responseId: "roc-safe-001",
      takeoverCorrelationId: "corr-safe-002",
      autonomySessionId: "session-safe-001",
      triggeredByTeslaEventId: "tesla-safe-001",
      rocOperatorId: "roc-safe-001",
      vehicleId: "veh-safe-001",
      orderId: "ord-safe-001",
      responseType: "remote_assist",
      requestedAt: "2026-06-26T08:01:00.000Z",
      respondedAt: "2026-06-26T08:01:30.000Z",
      resolvedAt: null,
      outcomeNote:
        "ROC response linked through Tesla event with correlation mismatch.",
      source: buildSource(
        "roc_operator",
        "roc-safe-001",
        "2026-06-26T08:01:00.000Z",
      ),
    });

    const accidentCase = accidentInvestigationService.createAccidentCase({
      caseId: "acc-sandbox-001",
      vehicleId: "veh-safe-001",
      orderId: "ord-safe-001",
      takeoverCorrelationId: "corr-safe-001",
      severity: "major",
      occurredAt: "2026-06-26T08:00:00.000Z",
      reportedAt: "2026-06-26T08:00:45.000Z",
      reportedBy: "roc-safe-001",
      evidenceManifestId: "mock-manifest-001",
      regulatoryReportId: "job-incident-filing-acc-0214",
      summary: "Sandbox compliance integration test case.",
    });

    const exportRequest = complianceService.requestControlledExport(
      {
        caseId: accidentCase.caseId,
        manifestId: "mock-manifest-001",
        reportId: "job-incident-filing-acc-0214",
        recipientLabel: "Taipei City Transportation Department",
        recipientScope: "regulator.viewer.taipei_city",
        reason: "Initial regulator evidence bundle request.",
      },
      "cmp-requester-001",
    );

    expect(() =>
      complianceService.approveControlledExport(
        exportRequest.data.exportRequestId,
        {},
        "cmp-requester-001",
      ),
    ).toThrowError(ApiRequestError);

    let exportSelfApprovalError: ApiRequestError | null = null;
    try {
      complianceService.approveControlledExport(
        exportRequest.data.exportRequestId,
        {},
        "cmp-requester-001",
      );
    } catch (error) {
      exportSelfApprovalError = error as ApiRequestError;
    }
    expect(exportSelfApprovalError?.getResponse()).toMatchObject({
      error: { code: "SANDBOX_EXPORT_SELF_APPROVAL_FORBIDDEN" },
    });

    const approvedExport = complianceService.approveControlledExport(
      exportRequest.data.exportRequestId,
      { approvalNote: "Approved by secondary compliance actor." },
      "cmp-approver-001",
    );
    expect(approvedExport.data).toMatchObject({
      status: "approved",
      approvedByActorId: "cmp-approver-001",
    });

    const hold = complianceService.placeLegalHold(
      {
        caseId: accidentCase.caseId,
        manifestId: "mock-manifest-001",
        scopeSummary: "3 evidence items + linked trip investigation",
        reason: "Regulator hold pending follow-up review.",
      },
      "cmp-hold-owner-001",
    );
    const releaseRequest = complianceService.requestLegalHoldRelease(
      hold.data.holdId,
      { releaseReason: "Regulatory review closed." },
      "cmp-release-requester-001",
    );

    expect(() =>
      complianceService.approveLegalHoldRelease(
        hold.data.holdId,
        {},
        "cmp-release-requester-001",
      ),
    ).toThrowError(ApiRequestError);

    let holdSelfApprovalError: ApiRequestError | null = null;
    try {
      complianceService.approveLegalHoldRelease(
        hold.data.holdId,
        {},
        "cmp-release-requester-001",
      );
    } catch (error) {
      holdSelfApprovalError = error as ApiRequestError;
    }
    expect(holdSelfApprovalError?.getResponse()).toMatchObject({
      error: { code: "SANDBOX_LEGAL_HOLD_SELF_APPROVAL_FORBIDDEN" },
    });

    const releasedHold = complianceService.approveLegalHoldRelease(
      releaseRequest.data.holdId,
      { approvalNote: "Released by secondary compliance approver." },
      "cmp-release-approver-001",
    );
    expect(releasedHold.data).toMatchObject({
      status: "released",
      releasedByActorId: "cmp-release-approver-001",
    });

    const takeoverReviews = complianceService.listTakeoverReviews();
    const discrepancies = complianceService.listEvidenceDiscrepancies();

    expect(takeoverReviews[0]?.investigationLink).toMatchObject({
      targetApp: "platform-admin",
      route: `/platform-admin/investigations/${encodeURIComponent(
        accidentCase.caseId,
      )}`,
      resourceType: "sandbox_investigation_case",
      resourceId: accidentCase.caseId,
      requiredScopes: ["sandbox.investigation.read"],
    });
    expect(discrepancies[0]?.investigationLink).toMatchObject({
      targetApp: "platform-admin",
      route: `/platform-admin/investigations/${encodeURIComponent(
        accidentCase.caseId,
      )}`,
      resourceType: "sandbox_investigation_case",
      resourceId: accidentCase.caseId,
      requiredScopes: ["sandbox.investigation.read"],
    });

    regulatoryReportingService.createNotification(
      {
        eventId: "evt-regulator-001",
        eventType: "incident_report",
        severity: "incident",
        reportVersionKind: "initial",
        jurisdiction: "taipei_city",
        vehicleId: accidentCase.vehicleId,
        incidentId: accidentCase.caseId,
        reportId: "job-incident-filing-acc-0214",
        eventOccurredAt: accidentCase.occurredAt,
        summary: "Initial regulator notification for sandbox compliance test.",
      },
      {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "cmp-regulator-owner-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform_admin"],
        roles: ["platform_admin", "compliance_manager"],
        scopes: ["sandbox.regulatory_report.review"],
        requestId: "req-regulator-case-notification-001",
      },
      "req-regulator-case-notification-001",
    );

    const regulatorSummary = regulatorCasesService.listRegulatorCases();
    expect(regulatorSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: accidentCase.caseId,
          experimentId: "sandbox-demo-001",
          bundleState: "export_approved",
          notificationState: "draft",
          maskingApplied: true,
        }),
      ]),
    );

    const regulatorDetail = regulatorCasesService.getRegulatorCase(
      accidentCase.caseId,
    );
    expect(regulatorDetail).toMatchObject({
      caseId: accidentCase.caseId,
      experimentId: "sandbox-demo-001",
      report: {
        reportId: "job-incident-filing-acc-0214",
        status: "generated",
      },
      bundleStatus: {
        state: "export_approved",
        latestExportStatus: "approved",
      },
      notificationStatus: {
        state: "draft",
        severity: "incident",
      },
      masking: {
        applied: true,
        policyFamily: "filing_package",
      },
    });
    expect(regulatorDetail.legalHold.active).toBe(false);

    const regulatorExport = regulatorCasesService.requestRegulatorCaseExport(
      accidentCase.caseId,
      {
        reason: "Follow-up regulator evidence request.",
      },
      "cmp-requester-002",
      "req-regulator-export-002",
    );
    expect(regulatorExport.data).toMatchObject({
      caseId: accidentCase.caseId,
      status: "pending_approval",
      recipientScope: "regulator.viewer.taipei_city",
    });

    expect(
      regulatorCasesService.listRegulatorCaseExports(accidentCase.caseId),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exportRequestId: regulatorExport.data.exportRequestId,
        }),
      ]),
    );

    expect(
      regulatorCasesService.listRegulatorCaseAccessLogs(accidentCase.caseId),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "request_sandbox_evidence_export",
          resourceId: regulatorExport.data.exportRequestId,
        }),
      ]),
    );
  });
});
