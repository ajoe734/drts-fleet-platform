import { describe, expect, it, vi } from "vitest";

import type {
  Phase2SourceMetadata,
  RocTakeoverResponseRecord,
  TeslaAutonomyTransitionEvent,
} from "@drts/contracts";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";

function buildDriverIdentity(
  safetyOperatorId: string,
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: safetyOperatorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write"],
    requestId: "req-corr-001",
  };
}

function buildGovernanceService() {
  return {
    listSafetyOperatorQualifications: vi.fn(() => [
      {
        qualificationId: "qual-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        safetyOperatorId: "safe-op-001",
        providerCode: "tesla",
        version: 1,
        status: "qualified",
        approvedAreaIds: ["area-001"],
        approvedRouteIds: ["route-001"],
        certificationRefs: ["cert-001"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ]),
  };
}

function buildSource(
  sourceSystem: Phase2SourceMetadata["sourceSystem"],
  sourceRef: string,
  recordedAt: string,
): Phase2SourceMetadata {
  return {
    sourceSystem,
    sourceRef,
    ingestedAt: recordedAt,
    recordedAt,
    signatureRef: null,
    schemaVersion: "2026-06",
  };
}

async function buildServices() {
  const safetyOperatorService = new SafetyOperatorService(
    {
      recordAuditLog: vi.fn(),
    } as never,
    undefined,
    buildGovernanceService() as never,
  );
  const rocOperationsService = new RocOperationsService(safetyOperatorService);
  const accidentInvestigationService = new AccidentInvestigationService(
    rocOperationsService,
  );
  const identity = buildDriverIdentity("safe-op-001");

  const assignment = await safetyOperatorService.createAssignment(
    {
      safetyOperatorId: "safe-op-001",
      vehicleId: "veh-safe-001",
      orderId: "ord-safe-001",
      sandboxProgramId: "sandbox-demo-001",
    },
    identity,
  );
  const shift = await safetyOperatorService.startShift(
    {
      safetyOperatorId: "safe-op-001",
      sandboxProgramId: "sandbox-demo-001",
      deviceId: "device-safe-001",
      vehicleId: "veh-safe-001",
      assignmentId: assignment.assignmentId,
      startLocation: { lat: 25.04, lng: 121.56 },
      notes: "Shift online.",
    },
    identity,
  );

  return {
    accidentInvestigationService,
    identity,
    rocOperationsService,
    safetyOperatorService,
    assignmentId: assignment.assignmentId,
    shiftId: shift.shiftId,
  };
}

function buildTeslaEvent(
  partial: Partial<TeslaAutonomyTransitionEvent>,
): TeslaAutonomyTransitionEvent {
  return {
    eventId: "tesla-event-001",
    takeoverCorrelationId: "corr-safe-001",
    autonomySessionId: "session-001",
    vehicleId: "veh-safe-001",
    orderId: "ord-safe-001",
    transitionType: "manual_takeover",
    occurredAt: "2026-06-26T02:00:10.000Z",
    source: buildSource(
      "tesla_fleet_api",
      partial.eventId ?? "tesla-event-001",
      partial.occurredAt ?? "2026-06-26T02:00:10.000Z",
    ),
    ...partial,
  };
}

function buildRocResponse(
  partial: Partial<RocTakeoverResponseRecord>,
): RocTakeoverResponseRecord {
  return {
    responseId: "roc-response-001",
    takeoverCorrelationId: "corr-safe-001",
    autonomySessionId: "session-001",
    triggeredByTeslaEventId: "tesla-event-001",
    rocOperatorId: "roc-001",
    vehicleId: "veh-safe-001",
    orderId: "ord-safe-001",
    responseType: "remote_assist",
    requestedAt: "2026-06-26T02:00:20.000Z",
    respondedAt: "2026-06-26T02:00:40.000Z",
    resolvedAt: null,
    outcomeNote: "Remote assist accepted.",
    source: buildSource(
      "roc_operator",
      partial.responseId ?? "roc-response-001",
      partial.requestedAt ?? "2026-06-26T02:00:20.000Z",
    ),
    ...partial,
  };
}

describe("RocOperationsService", () => {
  it("matches all three sources by priority 1 takeover correlation id", async () => {
    const {
      accidentInvestigationService,
      identity,
      rocOperationsService,
      safetyOperatorService,
      assignmentId,
      shiftId,
    } = await buildServices();

    await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-001",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId,
        assignmentId,
        correlationId: "corr-safe-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "continued_manual",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: null,
        evidenceArtifactIds: ["artifact-safe-001"],
        notes: "Priority 1 match report.",
        occurredAt: "2026-06-26T02:00:30.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent(buildTeslaEvent({}));
    rocOperationsService.recordRocTakeoverResponseRecord(buildRocResponse({}));

    const snapshot =
      accidentInvestigationService.rebuildTakeoverCorrelationSnapshot();

    expect(snapshot.cases).toHaveLength(1);
    expect(snapshot.discrepancies).toHaveLength(0);
    expect(snapshot.cases[0]).toEqual(
      expect.objectContaining({
        correlationPriority: 1,
        matchedBy: "takeover_correlation_id",
        sourceRecordIds: expect.objectContaining({
          teslaEventId: "tesla-event-001",
          rocTakeoverResponseId: "roc-response-001",
        }),
      }),
    );
  });

  it("falls back to priority 2 vehicle+time+trip matching when correlation ids are absent", async () => {
    const {
      accidentInvestigationService,
      identity,
      rocOperationsService,
      safetyOperatorService,
      assignmentId,
      shiftId,
    } = await buildServices();

    await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-002",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId,
        assignmentId,
        correlationId: "corr-safe-report-only",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: null,
        evidenceArtifactIds: [],
        notes: "Priority 2 match report.",
        occurredAt: "2026-06-26T03:00:30.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent(
      buildTeslaEvent({
        eventId: "tesla-event-002",
        takeoverCorrelationId: null,
        occurredAt: "2026-06-26T03:01:00.000Z",
        source: buildSource(
          "tesla_fleet_api",
          "tesla-event-002",
          "2026-06-26T03:01:00.000Z",
        ),
      }),
    );
    rocOperationsService.recordRocTakeoverResponseRecord(
      buildRocResponse({
        responseId: "roc-response-002",
        takeoverCorrelationId: null,
        triggeredByTeslaEventId: "tesla-event-002",
        requestedAt: "2026-06-26T03:01:20.000Z",
        respondedAt: "2026-06-26T03:01:50.000Z",
        source: buildSource(
          "roc_operator",
          "roc-response-002",
          "2026-06-26T03:01:20.000Z",
        ),
      }),
    );

    const cases = accidentInvestigationService.listCorrelatedTakeoverCases();

    expect(cases).toHaveLength(1);
    expect(cases[0]).toEqual(
      expect.objectContaining({
        correlationPriority: 2,
        matchedBy: "vehicle_time_trip",
        sourceRecordIds: expect.objectContaining({
          teslaEventId: "tesla-event-002",
          rocTakeoverResponseId: "roc-response-002",
        }),
      }),
    );
  });

  it("keeps the safety report correlation id on manual links when source ids disagree", async () => {
    const {
      accidentInvestigationService,
      identity,
      rocOperationsService,
      safetyOperatorService,
      assignmentId,
      shiftId,
    } = await buildServices();

    const takeover = await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-003b",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId,
        assignmentId,
        correlationId: "corr-safe-003b",
        trigger: "vehicle_alert",
        reasonCode: "other",
        disposition: "trip_ended",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: null,
        evidenceArtifactIds: [],
        notes: "Manual correlation keeps safety correlation id.",
        occurredAt: "2026-06-26T04:00:00.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent(
      buildTeslaEvent({
        eventId: "tesla-event-003b",
        takeoverCorrelationId: "corr-tesla-003b",
        occurredAt: "2026-06-26T04:00:30.000Z",
        source: buildSource(
          "tesla_fleet_api",
          "tesla-event-003b",
          "2026-06-26T04:00:30.000Z",
        ),
      }),
    );
    rocOperationsService.recordRocTakeoverResponseRecord(
      buildRocResponse({
        responseId: "roc-response-003b",
        takeoverCorrelationId: "corr-roc-003b",
        triggeredByTeslaEventId: "tesla-event-003b",
        requestedAt: "2026-06-26T04:00:40.000Z",
        respondedAt: "2026-06-26T04:01:00.000Z",
        source: buildSource(
          "roc_operator",
          "roc-response-003b",
          "2026-06-26T04:00:40.000Z",
        ),
      }),
    );
    rocOperationsService.createManualTakeoverCorrelation({
      manualLinkId: "manual-link-003b",
      vehicleId: "veh-safe-001",
      takeoverReportId: takeover.report.reportId,
      teslaEventId: "tesla-event-003b",
      rocResponseId: "roc-response-003b",
      linkedBy: "reviewer-001",
      linkedAt: "2026-06-26T04:02:00.000Z",
      note: "Manual review tied mismatched sources together.",
    });

    const snapshot =
      accidentInvestigationService.rebuildTakeoverCorrelationSnapshot();

    expect(snapshot.cases[0]?.takeoverCorrelationId).toBe("corr-safe-003b");
    expect(snapshot.discrepancies[0]?.sourceFacts).toEqual(
      expect.objectContaining({
        teslaTakeoverCorrelationId: "corr-tesla-003b",
        safetyTakeoverCorrelationId: "corr-safe-003b",
        rocTakeoverCorrelationId: "corr-roc-003b",
      }),
    );
  });

  it("chooses the nearest priority 2 records inside the time window instead of insertion order", async () => {
    const {
      accidentInvestigationService,
      identity,
      rocOperationsService,
      safetyOperatorService,
      assignmentId,
      shiftId,
    } = await buildServices();

    await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-002b",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId,
        assignmentId,
        correlationId: "corr-safe-002b",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: null,
        evidenceArtifactIds: [],
        notes: "Priority 2 nearest-match selection.",
        occurredAt: "2026-06-26T03:04:00.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent(
      buildTeslaEvent({
        eventId: "tesla-event-002b-far",
        takeoverCorrelationId: null,
        occurredAt: "2026-06-26T03:09:00.000Z",
        source: buildSource(
          "tesla_fleet_api",
          "tesla-event-002b-far",
          "2026-06-26T03:09:00.000Z",
        ),
      }),
    );
    rocOperationsService.recordTeslaAutonomyTransitionEvent(
      buildTeslaEvent({
        eventId: "tesla-event-002b-near",
        takeoverCorrelationId: null,
        occurredAt: "2026-06-26T03:04:10.000Z",
        source: buildSource(
          "tesla_fleet_api",
          "tesla-event-002b-near",
          "2026-06-26T03:04:10.000Z",
        ),
      }),
    );
    rocOperationsService.recordRocTakeoverResponseRecord(
      buildRocResponse({
        responseId: "roc-response-002b-far",
        takeoverCorrelationId: null,
        triggeredByTeslaEventId: "tesla-event-002b-far",
        requestedAt: "2026-06-26T03:08:30.000Z",
        respondedAt: "2026-06-26T03:08:50.000Z",
        source: buildSource(
          "roc_operator",
          "roc-response-002b-far",
          "2026-06-26T03:08:30.000Z",
        ),
      }),
    );
    rocOperationsService.recordRocTakeoverResponseRecord(
      buildRocResponse({
        responseId: "roc-response-002b-near",
        takeoverCorrelationId: null,
        triggeredByTeslaEventId: "tesla-event-002b-near",
        requestedAt: "2026-06-26T03:04:20.000Z",
        respondedAt: "2026-06-26T03:04:40.000Z",
        source: buildSource(
          "roc_operator",
          "roc-response-002b-near",
          "2026-06-26T03:04:20.000Z",
        ),
      }),
    );

    const cases = accidentInvestigationService.listCorrelatedTakeoverCases();

    expect(cases[0]).toEqual(
      expect.objectContaining({
        sourceRecordIds: expect.objectContaining({
          teslaEventId: "tesla-event-002b-near",
          rocTakeoverResponseId: "roc-response-002b-near",
        }),
      }),
    );
  });

  it("supports priority 3 manual links and emits discrepancy cases without overwriting source facts", async () => {
    const {
      accidentInvestigationService,
      identity,
      rocOperationsService,
      safetyOperatorService,
      assignmentId,
      shiftId,
    } = await buildServices();

    const takeover = await safetyOperatorService.submitTakeoverReport(
      {
        clientGeneratedReportId: "client-report-003",
        safetyOperatorId: "safe-op-001",
        vehicleId: "veh-safe-001",
        orderId: "ord-safe-001",
        sandboxProgramId: "sandbox-demo-001",
        shiftId,
        assignmentId,
        correlationId: "corr-safe-003",
        trigger: "vehicle_alert",
        reasonCode: "other",
        disposition: "trip_ended",
        fsdResumed: false,
        bookmarkId: null,
        incidentId: "inc-safe-003",
        evidenceArtifactIds: ["artifact-safe-003"],
        notes: "Manual correlation report.",
        occurredAt: "2026-06-26T04:00:00.000Z",
      },
      identity,
    );

    rocOperationsService.recordTeslaAutonomyTransitionEvent(
      buildTeslaEvent({
        eventId: "tesla-event-003",
        takeoverCorrelationId: "corr-tesla-003",
        orderId: "ord-safe-999",
        occurredAt: "2026-06-26T04:05:00.000Z",
        source: buildSource(
          "tesla_fleet_api",
          "tesla-event-003",
          "2026-06-26T04:05:00.000Z",
        ),
      }),
    );
    rocOperationsService.recordRocTakeoverResponseRecord(
      buildRocResponse({
        responseId: "roc-response-003",
        takeoverCorrelationId: "corr-roc-003",
        triggeredByTeslaEventId: "tesla-event-003",
        orderId: "ord-safe-888",
        requestedAt: "2026-06-26T04:06:00.000Z",
        respondedAt: "2026-06-26T04:06:30.000Z",
        source: buildSource(
          "roc_operator",
          "roc-response-003",
          "2026-06-26T04:06:00.000Z",
        ),
      }),
    );
    rocOperationsService.createManualTakeoverCorrelation({
      manualLinkId: "manual-link-003",
      vehicleId: "veh-safe-001",
      takeoverReportId: takeover.report.reportId,
      teslaEventId: "tesla-event-003",
      rocResponseId: "roc-response-003",
      linkedBy: "reviewer-001",
      linkedAt: "2026-06-26T04:07:00.000Z",
      note: "Manual review tied the three sources together.",
    });

    const snapshot =
      accidentInvestigationService.rebuildTakeoverCorrelationSnapshot();

    expect(snapshot.cases).toHaveLength(1);
    expect(snapshot.cases[0]).toEqual(
      expect.objectContaining({
        correlationPriority: 3,
        matchedBy: "manual",
        manualCorrelation: expect.objectContaining({
          manualLinkId: "manual-link-003",
        }),
        sourceTimestamps: expect.objectContaining({
          teslaOccurredAt: "2026-06-26T04:05:00.000Z",
          safetyOccurredAt: "2026-06-26T04:00:00.000Z",
          rocRequestedAt: "2026-06-26T04:06:00.000Z",
        }),
      }),
    );
    expect(snapshot.discrepancies).toHaveLength(1);
    expect(snapshot.discrepancies[0].discrepancyTypes).toEqual(
      expect.arrayContaining([
        "timestamp_mismatch",
        "trip_mismatch",
        "correlation_id_mismatch",
      ]),
    );
    expect(snapshot.cases[0].teslaEvent?.orderId).toBe("ord-safe-999");
    expect(snapshot.cases[0].safetyOperatorTakeoverReport.orderId).toBe(
      "ord-safe-001",
    );
    expect(snapshot.cases[0].rocTakeoverResponse?.orderId).toBe("ord-safe-888");
  });
});
