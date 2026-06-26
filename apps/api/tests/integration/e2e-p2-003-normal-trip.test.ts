import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import {
  buildDriverIdentity,
  createPublicFleetHarness,
} from "./e2e-p2-test-helpers";

describe("E2E-P2-003 normal trip", () => {
  it("completes an assignment, pre-trip checklist, shift, and closeout without fabricating FSD takeover facts", async () => {
    const harness = createPublicFleetHarness();
    const identity = buildDriverIdentity("safe-op-001", "req-e2e-p2-003");

    harness.teslaIntegrationService.beginOAuth({
      businessAccountId: "biz-seed-001",
      region: "north_america",
      authorizationCode: "oauth-e2e-p2-003",
    });
    harness.teslaIntegrationService.bindVehicle({
      vehicleId: "veh-demo-001",
      vin: "5YJ3E1EA7JF000001",
    });
    harness.teslaIntegrationService.configureTelemetry({
      vehicleId: "veh-demo-001",
      mode: "public_mock",
      sampleIntervalSec: 15,
      mockBatteryLevelPct: 79,
      mockOnline: true,
      mockLocation: { lat: 25.033, lng: 121.5654 },
    });
    harness.vehicleEvidenceService.registerRecorder(
      buildMockRecorderFixture({
        recorderId: "rec-e2e-p2-003",
        vehicleId: "veh-demo-001",
      }),
    );

    const assignment = await harness.safetyOperatorService.createAssignment(
      {
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-demo-001",
        orderId: "ord-e2e-p2-003",
        sandboxProgramId: harness.sandboxProgramId,
      },
      identity,
    );
    const engaged = await harness.safetyOperatorService.engageAssignment(
      assignment.assignmentId,
      {
        safetyOperatorId: "safe-op-001",
      },
      identity,
    );
    const shift = await harness.safetyOperatorService.startShift(
      {
        safetyOperatorId: "safe-op-001",
        sandboxProgramId: harness.sandboxProgramId,
        deviceId: "device-e2e-p2-003",
        vehicleId: "veh-demo-001",
        assignmentId: assignment.assignmentId,
        startLocation: { lat: 25.033, lng: 121.5654 },
        notes: "Normal trip shift.",
      },
      identity,
    );
    const checklist = await harness.safetyOperatorService.submitPreTripChecklist(
      {
        safetyOperatorId: "safe-op-001",
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        vehicleId: "veh-demo-001",
        items: [
          { itemKey: "camera.health", status: "pass" },
          { itemKey: "seatbelt.ready", status: "pass" },
          { itemKey: "comms.online", status: "pass" },
        ],
        blockerCodes: [],
        notes: "All pre-trip checks passed.",
      },
      identity,
    );
    const closeout = await harness.safetyOperatorService.createTripCloseout(
      {
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-demo-001",
        orderId: "ord-e2e-p2-003",
        assignmentId: assignment.assignmentId,
        shiftId: shift.shiftId,
        closeoutStatus: "completed",
        takeoverReportIds: [],
        incidentId: null,
        evidenceArtifactIds: [],
        notes: "Trip completed without takeover.",
      },
      identity,
    );
    const endedShift = await harness.safetyOperatorService.endShift(
      shift.shiftId,
      {
        safetyOperatorId: "safe-op-001",
        deviceId: "device-e2e-p2-003",
        endLocation: { lat: 25.052, lng: 121.5436 },
        notes: "Shift ended after successful dropoff.",
      },
      identity,
    );
    const released = await harness.safetyOperatorService.releaseAssignment(
      assignment.assignmentId,
      {
        safetyOperatorId: "safe-op-001",
      },
      identity,
    );

    expect(engaged.status).toBe("engaged");
    expect(checklist).toMatchObject({
      allPassed: true,
      blockerCodes: [],
    });
    expect(closeout).toMatchObject({
      closeoutStatus: "completed",
      takeoverReportIds: [],
    });
    expect(endedShift).toMatchObject({
      status: "completed",
    });
    expect(released).toMatchObject({
      status: "released",
    });
    expect(
      harness.safetyOperatorService.listTakeoverReports({}, identity),
    ).toHaveLength(0);
    expect(
      harness.teslaIntegrationService.getTelemetryProjection("veh-demo-001"),
    ).toMatchObject({
      autonomyState: "unknown",
      shiftState: "P",
    });
  });
});
