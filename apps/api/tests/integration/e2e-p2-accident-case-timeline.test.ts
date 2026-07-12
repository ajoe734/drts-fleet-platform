import { describe, expect, it, vi } from "vitest";

import type { Phase2SourceMetadata } from "@drts/contracts";

import { AccidentInvestigationController } from "../../src/modules/accident-investigation/accident-investigation.controller";
import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";

function buildSource(
  sourceSystem: Phase2SourceMetadata["sourceSystem"],
  sourceRef: string,
  recordedAt: string,
  signatureRef: string | null = null,
): Phase2SourceMetadata {
  return {
    sourceSystem,
    sourceRef,
    ingestedAt: recordedAt,
    recordedAt,
    signatureRef,
    schemaVersion: "2026-06",
  };
}

function buildGovernanceService() {
  return {
    listSafetyOperatorQualifications: vi.fn(() => [
      {
        qualificationId: "qual-safe-acc-001",
        sandboxProgramId: "sandbox-acc-001",
        safetyOperatorId: "safe-op-acc-001",
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

describe("E2E-P2 accident case timeline", () => {
  it("assembles a synchronized timeline with discrepancy links and provider-signed precedence", async () => {
    const safetyOperatorService = new SafetyOperatorService(
      {
        recordAuditLog: vi.fn(),
      } as never,
      undefined,
      buildGovernanceService() as never,
    );
    const rocOperationsService = new RocOperationsService(safetyOperatorService);
    const accidentInvestigationService = new AccidentInvestigationService(
      rocOperationsService,
    );
    const controller = new AccidentInvestigationController(
      accidentInvestigationService,
    );

    const identity = {
      authMode: "bootstrap_headers" as const,
      actorType: "driver_user" as const,
      actorId: "safe-op-acc-001",
      realm: "driver" as const,
      tenantId: null,
      roleFamilies: ["driver"] as const,
      roles: ["driver_user"],
      scopes: ["driver:read", "driver:write"],
      requestId: "req-accident-e2e-001",
    };

    const assignment = await safetyOperatorService.createAssignment(
      {
        safetyOperatorId: "safe-op-acc-001",
        vehicleId: "veh-acc-001",
        orderId: "ord-acc-001",
        sandboxProgramId: "sandbox-acc-001",
      },
      identity,
    );
    const shift = await safetyOperatorService.startShift(
      {
        safetyOperatorId: "safe-op-acc-001",
        sandboxProgramId: "sandbox-acc-001",
        deviceId: "device-acc-001",
        vehicleId: "veh-acc-001",
        assignmentId: assignment.assignmentId,
        startLocation: { lat: 25.033, lng: 121.5654 },
        notes: "Accident timeline integration test shift.",
      },
      identity,
    );

    await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-acc-001",
        safetyOperatorId: "safe-op-acc-001",
        vehicleId: "veh-acc-001",
        orderId: "ord-acc-001",
        sandboxProgramId: "sandbox-acc-001",
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        correlationId: "corr-acc-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: "inc-acc-001",
        evidenceArtifactIds: ["artifact-acc-001"],
        notes: "Safety operator reported the collision takeover.",
        occurredAt: "2026-06-26T12:00:00.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent({
      eventId: "tesla-acc-001",
      takeoverCorrelationId: "corr-acc-001",
      autonomySessionId: "session-acc-001",
      vehicleId: "veh-acc-001",
      orderId: "ord-acc-001",
      transitionType: "manual_takeover",
      occurredAt: "2026-06-26T12:00:25.000Z",
      source: buildSource(
        "tesla_fleet_api",
        "tesla-acc-001",
        "2026-06-26T12:00:25.000Z",
      ),
    });
    rocOperationsService.recordRocTakeoverResponseRecord({
      responseId: "roc-acc-001",
      takeoverCorrelationId: "corr-acc-002",
      autonomySessionId: "session-acc-001",
      triggeredByTeslaEventId: "tesla-acc-001",
      rocOperatorId: "roc-acc-001",
      vehicleId: "veh-acc-001",
      orderId: "ord-acc-001",
      responseType: "remote_assist",
      requestedAt: "2026-06-26T12:03:30.000Z",
      respondedAt: "2026-06-26T12:04:00.000Z",
      resolvedAt: null,
      outcomeNote: "ROC response was correlated through the Tesla event.",
      source: buildSource(
        "roc_operator",
        "roc-acc-001",
        "2026-06-26T12:03:30.000Z",
      ),
    });

    const accidentCase = accidentInvestigationService.createAccidentCase({
      caseId: "acc-e2e-001",
      vehicleId: "veh-acc-001",
      orderId: "ord-acc-001",
      takeoverCorrelationId: "corr-acc-001",
      severity: "major",
      occurredAt: "2026-06-26T12:00:00.000Z",
      reportedAt: "2026-06-26T12:00:40.000Z",
      reportedBy: "roc-acc-001",
      summary: "Vehicle collision detected during takeover sequence.",
    });

    accidentInvestigationService.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "roc_acknowledged",
      actorId: "roc-acc-001",
      transitionedAt: "2026-06-26T12:00:45.000Z",
    });
    accidentInvestigationService.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "operation_suspended",
      actorId: "roc-acc-001",
      transitionedAt: "2026-06-26T12:01:00.000Z",
    });
    accidentInvestigationService.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "emergency_response_active",
      actorId: "roc-acc-001",
      transitionedAt: "2026-06-26T12:01:20.000Z",
    });
    accidentInvestigationService.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "evidence_frozen",
      actorId: "roc-acc-001",
      transitionedAt: "2026-06-26T12:02:00.000Z",
      evidenceManifestId: "manifest-acc-001",
    });
    accidentInvestigationService.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "initial_notification_sent",
      actorId: "roc-acc-001",
      transitionedAt: "2026-06-26T12:05:00.000Z",
    });

    accidentInvestigationService.importExternalDocument(accidentCase.caseId, {
      documentId: "doc-police-acc-001",
      documentType: "police_report",
      title: "Signed police crash report",
      providerName: "Taipei City Police Department",
      receivedAt: "2026-06-26T12:10:00.000Z",
      source: buildSource(
        "regulatory_filing",
        "police-crash-report-001",
        "2026-06-26T12:00:10.000Z",
        "sig-police-acc-001",
      ),
      extractedFacts: [
        {
          factKey: "impact.velocity_estimate_mps",
          label: "Impact velocity estimate",
          value: 14.8,
          occurredAt: "2026-06-26T12:00:10.000Z",
        },
      ],
    });
    accidentInvestigationService.addTimelineFact(accidentCase.caseId, {
      factId: "derived-impact-speed-acc-001",
      factKey: "impact.velocity_estimate_mps",
      label: "Impact velocity estimate",
      value: 16.1,
      occurredAt: "2026-06-26T12:00:10.000Z",
      confidence: "system_derived",
      sourceSystem: "system_derived",
      derivationRule: "vehicle_dynamics_reconstruction_v2",
      derivedFromFactIds: ["imu-acc-001", "wheel-speed-acc-001"],
    });

    const accidentRecord = accidentInvestigationService.getAccidentCase(
      accidentCase.caseId,
    );
    const response = controller.getTimeline(
      accidentCase.caseId,
      "req-accident-timeline-e2e-001",
    );
    const discrepancyEntry = response.data.items.find(
      (entry) => entry.factKey === "takeover.discrepancy_summary",
    );
    const impactEntry = response.data.items.find(
      (entry) => entry.factKey === "impact.velocity_estimate_mps",
    );
    const discrepancyCaseId = accidentRecord.discrepancyCaseIds[0];

    expect(accidentRecord).toMatchObject({
      status: "initial_notification_sent",
      evidenceManifestId: "manifest-acc-001",
    });
    expect(discrepancyCaseId).toEqual(expect.any(String));
    expect(discrepancyEntry).toMatchObject({
      confidence: "system_derived",
      discrepancyCaseIds: [discrepancyCaseId],
    });
    expect(impactEntry).toMatchObject({
      value: 14.8,
      confidence: "provider_signed",
      externalDocumentIds: ["doc-police-acc-001"],
      facts: [
        expect.objectContaining({
          confidence: "provider_signed",
          value: 14.8,
        }),
        expect.objectContaining({
          confidence: "system_derived",
          value: 16.1,
          derivationRule: "vehicle_dynamics_reconstruction_v2",
        }),
      ],
    });
    expect(response.meta).toEqual({
      requestId: "req-accident-timeline-e2e-001",
      timestamp: expect.any(String),
    });
  });
});
