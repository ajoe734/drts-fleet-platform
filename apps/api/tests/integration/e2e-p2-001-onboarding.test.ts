import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import {
  buildDriverIdentity,
  createPublicFleetHarness,
  DEFAULT_SANDBOX_PROGRAM_ID,
  DEFAULT_SAFETY_OPERATOR_ID,
} from "./e2e-p2-test-helpers";

describe("E2E-P2-001 onboarding", () => {
  it("onboards the public-mock Tesla vehicle, recorder, and qualified safety operator while failing closed on non-brokered commands", async () => {
    const harness = createPublicFleetHarness();

    harness.teslaIntegrationService.beginOAuth({
      businessAccountId: "biz-seed-001",
      region: "north_america",
      authorizationCode: "oauth-e2e-p2-001",
    });

    const discovered = harness.teslaIntegrationService.discoverVehicles();
    const binding = harness.teslaIntegrationService.bindVehicle({
      vehicleId: "veh-demo-001",
      vin: "5YJ3E1EA7JF000001",
    });
    const virtualKey = harness.teslaIntegrationService.pairVirtualKey({
      vehicleId: "veh-demo-001",
      requestedBy: "ops-user-e2e-p2-001",
    });
    const telemetry = harness.teslaIntegrationService.configureTelemetry({
      vehicleId: "veh-demo-001",
      mode: "public_mock",
      sampleIntervalSec: 30,
      mockBatteryLevelPct: 82,
      mockOnline: true,
      mockLocation: { lat: 25.0478, lng: 121.5319 },
    });
    const recorder = buildMockRecorderFixture({
      recorderId: "rec-e2e-p2-001",
      vehicleId: "veh-demo-001",
    });
    harness.vehicleEvidenceService.registerRecorder(recorder);

    const qualification = harness.safetyOperatorService.checkQualification(
      {
        safetyOperatorId: DEFAULT_SAFETY_OPERATOR_ID,
        sandboxProgramId: DEFAULT_SANDBOX_PROGRAM_ID,
        vehicleId: "veh-demo-001",
      },
      buildDriverIdentity(DEFAULT_SAFETY_OPERATOR_ID, "req-e2e-p2-001"),
    );

    expect(discovered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vin: "5YJ3E1EA7JF000001",
        }),
      ]),
    );
    expect(binding).toMatchObject({
      vehicleId: "veh-demo-001",
      externalVehicleRef: "tesla-public-veh-demo-001",
    });
    expect(virtualKey).toMatchObject({
      vehicleId: "veh-demo-001",
      status: "paired",
    });
    expect(telemetry).toMatchObject({
      vehicleId: "veh-demo-001",
      mode: "public_mock",
    });
    expect(telemetry.source.sourceSystem).toBe("tesla_public_telemetry");
    expect(
      harness.teslaIntegrationService.getTelemetryProjection("veh-demo-001"),
    ).toMatchObject({
      vehicleId: "veh-demo-001",
      autonomyState: "unknown",
      online: true,
    });
    expect(qualification).toMatchObject({
      qualified: true,
      matchedQualificationIds: [`qual-${DEFAULT_SAFETY_OPERATOR_ID}`],
    });
    expect(
      harness.vehicleEvidenceService.getNoNewDispatchSignal("veh-demo-001"),
    ).toBeNull();

    await expect(
      harness.teslaIntegrationService.issueCommand({
        vehicleId: "veh-demo-001",
        commandType: "remote_start",
        issuedBy: "ops-user-e2e-p2-001",
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        error: {
          code: "TESLA_COMMAND_NOT_ALLOWLISTED",
        },
      },
    });
  });
});
