import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import {
  buildReadyDispatchGateInput,
  createPublicFleetHarness,
} from "./e2e-p2-test-helpers";

describe("E2E-P2-008 human fallback", () => {
  it("routes the vehicle into human fallback and activates stop-dispatch plus operational hold together", async () => {
    const harness = createPublicFleetHarness();
    harness.vehicleEvidenceService.registerRecorder(
      buildMockRecorderFixture({
        recorderId: "rec-e2e-p2-008",
        vehicleId: "veh-demo-001",
      }),
    );
    harness.vehicleEvidenceService.updateRecorderHealth("rec-e2e-p2-008", {
      overall: "unhealthy",
      clockDriftMs: 18_000,
      uploadQueueState: "error",
      uploadPendingCount: 1,
      storageState: "error",
    });

    const receipt = harness.rocOperationsService.fallbackToHuman(
      "roc-alert-recorder-veh-demo-001",
      {
        reason: "Autonomy behavior degraded; human supervisor required.",
      },
      {
        authMode: "bootstrap_headers",
        actorType: "ops_user",
        actorId: "roc-user-e2e-p2-008",
        realm: "ops",
        tenantId: null,
        roleFamilies: ["ops"],
        roles: ["roc_operator", "ops_supervisor", "dispatch_manager"],
        scopes: ["dispatch:read", "dispatch:write"],
        requestId: "req-e2e-p2-008",
      },
    );

    const restrictions =
      harness.rocOperationsService.getDispatchRestrictions("veh-demo-001");
    const vehicle = harness.rocOperationsService
      .listVehicles(null)
      .find((item) => item.vehicleId === "veh-demo-001");
    const gateDecision = await harness.sandboxDispatchGateService.evaluateDispatch(
      buildReadyDispatchGateInput({
        orderId: "ord-e2e-p2-008",
        vehicleId: "veh-demo-001",
        sandboxProgramId: harness.sandboxProgramId,
        policyVersion: "phase2-e2e-p2-008",
      }),
    );

    expect(receipt).toMatchObject({
      status: "completed",
      resourceId: "roc-alert-recorder-veh-demo-001",
      message:
        "fallback-to-human: Vehicle veh-demo-001 routed to human fallback.",
    });
    expect(restrictions).toMatchObject({
      stopNewDispatchActive: true,
      operationalHoldActive: true,
      humanFallbackActive: true,
      reasonCodes: expect.arrayContaining([
        "ROC_STOP_NEW_DISPATCH",
        "ROC_OPERATIONAL_HOLD",
      ]),
    });
    expect(vehicle).toMatchObject({
      vehicleId: "veh-demo-001",
      humanFallbackActive: true,
      stopNewDispatchActive: true,
      operationalHoldActive: true,
    });
    expect(gateDecision).toMatchObject({
      decision: "block",
      hardReasonCodes: expect.arrayContaining([
        "ROC_STOP_NEW_DISPATCH",
        "ROC_OPERATIONAL_HOLD",
      ]),
    });
  });
});
