import { describe, expect, it, vi } from "vitest";

import type { Phase2SourceMetadata } from "@drts/contracts";

import { AccidentInvestigationController } from "../../src/modules/accident-investigation/accident-investigation.controller";
import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";

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
        qualificationId: "qual-safe-acc-007",
        sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
        safetyOperatorId: "safe-op-acc-007",
        providerCode: "tesla",
        version: 1,
        status: "qualified",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
        certificationRefs: ["cert-007"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]),
  };
}

describe("E2E-P2-007 investigation bundle", () => {
  it("produces a manifest, custody package, controlled download, and known gaps without liability conclusions", async () => {
    const auditNotificationService = new AuditNotificationService();
    const sandboxGovernanceService = new SandboxGovernanceService(
      auditNotificationService,
    );
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
      auditNotificationService,
      {
        getOrder: () => ({
          orderId: "ord-acc-007",
          orderNo: "ORD-ACC-007",
          pickup: { lat: 25.0478, lng: 121.5319 },
          dropoff: { lat: 25.052, lng: 121.5436 },
        }),
        listDispatchTrace: () => [{ traceId: "dispatch-trace-007" }],
      } as never,
      safetyOperatorService,
      sandboxGovernanceService,
      {
        getTelemetryStatus: () => {
          throw new Error("upstream telemetry configuration missing");
        },
        getPublicTelemetrySample: () => {
          throw new Error("public telemetry unavailable");
        },
        getTelemetryProjection: () => {
          throw new Error("projection unavailable");
        },
        listReceipts: () => [],
      } as never,
      {
        listSegmentIndex: () => [],
        listBookmarks: () => [],
      } as never,
    );
    const controller = new AccidentInvestigationController(
      accidentInvestigationService,
    );

    const identity = {
      authMode: "bootstrap_headers" as const,
      actorType: "driver_user" as const,
      actorId: "safe-op-acc-007",
      realm: "driver" as const,
      tenantId: null,
      roleFamilies: ["driver"] as const,
      roles: ["driver_user"],
      scopes: ["driver:read", "driver:write"],
      requestId: "req-accident-e2e-007",
    };

    const assignment = await safetyOperatorService.createAssignment(
      {
        safetyOperatorId: "safe-op-acc-007",
        vehicleId: "veh-acc-007",
        orderId: "ord-acc-007",
        sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      },
      identity,
    );
    const shift = await safetyOperatorService.startShift(
      {
        safetyOperatorId: "safe-op-acc-007",
        sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
        deviceId: "device-acc-007",
        vehicleId: "veh-acc-007",
        assignmentId: assignment.assignmentId,
        startLocation: { lat: 25.0478, lng: 121.5319 },
        notes: "Bundle e2e shift.",
      },
      identity,
    );
    await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-acc-007",
        safetyOperatorId: "safe-op-acc-007",
        vehicleId: "veh-acc-007",
        orderId: "ord-acc-007",
        sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        correlationId: "corr-acc-007",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: "incident-acc-007",
        evidenceArtifactIds: ["artifact-acc-007"],
        notes: "Safety operator reported the collision.",
        occurredAt: "2026-06-26T12:00:00.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent({
      eventId: "tesla-acc-007",
      takeoverCorrelationId: "corr-acc-007",
      autonomySessionId: "session-acc-007",
      vehicleId: "veh-acc-007",
      orderId: "ord-acc-007",
      transitionType: "manual_takeover",
      occurredAt: "2026-06-26T12:00:25.000Z",
      source: buildSource(
        "tesla_fleet_api",
        "tesla-acc-007",
        "2026-06-26T12:00:25.000Z",
      ),
    });

    const accidentCase = accidentInvestigationService.createAccidentCase({
      caseId: "acc-e2e-007",
      vehicleId: "veh-acc-007",
      orderId: "ord-acc-007",
      takeoverCorrelationId: "corr-acc-007",
      severity: "major",
      occurredAt: "2026-06-26T12:00:00.000Z",
      reportedAt: "2026-06-26T12:00:40.000Z",
      reportedBy: "roc-acc-007",
      summary: "Vehicle collision detected during takeover sequence.",
    });
    accidentInvestigationService.importExternalDocument(accidentCase.caseId, {
      documentId: "doc-police-acc-007",
      documentType: "police_report",
      title: "Signed police crash report",
      providerName: "Taipei City Police Department",
      receivedAt: "2026-06-26T12:10:00.000Z",
      source: buildSource(
        "regulatory_filing",
        "police-crash-report-007",
        "2026-06-26T12:00:10.000Z",
        "sig-police-acc-007",
      ),
    });

    const response = await controller.generateInvestigationBundle(
      accidentCase.caseId,
      {
        actorId: "investigator-acc-007",
      },
      "req-accident-bundle-e2e-007",
    );

    expect(response.data).toMatchObject({
      caseId: "acc-e2e-007",
      liabilityConclusion: null,
      liabilityConclusionEmitted: false,
      manifest: expect.objectContaining({
        entryCount: expect.any(Number),
      }),
      custodyPackage: {
        records: expect.arrayContaining([
          expect.objectContaining({ action: "bundle_generated" }),
          expect.objectContaining({ action: "controlled_download_issued" }),
        ]),
      },
      downloadMetadata: {
        bundle: expect.objectContaining({
          downloadUrl: expect.stringContaining("/accident-investigation-bundle/"),
          ttlMinutes: 15,
        }),
      },
      knownGaps: expect.arrayContaining([
        expect.objectContaining({
          sectionId: "vehicle_tesla_state",
        }),
        expect.objectContaining({
          sectionId: "synced_video",
        }),
      ]),
    });

    const routeSection = response.data.sections.find(
      (section) => section.sectionId === "route_geofence_compare",
    );
    expect(routeSection?.payload).toMatchObject({
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      routeValidation: expect.objectContaining({
        sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      }),
    });

    const auditEntry = auditNotificationService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "issue_accident_investigation_bundle_download",
      );
    expect(auditEntry?.newValuesSummary).toMatchObject({
      caseId: "acc-e2e-007",
      liabilityConclusionEmitted: false,
      ttlMinutes: 15,
    });
  });
});
