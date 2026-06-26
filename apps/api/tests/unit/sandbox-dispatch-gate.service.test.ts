import { describe, expect, it, vi } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
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
      telemetry: { stale: false, minimalRiskConditionActive: false, socPercent: 80 },
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
      telemetry: { stale: false, minimalRiskConditionActive: false, socPercent: 80 },
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

  it("does not synthesize healthy provider, regulatory, or telemetry facts for assignment gating", async () => {
    const governanceService = new SandboxGovernanceService();
    const gate = new SandboxDispatchGateService(undefined, governanceService);

    const gateInput = await gate.buildAssignmentGateInput({
      orderId: "order-av-003b",
      dispatchJobId: "job-av-003b",
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      requestedAt: "2026-06-26T14:00:00.000Z",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      pickup: { lat: 25.0445, lng: 121.5235 },
      dropoff: { lat: 25.0535, lng: 121.5325 },
      recorder: { healthy: true },
    });

    expect(gateInput.providerCapabilities).toBeNull();
    expect(gateInput.regulatory).toBeNull();
    expect(gateInput.telemetry).toBeNull();
    expect(gateInput.candidateRoute).toBeNull();
    expect(gateInput.entitlement).toEqual({ active: null });

    const decision = await gate.evaluateDispatch(gateInput);

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toEqual(
      expect.arrayContaining([
        "PROVIDER_CAPABILITY_MISSING",
        "REGULATORY_APPROVAL_MISSING",
        "TELEMETRY_STALE",
        "ODD_OUT_OF_BOUNDS",
      ]),
    );
  });

  it("requires an explicit entitlement snapshot for assignment gating", async () => {
    const governanceService = new SandboxGovernanceService();
    const gate = new SandboxDispatchGateService(undefined, governanceService);

    const gateInput = await gate.buildAssignmentGateInput({
      orderId: "order-av-003c",
      dispatchJobId: "job-av-003c",
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      requestedAt: "2026-06-26T14:00:00.000Z",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      pickup: { lat: 25.0445, lng: 121.5235 },
      dropoff: { lat: 25.0535, lng: 121.5325 },
      candidateRoute: {
        type: "MultiLineString",
        coordinates: [
          [
            [121.5235, 25.0445],
            [121.528, 25.049],
            [121.5325, 25.0535],
          ],
        ],
      },
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
        currentTripCount: 0,
        odometerKm: 25_000,
      },
      regulatory: { approvalFresh: true, vehicleCertified: true },
      recorder: { healthy: true },
    });

    expect(gateInput.vehicleEnrollment?.status).toBe("active");
    expect(gateInput.entitlement).toEqual({ active: null });

    await expect(gate.assertAssignmentEligible(gateInput)).rejects.toMatchObject({
      response: {
        error: {
          code: "SANDBOX_REGULATORY_APPROVAL_MISSING",
        },
      },
    });
  });

  it("fails closed when enrollment is active but entitlement is omitted", async () => {
    const gate = new SandboxDispatchGateService();

    const decision = await gate.evaluateDispatch({
      orderId: "order-av-003d",
      dispatchJobId: "job-av-003d",
      vehicleId: "veh-av-003d",
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      vehicleEnrollment: {
        status: "active",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
      },
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
        currentTripCount: 0,
        odometerKm: 25_000,
      },
      regulatory: { approvalFresh: true, vehicleCertified: true },
      recorder: { healthy: true },
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

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toContain("REGULATORY_APPROVAL_MISSING");
  });

  it("returns allow_with_safety_operator when operator is required and qualified", async () => {
    const gate = new SandboxDispatchGateService();

    const decision = await gate.evaluateDispatch({
      orderId: "order-av-004",
      vehicleId: "veh-av-004",
      sandboxProgramId: "sandbox-program-001",
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
        required: true,
        available: true,
        safetyOperatorId: "safety-op-001",
        qualificationStatus: "qualified",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
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

  it("persists release audit data on the same decision record", async () => {
    const repository = {
      loadDecisionById: vi.fn().mockResolvedValue({
        decision: {
          decisionId: "dec-existing-001",
          orderId: "order-av-005c",
          dispatchJobId: "job-av-005c",
          vehicleId: "veh-av-005c",
          sandboxProgramId: "sandbox-program-001",
          decision: "block",
          oddInBounds: false,
          hardReasonCodes: ["REGULATORY_APPROVAL_MISSING"],
          softReasonCodes: [],
          requiredSafetyOperatorId: null,
          policyVersion: "phase2-evd-001",
          evaluatedAt: "2026-06-26T00:00:00.000Z",
        },
        evaluationSnapshot: {
          orderId: "order-av-005c",
          dispatchJobId: "job-av-005c",
          vehicleId: "veh-av-005c",
          sandboxProgramId: "sandbox-program-001",
          policyVersion: "phase2-evd-001",
          entitlement: { active: false },
        },
        releaseAudit: null,
      }),
      loadLatestDecision: vi.fn(),
      updateReleaseAudit: vi.fn().mockResolvedValue(undefined),
      persistEvaluation: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as never;
    const gate = new SandboxDispatchGateService(
      undefined,
      undefined,
      repository,
    );

    const result = await gate.recordManualRelease(
      {
        orderId: "order-av-005c",
        vehicleId: "veh-av-005c",
        sandboxProgramId: "sandbox-program-001",
        policyVersion: "phase2-evd-001",
      },
      {
        actorId: "ops-002",
        actorType: "ops_user",
        reason: "Persist release audit on existing decision",
        decisionId: "dec-existing-001",
      },
    );

    expect(repository.loadDecisionById).toHaveBeenCalledWith("dec-existing-001");
    expect(repository.loadLatestDecision).not.toHaveBeenCalled();
    expect(repository.updateReleaseAudit).toHaveBeenCalledTimes(1);
    expect(repository.updateReleaseAudit).toHaveBeenCalledWith(
      "dec-existing-001",
      expect.objectContaining({
        actorId: "ops-002",
        actorType: "ops_user",
        reason: "Persist release audit on existing decision",
        decisionId: "dec-existing-001",
      }),
    );
    expect(repository.persistEvaluation).not.toHaveBeenCalled();
    expect(result.decision).toMatchObject({
      decisionId: "dec-existing-001",
    });
    expect(result.releaseAudit.decisionId).toBe("dec-existing-001");
  });

  it("falls back to the latest stored decision when manual release omits decisionId", async () => {
    const repository = {
      loadDecisionById: vi.fn(),
      loadLatestDecision: vi.fn().mockResolvedValue({
        decision: {
          decisionId: "dec-existing-002",
          orderId: "order-av-005d",
          dispatchJobId: "job-av-005d",
          vehicleId: "veh-av-005d",
          sandboxProgramId: "sandbox-program-001",
          decision: "defer",
          oddInBounds: false,
          hardReasonCodes: [],
          softReasonCodes: ["SAFETY_OPERATOR_UNAVAILABLE"],
          requiredSafetyOperatorId: null,
          policyVersion: "phase2-evd-001",
          evaluatedAt: "2026-06-26T00:00:00.000Z",
        },
        evaluationSnapshot: {
          orderId: "order-av-005d",
          dispatchJobId: "job-av-005d",
          vehicleId: "veh-av-005d",
          sandboxProgramId: "sandbox-program-001",
          policyVersion: "phase2-evd-001",
          entitlement: { active: true },
        },
        releaseAudit: null,
      }),
      persistEvaluation: vi.fn().mockResolvedValue(undefined),
      updateReleaseAudit: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as never;
    const gate = new SandboxDispatchGateService(
      undefined,
      undefined,
      repository,
    );

    const result = await gate.recordManualRelease(
      {
        orderId: "order-av-005d",
        vehicleId: "veh-av-005d",
        sandboxProgramId: "sandbox-program-001",
        policyVersion: "phase2-evd-001",
      },
      {
        actorId: "ops-003",
        actorType: "ops_user",
        reason: "Persist release audit on latest decision",
      },
    );

    expect(repository.loadDecisionById).not.toHaveBeenCalled();
    expect(repository.loadLatestDecision).toHaveBeenCalledWith("order-av-005d");
    expect(repository.updateReleaseAudit).toHaveBeenCalledTimes(1);
    expect(repository.persistEvaluation).not.toHaveBeenCalled();
    expect(result.releaseAudit.decisionId).toBe("dec-existing-002");
  });

  it("rejects manual release when the provided decisionId does not exist", async () => {
    const repository = {
      loadDecisionById: vi.fn().mockResolvedValue(null),
      loadLatestDecision: vi.fn(),
      persistEvaluation: vi.fn().mockResolvedValue(undefined),
      updateReleaseAudit: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as never;
    const gate = new SandboxDispatchGateService(
      undefined,
      undefined,
      repository,
    );

    await expect(
      gate.recordManualRelease(
        {
          orderId: "order-av-005d-missing",
          vehicleId: "veh-av-005d-missing",
          sandboxProgramId: "sandbox-program-001",
          policyVersion: "phase2-evd-001",
        },
        {
          actorId: "ops-003b",
          actorType: "ops_user",
          reason: "Reject unknown decisionId",
          decisionId: "dec-missing-001",
        },
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "SANDBOX_DISPATCH_DECISION_NOT_FOUND",
          details: {
            orderId: "order-av-005d-missing",
            decisionId: "dec-missing-001",
          },
        },
      },
      status: 404,
    });

    expect(repository.loadDecisionById).toHaveBeenCalledWith("dec-missing-001");
    expect(repository.loadLatestDecision).not.toHaveBeenCalled();
    expect(repository.updateReleaseAudit).not.toHaveBeenCalled();
    expect(repository.persistEvaluation).not.toHaveBeenCalled();
  });

  it("rejects manual release when the provided decisionId belongs to a different order", async () => {
    const repository = {
      loadDecisionById: vi.fn().mockResolvedValue({
        decision: {
          decisionId: "dec-other-order-001",
          orderId: "order-av-foreign",
          dispatchJobId: "job-av-foreign",
          vehicleId: "veh-av-foreign",
          sandboxProgramId: "sandbox-program-001",
          decision: "block",
          oddInBounds: false,
          hardReasonCodes: ["REGULATORY_APPROVAL_MISSING"],
          softReasonCodes: [],
          requiredSafetyOperatorId: null,
          policyVersion: "phase2-evd-001",
          evaluatedAt: "2026-06-26T00:00:00.000Z",
        },
        evaluationSnapshot: {
          orderId: "order-av-foreign",
          dispatchJobId: "job-av-foreign",
          vehicleId: "veh-av-foreign",
          sandboxProgramId: "sandbox-program-001",
          policyVersion: "phase2-evd-001",
        },
        releaseAudit: null,
      }),
      loadLatestDecision: vi.fn(),
      persistEvaluation: vi.fn().mockResolvedValue(undefined),
      updateReleaseAudit: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as never;
    const gate = new SandboxDispatchGateService(
      undefined,
      undefined,
      repository,
    );

    await expect(
      gate.recordManualRelease(
        {
          orderId: "order-av-005d-owner",
          vehicleId: "veh-av-005d-owner",
          sandboxProgramId: "sandbox-program-001",
          policyVersion: "phase2-evd-001",
        },
        {
          actorId: "ops-003c",
          actorType: "ops_user",
          reason: "Reject cross-order decisionId",
          decisionId: "dec-other-order-001",
        },
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "SANDBOX_DISPATCH_DECISION_NOT_FOUND",
          details: {
            orderId: "order-av-005d-owner",
            decisionId: "dec-other-order-001",
          },
        },
      },
      status: 404,
    });

    expect(repository.loadDecisionById).toHaveBeenCalledWith(
      "dec-other-order-001",
    );
    expect(repository.loadLatestDecision).not.toHaveBeenCalled();
    expect(repository.updateReleaseAudit).not.toHaveBeenCalled();
    expect(repository.persistEvaluation).not.toHaveBeenCalled();
  });

  it("creates a manual release baseline without emitting a duplicate evaluate dispatch write", async () => {
    const repository = {
      loadDecisionById: vi.fn(),
      loadLatestDecision: vi.fn().mockResolvedValue(null),
      persistEvaluation: vi.fn().mockResolvedValue(undefined),
      updateReleaseAudit: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as never;
    const auditNotificationService = {
      recordAuditLog: vi.fn(),
    } as never;
    const gate = new SandboxDispatchGateService(
      undefined,
      undefined,
      repository,
      auditNotificationService,
    );

    const result = await gate.recordManualRelease(
      {
        orderId: "order-av-005e",
        dispatchJobId: "job-av-005e",
        vehicleId: "veh-av-005e",
        sandboxProgramId: "sandbox-program-001",
        policyVersion: "phase2-evd-001",
      },
      {
        actorId: "ops-004",
        actorType: "ops_user",
        reason: "Create baseline and attach release audit",
      },
      "req-manual-release-002",
    );

    expect(repository.loadLatestDecision).toHaveBeenCalledWith("order-av-005e");
    expect(repository.persistEvaluation).toHaveBeenCalledTimes(1);
    expect(repository.updateReleaseAudit).not.toHaveBeenCalled();
    expect(repository.persistEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({
          orderId: "order-av-005e",
          dispatchJobId: "job-av-005e",
          vehicleId: "veh-av-005e",
        }),
        releaseAudit: expect.objectContaining({
          actorId: "ops-004",
          actorType: "ops_user",
          reason: "Create baseline and attach release audit",
          decisionId: result.decision.decisionId,
        }),
      }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(1);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "manual_release",
        requestId: "req-manual-release-002",
      }),
    );
  });

  it("blocks assignment gating when the booking path is missing", async () => {
    const governanceService = new SandboxGovernanceService();
    const gate = new SandboxDispatchGateService(undefined, governanceService);

    const gateInput = await gate.buildAssignmentGateInput({
      orderId: "order-av-005b",
      dispatchJobId: "job-av-005b",
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      requestedAt: "2026-06-26T14:00:00.000Z",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      pickup: { lat: 25.0445, lng: 121.5235 },
      dropoff: { lat: 25.0535, lng: 121.5325 },
      entitlement: { active: true },
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
    });

    await expect(gate.assertAssignmentEligible(gateInput)).rejects.toMatchObject({
      response: {
        error: {
          code: "SANDBOX_ODD_OUT_OF_BOUNDS",
        },
      },
    });
  });

  it("blocks assignment gating when the booking path is off the approved route", async () => {
    const governanceService = new SandboxGovernanceService();
    const gate = new SandboxDispatchGateService(undefined, governanceService);

    const gateInput = await gate.buildAssignmentGateInput({
      orderId: "order-av-005c",
      dispatchJobId: "job-av-005c",
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      requestedAt: "2026-06-26T14:00:00.000Z",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      pickup: { lat: 25.0445, lng: 121.5235 },
      dropoff: { lat: 25.0535, lng: 121.5325 },
      entitlement: { active: true },
      candidateRoute: {
        type: "MultiLineString",
        coordinates: [[[121.521, 25.055], [121.5215, 25.0555], [121.522, 25.056]]],
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
      telemetry: { stale: false, minimalRiskConditionActive: false, socPercent: 80 },
    });

    expect(gateInput.routeContainment).toMatchObject({
      contained: false,
      matchedRouteIds: [],
    });

    const decision = await gate.evaluateDispatch(gateInput);

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toContain("ODD_OUT_OF_BOUNDS");
  });

  it("blocks when booking window or approved route facts are missing", async () => {
    const gate = new SandboxDispatchGateService();

    const decision = await gate.evaluateDispatch({
      orderId: "order-av-006",
      vehicleId: "veh-av-006",
      sandboxProgramId: "sandbox-program-001",
      policyVersion: "phase2-evd-001",
      entitlement: { active: true },
      vehicleEnrollment: { status: "active", approvedAreaIds: [], approvedRouteIds: [] },
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
        matchedAreaIds: [],
      },
      routeContainment: {
        contained: false,
        matchedRouteIds: [],
      },
      safetyOperator: {
        required: true,
        available: true,
        safetyOperatorId: "safety-op-001",
        qualificationStatus: "qualified",
        approvedAreaIds: [],
        approvedRouteIds: [],
      },
    });

    expect(decision.decision).toBe("block");
    expect(decision.hardReasonCodes).toContain("ODD_OUT_OF_BOUNDS");
  });
});
