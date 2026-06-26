import { describe, expect, it, vi } from "vitest";

import type { Phase2SourceMetadata } from "@drts/contracts";

import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";

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

function buildGovernanceService() {
  return {
    listSafetyOperatorQualifications: vi.fn(() => [
      {
        qualificationId: "qual-safe-001",
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

describe("E2E-P2-004 takeover correlation", () => {
  it("correlates priority 1 and opens discrepancy evidence without collapsing timestamps into one truth", async () => {
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

    const identity = {
      authMode: "bootstrap_headers",
      actorType: "driver_user",
      actorId: "safe-op-001",
      realm: "driver",
      tenantId: null,
      roleFamilies: ["driver"],
      roles: ["driver_user"],
      scopes: ["driver:read", "driver:write"],
      requestId: "req-e2e-p2-004",
    } as const;

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
        startLocation: { lat: 24.1477, lng: 120.6736 },
        notes: "Correlation scenario shift.",
      },
      identity,
    );
    await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-e2e-001",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        correlationId: "corr-e2e-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: "inc-e2e-001",
        evidenceArtifactIds: ["artifact-e2e-001"],
        notes: "Safety operator reported the takeover.",
        occurredAt: "2026-06-26T05:00:00.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent({
      eventId: "tesla-e2e-001",
      takeoverCorrelationId: "corr-e2e-001",
      autonomySessionId: "session-e2e-001",
      vehicleId: "veh-safe-001",
      orderId: "ord-safe-001",
      transitionType: "manual_takeover",
      occurredAt: "2026-06-26T05:00:30.000Z",
      source: buildSource(
        "tesla_fleet_api",
        "tesla-e2e-001",
        "2026-06-26T05:00:30.000Z",
      ),
    });
    rocOperationsService.recordRocTakeoverResponseRecord({
      responseId: "roc-e2e-001",
      takeoverCorrelationId: "corr-e2e-002",
      autonomySessionId: "session-e2e-001",
      triggeredByTeslaEventId: "tesla-e2e-001",
      rocOperatorId: "roc-001",
      vehicleId: "veh-safe-001",
      orderId: "ord-safe-001",
      responseType: "remote_assist",
      requestedAt: "2026-06-26T05:03:30.000Z",
      respondedAt: "2026-06-26T05:04:00.000Z",
      resolvedAt: null,
      outcomeNote: "ROC responded after manual takeover request.",
      source: buildSource(
        "roc_operator",
        "roc-e2e-001",
        "2026-06-26T05:03:30.000Z",
      ),
    });

    const snapshot =
      accidentInvestigationService.rebuildTakeoverCorrelationSnapshot();

    expect(snapshot.cases).toHaveLength(1);
    expect(snapshot.discrepancies).toHaveLength(1);
    expect(snapshot.cases[0]).toEqual(
      expect.objectContaining({
        correlationPriority: 1,
        matchedBy: "takeover_correlation_id",
        sourceTimestamps: expect.objectContaining({
          teslaOccurredAt: "2026-06-26T05:00:30.000Z",
          safetyOccurredAt: "2026-06-26T05:00:00.000Z",
          rocRequestedAt: "2026-06-26T05:03:30.000Z",
          rocRespondedAt: "2026-06-26T05:04:00.000Z",
        }),
      }),
    );
    expect(snapshot.discrepancies[0].discrepancyTypes).toEqual(
      expect.arrayContaining([
        "timestamp_mismatch",
        "correlation_id_mismatch",
      ]),
    );
  });
});
