import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

describe("SandboxDispatchGateService", () => {
  it("blocks dispatch when vehicle evidence reports a required unhealthy recorder", () => {
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
    const decision = gate.evaluateDispatch({
      orderId: "order-av-001",
      vehicleId: recorder.vehicleId,
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
    });

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toContain("RECORDER_UNHEALTHY");
  });

  it("allows dispatch when no recorder block signal is active", () => {
    const vehicleEvidenceService = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture({ recorderId: "rec-mock-healthy" });
    vehicleEvidenceService.registerRecorder(recorder);

    const gate = new SandboxDispatchGateService(vehicleEvidenceService);
    const decision = gate.evaluateDispatch({
      orderId: "order-av-002",
      vehicleId: recorder.vehicleId,
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
    });

    expect(decision.decision).toBe("allow");
    expect(decision.hardReasonCodes).toEqual([]);
  });

  it("blocks dispatch when ROC stop/hold restrictions are active", () => {
    const gate = new SandboxDispatchGateService(
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

    const decision = gate.evaluateDispatch({
      orderId: "order-av-003",
      vehicleId: "veh-roc-003",
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-roc-001",
    });

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toEqual([
      "ROC_STOP_NEW_DISPATCH",
      "ROC_OPERATIONAL_HOLD",
    ]);
  });
});
