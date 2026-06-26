import { describe, expect, it } from "vitest";

import type {
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
} from "@drts/contracts";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";

function createService(snapshot?: {
  cases?: CorrelatedTakeoverCase[];
  discrepancies?: EvidenceDiscrepancyCase[];
}) {
  return new AccidentInvestigationService({
    rebuildCorrelatedTakeoverCases: () => ({
      cases: snapshot?.cases ?? [],
      discrepancies: snapshot?.discrepancies ?? [],
    }),
  } as never);
}

describe("AccidentInvestigationService", () => {
  it("enforces valid-only state transitions across the accident lifecycle", () => {
    const service = createService();
    const accidentCase = service.createAccidentCase({
      caseId: "acc-case-001",
      vehicleId: "veh-acc-001",
      orderId: "ord-acc-001",
      severity: "major",
      occurredAt: "2026-06-26T08:00:00.000Z",
      reportedBy: "roc-ops-001",
      summary: "Initial collision alert received.",
    });

    expect(
      () =>
        service.transitionAccidentCase(accidentCase.caseId, {
          toStatus: "evidence_frozen",
          actorId: "roc-ops-001",
          transitionedAt: "2026-06-26T08:02:00.000Z",
        }),
    ).toThrowError();

    service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "roc_acknowledged",
      actorId: "roc-ops-001",
      transitionedAt: "2026-06-26T08:00:30.000Z",
    });
    service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "operation_suspended",
      actorId: "roc-ops-001",
      transitionedAt: "2026-06-26T08:01:00.000Z",
    });
    service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "emergency_response_active",
      actorId: "roc-ops-001",
      transitionedAt: "2026-06-26T08:01:30.000Z",
    });
    service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "evidence_frozen",
      actorId: "roc-ops-001",
      transitionedAt: "2026-06-26T08:02:00.000Z",
      evidenceManifestId: "manifest-001",
    });
    service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "initial_notification_sent",
      actorId: "roc-ops-001",
      transitionedAt: "2026-06-26T08:05:00.000Z",
    });
    service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "under_investigation",
      actorId: "investigator-001",
      transitionedAt: "2026-06-26T08:10:00.000Z",
    });
    service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "regulator_review",
      actorId: "investigator-001",
      transitionedAt: "2026-06-26T08:30:00.000Z",
      regulatoryReportId: "report-001",
    });
    const closed = service.transitionAccidentCase(accidentCase.caseId, {
      toStatus: "closed",
      actorId: "investigator-001",
      transitionedAt: "2026-06-26T09:00:00.000Z",
    });

    expect(closed).toMatchObject({
      caseId: "acc-case-001",
      status: "closed",
      evidenceManifestId: "manifest-001",
      regulatoryReportId: "report-001",
      closedAt: "2026-06-26T09:00:00.000Z",
    });
    expect(
      service.getTimeline(accidentCase.caseId).map((entry) => entry.value),
    ).toEqual(
      expect.arrayContaining([
        "detected",
        "roc_acknowledged",
        "operation_suspended",
        "emergency_response_active",
        "evidence_frozen",
        "initial_notification_sent",
        "under_investigation",
        "regulator_review",
        "closed",
      ]),
    );
  });

  it("requires derivation metadata for system-derived facts", () => {
    const service = createService();
    const accidentCase = service.createAccidentCase({
      caseId: "acc-case-002",
      vehicleId: "veh-acc-002",
      severity: "minor",
      occurredAt: "2026-06-26T10:00:00.000Z",
      reportedBy: "roc-ops-002",
    });

    expect(
      () =>
        service.addTimelineFact(accidentCase.caseId, {
          factKey: "impact.velocity_estimate_mps",
          label: "Impact velocity estimate",
          value: 12.4,
          occurredAt: "2026-06-26T10:00:05.000Z",
          confidence: "system_derived",
          sourceSystem: "system_derived",
        }),
    ).toThrowError();

    const fact = service.addTimelineFact(accidentCase.caseId, {
      factKey: "impact.velocity_estimate_mps",
      label: "Impact velocity estimate",
      value: 12.4,
      occurredAt: "2026-06-26T10:00:05.000Z",
      confidence: "system_derived",
      sourceSystem: "system_derived",
      derivationRule: "skid_mark_model_v1",
      derivedFromFactIds: ["sensor-fact-001"],
    });

    expect(fact).toMatchObject({
      factKey: "impact.velocity_estimate_mps",
      confidence: "system_derived",
      derivationRule: "skid_mark_model_v1",
      derivedFromFactIds: ["sensor-fact-001"],
    });
  });

  it("generates an investigation bundle with manifest, custody, known gaps, and audited download metadata", async () => {
    const auditNotificationService = new AuditNotificationService();
    const sandboxGovernanceService = new SandboxGovernanceService(
      auditNotificationService,
    );
    const correlatedCase: CorrelatedTakeoverCase = {
      correlatedTakeoverCaseId: "corr-case-001",
      vehicleId: "veh-bundle-001",
      orderId: "ord-bundle-001",
      takeoverCorrelationId: "takeover-bundle-001",
      correlationPriority: 1,
      matchedBy: "vehicle_time_trip",
      sourceRecordIds: {
        teslaEventId: "tesla-event-001",
        safetyOperatorTakeoverReportId: "report-bundle-001",
        rocTakeoverResponseId: "roc-response-001",
      },
      sourceTimestamps: {
        teslaOccurredAt: "2026-06-26T08:00:05.000Z",
        safetyOccurredAt: "2026-06-26T08:00:00.000Z",
        safetyServerReceivedAt: "2026-06-26T08:00:20.000Z",
        rocRequestedAt: "2026-06-26T08:00:30.000Z",
        rocRespondedAt: "2026-06-26T08:00:45.000Z",
        rocResolvedAt: null,
      },
      teslaEvent: {
        eventId: "tesla-event-001",
        takeoverCorrelationId: "takeover-bundle-001",
        autonomySessionId: "session-bundle-001",
        vehicleId: "veh-bundle-001",
        orderId: "ord-bundle-001",
        transitionType: "manual_takeover",
        occurredAt: "2026-06-26T08:00:05.000Z",
        source: {
          sourceSystem: "tesla_fleet_api",
          sourceRef: "tesla-event-001",
          ingestedAt: "2026-06-26T08:00:05.000Z",
          recordedAt: "2026-06-26T08:00:05.000Z",
          signatureRef: null,
          schemaVersion: "2026-06",
        },
      },
      safetyOperatorTakeoverReport: {
        reportId: "report-bundle-001",
        clientGeneratedReportId: "client-report-bundle-001",
        safetyOperatorId: "safe-op-bundle-001",
        vehicleId: "veh-bundle-001",
        orderId: "ord-bundle-001",
        sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
        shiftId: "shift-bundle-001",
        assignmentId: "assignment-bundle-001",
        correlationId: "takeover-bundle-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: "bookmark-bundle-001",
        incidentId: "incident-bundle-001",
        evidenceArtifactIds: ["artifact-bundle-001"],
        notes: "Collision takeover reported by safety operator.",
        occurredAt: "2026-06-26T08:00:00.000Z",
        serverReceivedAt: "2026-06-26T08:00:20.000Z",
      },
      rocTakeoverResponse: {
        responseId: "roc-response-001",
        takeoverCorrelationId: "takeover-bundle-001",
        autonomySessionId: "session-bundle-001",
        triggeredByTeslaEventId: "tesla-event-001",
        rocOperatorId: "roc-bundle-001",
        vehicleId: "veh-bundle-001",
        orderId: "ord-bundle-001",
        responseType: "remote_assist",
        requestedAt: "2026-06-26T08:00:30.000Z",
        respondedAt: "2026-06-26T08:00:45.000Z",
        resolvedAt: null,
        outcomeNote: "ROC acknowledged and coordinated the scene response.",
        source: {
          sourceSystem: "roc_operator",
          sourceRef: "roc-response-001",
          ingestedAt: "2026-06-26T08:00:30.000Z",
          recordedAt: "2026-06-26T08:00:30.000Z",
          signatureRef: null,
          schemaVersion: "2026-06",
        },
      },
      manualCorrelation: null,
      discrepancyCaseIds: [],
    };
    const service = new AccidentInvestigationService(
      {
        rebuildCorrelatedTakeoverCases: () => ({
          cases: [correlatedCase],
          discrepancies: [],
        }),
        listTeslaAutonomyTransitionEvents: () => [correlatedCase.teslaEvent!],
        listRocTakeoverResponseRecords: () => [correlatedCase.rocTakeoverResponse!],
        listManualTakeoverCorrelations: () => [],
      } as never,
      auditNotificationService,
      {
        getOrder: () => ({
          orderId: "ord-bundle-001",
          orderNo: "ORD-BUNDLE-001",
          pickup: { lat: 25.0478, lng: 121.5319 },
          dropoff: { lat: 25.052, lng: 121.5436 },
        }),
        listDispatchTrace: () => [{ traceId: "dispatch-trace-001" }],
      } as never,
      {
        listTakeoverReports: () => [correlatedCase.safetyOperatorTakeoverReport],
      } as never,
      sandboxGovernanceService,
      {
        getTelemetryStatus: () => ({
          vehicleId: "veh-bundle-001",
          mode: "public_mock",
          source: {
            sourceSystem: "tesla_public_telemetry",
            sourceRef: "veh-bundle-001",
            ingestedAt: "2026-06-26T08:00:00.000Z",
            recordedAt: "2026-06-26T08:00:00.000Z",
            signatureRef: null,
            schemaVersion: "2026-06",
          },
          configuredAt: "2026-06-26T08:00:00.000Z",
          lastPublicSampleAt: "2026-06-26T08:00:00.000Z",
          lastProjectionAt: "2026-06-26T08:00:00.000Z",
        }),
        getPublicTelemetrySample: () => ({
          sampleId: "sample-bundle-001",
          externalVehicleRef: "tesla-veh-bundle-001",
          capturedAt: "2026-06-26T08:00:00.000Z",
          location: { lat: 25.0478, lng: 121.5319 },
          batteryLevelPct: 77,
          online: true,
          source: {
            sourceSystem: "tesla_public_telemetry",
            sourceRef: "tesla-veh-bundle-001",
            ingestedAt: "2026-06-26T08:00:00.000Z",
            recordedAt: "2026-06-26T08:00:00.000Z",
            signatureRef: null,
            schemaVersion: "2026-06",
          },
        }),
        getTelemetryProjection: () => ({
          snapshotId: "snapshot-bundle-001",
          vehicleId: "veh-bundle-001",
          externalVehicleRef: "tesla-veh-bundle-001",
          capturedAt: "2026-06-26T08:00:00.000Z",
          location: { lat: 25.0478, lng: 121.5319 },
          speedMps: 0,
          headingDeg: 180,
          shiftState: "D",
          autonomyState: "active",
          batteryLevelPct: 77,
          batteryRangeKm: 310.2,
          charging: false,
          online: true,
          source: {
            sourceSystem: "tesla_public_telemetry",
            sourceRef: "tesla-veh-bundle-001",
            ingestedAt: "2026-06-26T08:00:00.000Z",
            recordedAt: "2026-06-26T08:00:00.000Z",
            signatureRef: null,
            schemaVersion: "2026-06",
          },
        }),
        listReceipts: () => [
          {
            commandId: "tesla-cmd-001",
            idempotencyKey: "idem-001",
            vehicleId: "veh-bundle-001",
            commandType: "flash_lights",
            status: "acknowledged",
            issuedBy: "roc-bundle-001",
            issuedAt: "2026-06-26T08:01:00.000Z",
            acknowledgedAt: "2026-06-26T08:01:00.000Z",
            providerRef: "mock-ref-001",
            failureReasonCode: null,
            source: {
              sourceSystem: "tesla_fleet_api",
              sourceRef: "mock-ref-001",
              ingestedAt: "2026-06-26T08:01:00.000Z",
              recordedAt: "2026-06-26T08:01:00.000Z",
              signatureRef: null,
              schemaVersion: "2026-06",
            },
          },
        ],
      } as never,
      {
        listSegmentIndex: () => [
          {
            segmentId: "segment-bundle-001",
            recorderId: "recorder-bundle-001",
            vehicleId: "veh-bundle-001",
            caseId: "acc-case-bundle-001",
            manifestId: "manifest-bundle-001",
            artifactId: "artifact-bundle-001",
            artifactType: "video_clip",
            objectKey: "veh-bundle-001/segment-001.mp4",
            startedAt: "2026-06-26T07:59:30.000Z",
            endedAt: "2026-06-26T08:01:30.000Z",
            checksumSha256: "checksum-segment-001",
            custodyState: "captured",
            uploadStatus: "uploaded",
            retryCount: 0,
            lastRetryAt: null,
            eventType: "collision",
            bookmarked: true,
          },
        ],
        listBookmarks: () => [
          {
            bookmarkId: "bookmark-bundle-001",
            recorderId: "recorder-bundle-001",
            vehicleId: "veh-bundle-001",
            segmentId: "segment-bundle-001",
            eventId: "tesla-event-001",
            eventType: "collision",
            note: "Collision marker",
            bookmarkedAt: "2026-06-26T08:00:10.000Z",
          },
        ],
      } as never,
    );

    const accidentCase = service.createAccidentCase({
      caseId: "acc-case-bundle-001",
      vehicleId: "veh-bundle-001",
      orderId: "ord-bundle-001",
      takeoverCorrelationId: "takeover-bundle-001",
      severity: "major",
      occurredAt: "2026-06-26T08:00:00.000Z",
      reportedBy: "roc-bundle-001",
      summary: "Accident bundle generation scenario.",
    });

    const bundle = await service.generateInvestigationBundle(
      accidentCase.caseId,
      {
        actorId: "investigator-bundle-001",
        requestedAt: "2026-06-26T08:05:00.000Z",
      },
      "req-acc-bundle-001",
    );

    expect(bundle).toMatchObject({
      caseId: "acc-case-bundle-001",
      liabilityConclusion: null,
      liabilityConclusionEmitted: false,
      custodyPackage: {
        records: expect.arrayContaining([
          expect.objectContaining({ action: "bundle_requested" }),
          expect.objectContaining({ action: "controlled_download_issued" }),
        ]),
      },
      downloadMetadata: {
        bundle: expect.objectContaining({
          ttlMinutes: 15,
          kind: "accident-investigation-bundle",
        }),
      },
    });
    expect(bundle.manifest.entryCount).toBe(bundle.sections.length);
    expect(bundle.sections.map((section) => section.sectionId)).toEqual(
      expect.arrayContaining([
        "case",
        "booking",
        "experiment_jurisdiction_snapshot",
        "vehicle_tesla_state",
        "fsd_session_events",
        "synced_video",
        "commands_and_receipts",
      ]),
    );
    expect(bundle.knownGaps).toEqual(expect.any(Array));
    expect(bundle.knownGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: "experiment_jurisdiction_snapshot",
        }),
      ]),
    );

    const auditEntry = auditNotificationService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "issue_accident_investigation_bundle_download",
      );
    expect(auditEntry?.newValuesSummary).toMatchObject({
      caseId: "acc-case-bundle-001",
      liabilityConclusionEmitted: false,
      ttlMinutes: 15,
    });
  });
});
