import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

const READY_PASSENGER_DISCLOSURE = {
  channel: "tenant_portal" as const,
  policyId: "policy-test-av-001",
  policyVersion: "test-v1",
  messageCode: "sandbox_passenger_disclosure.av_program_notice",
  requiresAcknowledgement: false,
  acknowledgementMode: "operator_confirmed_notice" as const,
  acknowledgedAt: null,
  acknowledgementRecordId: null,
};

function buildReadyDispatchGateInput(overrides: {
  orderId: string;
  vehicleId: string;
  policyVersion: string;
  recorder?: {
    healthy: boolean;
  };
}) {
  return {
    ...overrides,
    sandboxProgramId: "sandbox-program-001",
    passengerDisclosure: READY_PASSENGER_DISCLOSURE,
    bookingWindow: {
      start: "2026-06-26T14:00:00.000Z",
      end: "2026-06-26T15:00:00.000Z",
    },
    entitlement: { active: true },
    vehicleEnrollment: {
      status: "active" as const,
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
    telemetry: {
      stale: false,
      minimalRiskConditionActive: false,
      socPercent: 80,
    },
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
    recorder: overrides.recorder,
  };
}

describe("SandboxDispatchGateService", () => {
  it("blocks dispatch when vehicle evidence reports a required unhealthy recorder", async () => {
    const vehicleEvidenceService = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture();
    vehicleEvidenceService.registerRecorder(recorder);
    vehicleEvidenceService.updateRecorderHealth(recorder.recorderId, {
      overall: "unhealthy",
      clockDriftMs: 15_000,
      uploadQueueState: "error",
      uploadPendingCount: 2,
      storageState: "error",
      encryptionEnabled: false,
      encryptionState: "error",
    });

    const gate = new SandboxDispatchGateService(vehicleEvidenceService);
    const decision = await gate.evaluateDispatch(buildReadyDispatchGateInput({
      orderId: "order-av-001",
      vehicleId: recorder.vehicleId,
      policyVersion: "phase2-evd-001",
    }));

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toContain("RECORDER_UNHEALTHY");
  });

  it("allows dispatch when no recorder block signal is active", async () => {
    const vehicleEvidenceService = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture({ recorderId: "rec-mock-healthy" });
    vehicleEvidenceService.registerRecorder(recorder);

    const gate = new SandboxDispatchGateService(vehicleEvidenceService);
    const decision = await gate.evaluateDispatch(buildReadyDispatchGateInput({
      orderId: "order-av-002",
      vehicleId: recorder.vehicleId,
      policyVersion: "phase2-evd-001",
      recorder: { healthy: true },
    }));

    expect(decision.decision).toBe("allow");
    expect(decision.hardReasonCodes).toEqual([]);
  });

  it("blocks dispatch when ROC stop/hold restrictions are active", async () => {
    const gate = new SandboxDispatchGateService(
      undefined,
      undefined,
      undefined,
      undefined,
      {
        getDispatchRestrictions: () => ({
          reasonCodes: ["ROC_STOP_NEW_DISPATCH", "ROC_OPERATIONAL_HOLD"],
          stopNewDispatchActive: true,
          operationalHoldActive: true,
          humanFallbackActive: false,
        }),
      } as never,
    );

    const decision = await gate.evaluateDispatch(buildReadyDispatchGateInput({
      orderId: "order-av-003",
      vehicleId: "veh-roc-003",
      policyVersion: "phase2-roc-001",
      recorder: { healthy: true },
    }));

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toEqual([
      "ROC_STOP_NEW_DISPATCH",
      "ROC_OPERATIONAL_HOLD",
    ]);
  });
});
