import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { createPublicFleetHarness } from "./e2e-p2-test-helpers";

describe("E2E-P2-006 evidence freeze", () => {
  it("starts evidence freeze from a recorder alert and keeps the freeze active even after recorder health recovers", async () => {
    const harness = createPublicFleetHarness();
    const recorder = buildMockRecorderFixture({
      recorderId: "rec-e2e-p2-006",
      vehicleId: "veh-demo-001",
    });
    harness.vehicleEvidenceService.registerRecorder(recorder);
    harness.vehicleEvidenceService.updateRecorderHealth(recorder.recorderId, {
      overall: "unhealthy",
      clockDriftMs: 22_000,
      uploadQueueState: "error",
      uploadPendingCount: 2,
      storageState: "error",
    });

    const receipt = harness.rocOperationsService.startEvidenceFreeze(
      "roc-alert-recorder-veh-demo-001",
      {
        reason: "Preserve recorder evidence for post-incident review.",
        retentionHours: 72,
      },
      {
        authMode: "bootstrap_headers",
        actorType: "ops_user",
        actorId: "roc-user-e2e-p2-006",
        realm: "ops",
        tenantId: null,
        roleFamilies: ["ops"],
        roles: ["roc_operator", "safety_officer"],
        scopes: ["dispatch:read", "dispatch:write", "incident:write"],
        requestId: "req-e2e-p2-006",
      },
    );

    const vehicle = harness.rocOperationsService
      .listVehicles(null)
      .find((item) => item.vehicleId === "veh-demo-001");
    const blockedDecision = await harness.sandboxDispatchGateService.evaluateDispatch({
      orderId: "ord-e2e-p2-006",
      vehicleId: "veh-demo-001",
      sandboxProgramId: harness.sandboxProgramId,
      policyVersion: "phase2-e2e-p2-006",
    });

    expect(receipt).toMatchObject({
      status: "completed",
      resourceId: "roc-alert-recorder-veh-demo-001",
      message:
        "start-evidence-freeze: Evidence freeze started for vehicle veh-demo-001.",
    });
    expect(vehicle).toMatchObject({
      vehicleId: "veh-demo-001",
      evidenceFreezeActive: true,
      humanFallbackActive: false,
    });
    expect(blockedDecision).toMatchObject({
      decision: "block",
      hardReasonCodes: expect.arrayContaining(["RECORDER_UNHEALTHY"]),
    });

    harness.vehicleEvidenceService.updateRecorderHealth(recorder.recorderId, {
      overall: "healthy",
      clockDriftMs: 10,
      uploadQueueState: "ok",
      uploadPendingCount: 0,
      storageState: "ok",
    });

    const unblockedDecision =
      await harness.sandboxDispatchGateService.evaluateDispatch({
        orderId: "ord-e2e-p2-006-retry",
        vehicleId: "veh-demo-001",
        sandboxProgramId: harness.sandboxProgramId,
        policyVersion: "phase2-e2e-p2-006",
        passengerDisclosure: {
          channel: "tenant_portal" as const,
          policyId: "policy-test-av-001",
          policyVersion: "test-v1",
          messageCode: "sandbox_passenger_disclosure.av_program_notice",
          requiresAcknowledgement: false,
          acknowledgementMode: "operator_confirmed_notice" as const,
          acknowledgedAt: null,
          acknowledgementRecordId: null,
        },
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
        safetyOperator: { required: false, available: false },
      });
    const recoveredVehicle = harness.rocOperationsService
      .listVehicles(null)
      .find((item) => item.vehicleId === "veh-demo-001");

    expect(unblockedDecision.decision).toBe("allow");
    expect(recoveredVehicle).toMatchObject({
      vehicleId: "veh-demo-001",
      evidenceFreezeActive: true,
    });
  });
});
