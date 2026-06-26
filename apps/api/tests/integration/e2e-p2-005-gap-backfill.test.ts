import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import {
  buildDriverIdentity,
  buildSource,
  createAccidentInvestigationHarness,
} from "./e2e-p2-test-helpers";

describe("E2E-P2-005 gap + backfill", () => {
  it("records missing evidence as known gaps, then clears those gaps after mock backfill without inventing liability", async () => {
    const harness = createAccidentInvestigationHarness();
    const identity = buildDriverIdentity("safe-op-001", "req-e2e-p2-005");

    const assignment = await harness.safetyOperatorService.createAssignment(
      {
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-demo-001",
        orderId: "ord-e2e-p2-005",
        sandboxProgramId: harness.sandboxProgramId,
      },
      identity,
    );
    const shift = await harness.safetyOperatorService.startShift(
      {
        safetyOperatorId: "safe-op-001",
        sandboxProgramId: harness.sandboxProgramId,
        deviceId: "device-e2e-p2-005",
        vehicleId: "veh-demo-001",
        assignmentId: assignment.assignmentId,
        startLocation: { lat: 25.0478, lng: 121.5319 },
        notes: "Gap and backfill scenario shift.",
      },
      identity,
    );
    const report = await harness.safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-e2e-p2-005",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-demo-001",
        orderId: "ord-e2e-p2-005",
        sandboxProgramId: harness.sandboxProgramId,
        shiftId: shift.shiftId,
        assignmentId: assignment.assignmentId,
        correlationId: "corr-e2e-p2-005",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: "inc-e2e-p2-005",
        evidenceArtifactIds: [],
        notes: "Initial takeover was missing backfilled evidence.",
        occurredAt: "2026-06-26T10:00:00.000Z",
      },
      identity,
    );

    harness.rocOperationsService.recordTeslaAutonomyTransitionEvent({
      eventId: "tesla-e2e-p2-005",
      takeoverCorrelationId: "corr-e2e-p2-005",
      autonomySessionId: "session-e2e-p2-005",
      vehicleId: "veh-demo-001",
      orderId: "ord-e2e-p2-005",
      transitionType: "manual_takeover",
      occurredAt: "2026-06-26T10:00:20.000Z",
      source: buildSource(
        "tesla_fleet_api",
        "tesla-e2e-p2-005",
        "2026-06-26T10:00:20.000Z",
      ),
    });

    const accidentCase = harness.accidentInvestigationService.createAccidentCase({
      caseId: "acc-e2e-p2-005",
      vehicleId: "veh-demo-001",
      orderId: "ord-e2e-p2-005",
      takeoverCorrelationId: "corr-e2e-p2-005",
      severity: "major",
      occurredAt: "2026-06-26T10:00:00.000Z",
      reportedAt: "2026-06-26T10:00:40.000Z",
      reportedBy: "roc-e2e-p2-005",
      summary: "Evidence backfill scenario.",
    });

    const initialBundle =
      await harness.accidentInvestigationService.generateInvestigationBundle(
        accidentCase.caseId,
        {
          actorId: "investigator-e2e-p2-005",
        },
        "req-bundle-initial-e2e-p2-005",
      );

    harness.teslaIntegrationService.beginOAuth({
      businessAccountId: "biz-seed-001",
      region: "north_america",
      authorizationCode: "oauth-e2e-p2-005",
    });
    harness.teslaIntegrationService.bindVehicle({
      vehicleId: "veh-demo-001",
      vin: "5YJ3E1EA7JF000001",
    });
    harness.teslaIntegrationService.configureTelemetry({
      vehicleId: "veh-demo-001",
      mode: "public_mock",
      sampleIntervalSec: 15,
      mockBatteryLevelPct: 77,
      mockOnline: true,
      mockLocation: { lat: 25.0478, lng: 121.5319 },
    });
    harness.vehicleEvidenceService.registerRecorder(
      buildMockRecorderFixture({
        recorderId: "rec-e2e-p2-005",
        vehicleId: "veh-demo-001",
      }),
    );
    await harness.vehicleEvidenceService.captureEvidenceWindow(
      "rec-e2e-p2-005",
      {
        caseId: accidentCase.caseId,
        eventId: report.report.reportId,
        eventType: "manual_takeover",
        windowStart: "2026-06-26T09:59:30.000Z",
        windowEnd: "2026-06-26T10:00:30.000Z",
      },
    );
    const segment = harness.vehicleEvidenceService.listSegmentIndex({
      caseId: accidentCase.caseId,
    })[0];
    harness.vehicleEvidenceService.bookmarkEvent({
      recorderId: "rec-e2e-p2-005",
      segmentId: segment.segmentId,
      eventId: report.report.reportId,
      eventType: "manual_takeover",
      note: "Backfilled bookmark for takeover review.",
    });
    await harness.teslaIntegrationService.issueCommand({
      vehicleId: "veh-demo-001",
      commandType: "wake_up",
      issuedBy: "ops-user-e2e-p2-005",
    });

    const backfilledBundle =
      await harness.accidentInvestigationService.generateInvestigationBundle(
        accidentCase.caseId,
        {
          actorId: "investigator-e2e-p2-005",
        },
        "req-bundle-backfilled-e2e-p2-005",
      );

    expect(initialBundle.knownGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TESLA_TELEMETRY_STATUS_UNAVAILABLE",
        }),
        expect.objectContaining({
          code: "SYNCED_VIDEO_MISSING",
        }),
      ]),
    );
    const backfilledGapCodes = backfilledBundle.knownGaps.map((gap) => gap.code);
    expect(backfilledGapCodes).not.toContain(
      "TESLA_TELEMETRY_STATUS_UNAVAILABLE",
    );
    expect(backfilledGapCodes).not.toContain("SYNCED_VIDEO_MISSING");
    expect(backfilledBundle.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: "synced_video",
          payload: expect.objectContaining({
            segments: expect.arrayContaining([
              expect.objectContaining({
                caseId: accidentCase.caseId,
              }),
            ]),
          }),
        }),
      ]),
    );
    expect(backfilledBundle.liabilityConclusion).toBeNull();
    expect(backfilledBundle.liabilityConclusionEmitted).toBe(false);
  });
});
