import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

describe("INT-EVD-001 vehicle evidence + dispatch gate", () => {
  it("turns a recorder health regression into a dispatch block and clears it after upload retry recovery", async () => {
    const vehicleEvidenceService = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture({ recorderId: "rec-int-001" });
    vehicleEvidenceService.registerRecorder(recorder);
    const gate = new SandboxDispatchGateService(vehicleEvidenceService);

    vehicleEvidenceService.updateRecorderHealth(recorder.recorderId, {
      overall: "unhealthy",
      clockDriftMs: 25_000,
      uploadQueueState: "error",
      uploadPendingCount: 1,
      storageState: "error",
    });

    const blocked = await gate.evaluateDispatch({
      orderId: "order-int-001",
      vehicleId: recorder.vehicleId,
      sandboxProgramId: "sandbox-program-int",
      policyVersion: "phase2-evd-001",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      entitlement: { active: true },
      vehicleEnrollment: {
        status: "active",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
      },
      regulatory: { approvalFresh: true, vehicleCertified: true },
      providerCapabilities: {
        av_dispatch: true,
        telemetry_stream: true,
        regulatory_event_feed: true,
        evidence_recorder: true,
        odd_geofence: true,
        minimal_risk_condition: true,
      },
      telemetry: { stale: false, minimalRiskConditionActive: false, socPercent: 70 },
      operatingArea: {
        inBounds: true,
        boundaryRisk: false,
        matchedAreaIds: ["odd-downtown-core"],
      },
      routeContainment: {
        contained: true,
        matchedRouteIds: ["route-downtown-loop"],
      },
      safetyOperator: {
        required: false,
        available: false,
      },
    });

    const failedSegment = vehicleEvidenceService.listSegmentIndex({
      recorderId: recorder.recorderId,
      uploadStatus: "failed",
    })[0];
    vehicleEvidenceService.retryUpload(failedSegment!.artifactId);
    vehicleEvidenceService.updateRecorderHealth(recorder.recorderId, {
      overall: "healthy",
      clockDriftMs: 15,
      storageState: "ok",
      uploadQueueState: "ok",
      uploadPendingCount: 0,
      lastSegmentId: failedSegment!.segmentId,
      lastSegmentCapturedAt: failedSegment!.endedAt,
      lastSegmentState: "ok",
    });

    const allowed = await gate.evaluateDispatch({
      orderId: "order-int-002",
      vehicleId: recorder.vehicleId,
      sandboxProgramId: "sandbox-program-int",
      policyVersion: "phase2-evd-001",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      entitlement: { active: true },
      vehicleEnrollment: {
        status: "active",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
      },
      recorder: { healthy: true },
      regulatory: { approvalFresh: true, vehicleCertified: true },
      providerCapabilities: {
        av_dispatch: true,
        telemetry_stream: true,
        regulatory_event_feed: true,
        evidence_recorder: true,
        odd_geofence: true,
        minimal_risk_condition: true,
      },
      telemetry: { stale: false, minimalRiskConditionActive: false, socPercent: 70 },
      operatingArea: {
        inBounds: true,
        boundaryRisk: false,
        matchedAreaIds: ["odd-downtown-core"],
      },
      routeContainment: {
        contained: true,
        matchedRouteIds: ["route-downtown-loop"],
      },
      safetyOperator: {
        required: false,
        available: false,
      },
    });

    expect(blocked.decision).toBe("block");
    expect(allowed.decision).toBe("allow");
  });
});
