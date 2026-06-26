import { describe, expect, it, vi } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

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
    const decision = await gate.evaluateDispatch({
      orderId: "order-av-001",
      vehicleId: recorder.vehicleId,
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
      entitlement: { active: true },
      vehicleEnrollment: { status: "active" },
      regulatory: { approvalFresh: true, vehicleCertified: true },
      providerCapabilities: {
        av_dispatch: true,
        telemetry_stream: true,
        regulatory_event_feed: true,
        evidence_recorder: true,
        odd_geofence: true,
        minimal_risk_condition: true,
      },
      telemetry: { stale: false, minimalRiskConditionActive: false, socPercent: 80 },
      operatingArea: { inBounds: true, boundaryRisk: false },
    });

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toContain("RECORDER_UNHEALTHY");
  });

  it("allows dispatch when all required facts are present and healthy", async () => {
    const vehicleEvidenceService = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture({ recorderId: "rec-mock-healthy" });
    vehicleEvidenceService.registerRecorder(recorder);

    const gate = new SandboxDispatchGateService(vehicleEvidenceService);
    const decision = await gate.evaluateDispatch({
      orderId: "order-av-002",
      vehicleId: recorder.vehicleId,
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
      entitlement: { active: true },
      vehicleEnrollment: { status: "active" },
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
      telemetry: { stale: false, minimalRiskConditionActive: false, socPercent: 80 },
      operatingArea: { inBounds: true, boundaryRisk: false },
    });

    expect(decision.decision).toBe("allow");
    expect(decision.hardReasonCodes).toEqual([]);
  });

  it("fails closed to block when required regulatory and telemetry facts are missing", async () => {
    const gate = new SandboxDispatchGateService();

    const decision = await gate.evaluateDispatch({
      orderId: "order-av-003",
      vehicleId: "veh-av-003",
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
    });

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toEqual(
      expect.arrayContaining([
        "REGULATORY_APPROVAL_MISSING",
        "TELEMETRY_STALE",
        "RECORDER_UNHEALTHY",
        "PROVIDER_CAPABILITY_MISSING",
      ]),
    );
  });

  it("returns allow_with_safety_operator when operator is required and qualified", async () => {
    const gate = new SandboxDispatchGateService();

    const decision = await gate.evaluateDispatch({
      orderId: "order-av-004",
      vehicleId: "veh-av-004",
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
      entitlement: { active: true },
      vehicleEnrollment: { status: "active" },
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
      operatingArea: { inBounds: true, boundaryRisk: false },
      safetyOperator: {
        required: true,
        available: true,
        safetyOperatorId: "safety-op-001",
        qualificationStatus: "qualified",
      },
    });

    expect(decision.decision).toBe("allow_with_safety_operator");
    expect(decision.requiredSafetyOperatorId).toBe("safety-op-001");
  });

  it("audits manual release requests", async () => {
    const auditNotificationService = {
      recordAuditLog: vi.fn(),
    } as never;
    const gate = new SandboxDispatchGateService(
      undefined,
      undefined,
      undefined,
      auditNotificationService,
    );

    await gate.recordManualRelease(
      {
        orderId: "order-av-005",
        vehicleId: "veh-av-005",
        sandboxProgramId: "sandbox-program-001",
        policyVersion: "phase2-evd-001",
      },
      {
        actorId: "ops-001",
        actorType: "ops_user",
        reason: "Supervisor requested manual release review",
      },
      "req-manual-release-001",
    );

    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "manual_release",
        actorId: "ops-001",
        requestId: "req-manual-release-001",
      }),
    );
  });
});
