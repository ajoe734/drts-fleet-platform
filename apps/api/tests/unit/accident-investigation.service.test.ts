import { describe, expect, it, vi } from "vitest";

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
        "known_gaps",
      ]),
    );
    expect(bundle.manifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: "known_gaps",
          itemCount: bundle.knownGaps.length,
        }),
      ]),
    );
    expect(
      bundle.sections.find((section) => section.sectionId === "known_gaps")?.payload,
    ).toMatchObject({
      knownGaps: bundle.knownGaps,
      summary: {
        totalCount: bundle.knownGaps.length,
      },
    });
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

  it("limits synced bookmarks and command receipts to evidence linked to the case", async () => {
    const correlatedCase: CorrelatedTakeoverCase = {
      correlatedTakeoverCaseId: "corr-case-filter-001",
      vehicleId: "veh-filter-001",
      orderId: "ord-filter-001",
      takeoverCorrelationId: "takeover-filter-001",
      correlationPriority: 1,
      matchedBy: "vehicle_time_trip",
      sourceRecordIds: {
        teslaEventId: "tesla-event-filter-001",
        safetyOperatorTakeoverReportId: "report-filter-001",
        rocTakeoverResponseId: "roc-response-filter-001",
      },
      sourceTimestamps: {
        teslaOccurredAt: "2026-06-26T10:00:05.000Z",
        safetyOccurredAt: "2026-06-26T10:00:00.000Z",
        safetyServerReceivedAt: "2026-06-26T10:00:20.000Z",
        rocRequestedAt: "2026-06-26T10:00:25.000Z",
        rocRespondedAt: "2026-06-26T10:00:40.000Z",
        rocResolvedAt: null,
      },
      teslaEvent: {
        eventId: "tesla-event-filter-001",
        takeoverCorrelationId: "takeover-filter-001",
        autonomySessionId: "session-filter-001",
        vehicleId: "veh-filter-001",
        orderId: "ord-filter-001",
        transitionType: "manual_takeover",
        occurredAt: "2026-06-26T10:00:05.000Z",
        source: {
          sourceSystem: "tesla_fleet_api",
          sourceRef: "tesla-event-filter-001",
          ingestedAt: "2026-06-26T10:00:05.000Z",
          recordedAt: "2026-06-26T10:00:05.000Z",
          signatureRef: null,
          schemaVersion: "2026-06",
        },
      },
      safetyOperatorTakeoverReport: {
        reportId: "report-filter-001",
        clientGeneratedReportId: "client-report-filter-001",
        safetyOperatorId: "safe-op-filter-001",
        vehicleId: "veh-filter-001",
        orderId: "ord-filter-001",
        sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
        shiftId: "shift-filter-001",
        assignmentId: "assignment-filter-001",
        correlationId: "takeover-filter-001",
        trigger: "vehicle_alert",
        reasonCode: "sensor_fault",
        disposition: "remote_assist",
        fsdResumed: false,
        bookmarkId: "bookmark-keep-001",
        incidentId: "incident-filter-001",
        evidenceArtifactIds: ["artifact-filter-001"],
        notes: "Linked takeover report.",
        occurredAt: "2026-06-26T10:00:00.000Z",
        serverReceivedAt: "2026-06-26T10:00:20.000Z",
      },
      rocTakeoverResponse: {
        responseId: "roc-response-filter-001",
        takeoverCorrelationId: "takeover-filter-001",
        autonomySessionId: "session-filter-001",
        triggeredByTeslaEventId: "tesla-event-filter-001",
        rocOperatorId: "roc-filter-001",
        vehicleId: "veh-filter-001",
        orderId: "ord-filter-001",
        responseType: "remote_assist",
        requestedAt: "2026-06-26T10:00:25.000Z",
        respondedAt: "2026-06-26T10:00:40.000Z",
        resolvedAt: null,
        outcomeNote: "Linked ROC response.",
        source: {
          sourceSystem: "roc_operator",
          sourceRef: "roc-response-filter-001",
          ingestedAt: "2026-06-26T10:00:25.000Z",
          recordedAt: "2026-06-26T10:00:25.000Z",
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
      undefined,
      {
        getOrder: () => ({
          orderId: "ord-filter-001",
          orderNo: "ORD-FILTER-001",
          pickup: { lat: 25.0478, lng: 121.5319 },
          dropoff: { lat: 25.052, lng: 121.5436 },
        }),
        listDispatchTrace: () => [],
      } as never,
      {
        listTakeoverReports: () => [correlatedCase.safetyOperatorTakeoverReport],
      } as never,
      undefined,
      {
        getTelemetryStatus: () => ({
          vehicleId: "veh-filter-001",
          mode: "public_mock",
          source: {
            sourceSystem: "tesla_public_telemetry",
            sourceRef: "veh-filter-001",
            ingestedAt: "2026-06-26T10:00:00.000Z",
            recordedAt: "2026-06-26T10:00:00.000Z",
            signatureRef: null,
            schemaVersion: "2026-06",
          },
          configuredAt: "2026-06-26T10:00:00.000Z",
          lastPublicSampleAt: "2026-06-26T10:00:00.000Z",
          lastProjectionAt: "2026-06-26T10:00:00.000Z",
        }),
        getPublicTelemetrySample: () => ({
          sampleId: "sample-filter-001",
          externalVehicleRef: "tesla-veh-filter-001",
          capturedAt: "2026-06-26T10:00:00.000Z",
          location: { lat: 25.0478, lng: 121.5319 },
          batteryLevelPct: 80,
          online: true,
          source: {
            sourceSystem: "tesla_public_telemetry",
            sourceRef: "tesla-veh-filter-001",
            ingestedAt: "2026-06-26T10:00:00.000Z",
            recordedAt: "2026-06-26T10:00:00.000Z",
            signatureRef: null,
            schemaVersion: "2026-06",
          },
        }),
        getTelemetryProjection: () => ({
          snapshotId: "snapshot-filter-001",
          vehicleId: "veh-filter-001",
          externalVehicleRef: "tesla-veh-filter-001",
          capturedAt: "2026-06-26T10:00:00.000Z",
          location: { lat: 25.0478, lng: 121.5319 },
          speedMps: 0,
          headingDeg: 180,
          shiftState: "D",
          autonomyState: "active",
          batteryLevelPct: 80,
          batteryRangeKm: 320.4,
          charging: false,
          online: true,
          source: {
            sourceSystem: "tesla_public_telemetry",
            sourceRef: "tesla-veh-filter-001",
            ingestedAt: "2026-06-26T10:00:00.000Z",
            recordedAt: "2026-06-26T10:00:00.000Z",
            signatureRef: null,
            schemaVersion: "2026-06",
          },
        }),
        listReceipts: () => [
          {
            commandId: "receipt-keep-001",
            idempotencyKey: "idem-keep-001",
            vehicleId: "veh-filter-001",
            commandType: "flash_lights",
            status: "acknowledged",
            issuedBy: "roc-filter-001",
            issuedAt: "2026-06-26T10:01:00.000Z",
            acknowledgedAt: "2026-06-26T10:01:00.000Z",
            providerRef: "provider-keep-001",
            failureReasonCode: null,
            source: {
              sourceSystem: "tesla_fleet_api",
              sourceRef: "provider-keep-001",
              ingestedAt: "2026-06-26T10:01:00.000Z",
              recordedAt: "2026-06-26T10:01:00.000Z",
              signatureRef: null,
              schemaVersion: "2026-06",
            },
          },
          {
            commandId: "receipt-drop-001",
            idempotencyKey: "idem-drop-001",
            vehicleId: "veh-filter-001",
            commandType: "honk_horn",
            status: "acknowledged",
            issuedBy: "roc-filter-002",
            issuedAt: "2026-06-26T13:45:00.000Z",
            acknowledgedAt: "2026-06-26T13:45:00.000Z",
            providerRef: "provider-drop-001",
            failureReasonCode: null,
            source: {
              sourceSystem: "tesla_fleet_api",
              sourceRef: "provider-drop-001",
              ingestedAt: "2026-06-26T13:45:00.000Z",
              recordedAt: "2026-06-26T13:45:00.000Z",
              signatureRef: null,
              schemaVersion: "2026-06",
            },
          },
        ],
      } as never,
      {
        listSegmentIndex: () => [
          {
            segmentId: "segment-keep-001",
            recorderId: "recorder-filter-001",
            vehicleId: "veh-filter-001",
            caseId: "acc-case-filter-001",
            manifestId: "manifest-filter-001",
            artifactId: "artifact-filter-001",
            artifactType: "video_clip",
            objectKey: "veh-filter-001/segment-keep.mp4",
            startedAt: "2026-06-26T09:59:30.000Z",
            endedAt: "2026-06-26T10:01:30.000Z",
            checksumSha256: "checksum-keep-001",
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
            bookmarkId: "bookmark-keep-001",
            recorderId: "recorder-filter-001",
            vehicleId: "veh-filter-001",
            segmentId: "segment-keep-001",
            eventId: "tesla-event-filter-001",
            eventType: "collision",
            note: "Linked bookmark",
            bookmarkedAt: "2026-06-26T10:00:10.000Z",
          },
          {
            bookmarkId: "bookmark-drop-001",
            recorderId: "recorder-filter-002",
            vehicleId: "veh-filter-001",
            segmentId: "segment-other-001",
            eventId: "tesla-event-other-001",
            eventType: "collision",
            note: "Unrelated bookmark from another case",
            bookmarkedAt: "2026-06-26T13:45:10.000Z",
          },
        ],
      } as never,
    );

    service.createAccidentCase({
      caseId: "acc-case-filter-001",
      vehicleId: "veh-filter-001",
      orderId: "ord-filter-001",
      takeoverCorrelationId: "takeover-filter-001",
      severity: "major",
      occurredAt: "2026-06-26T10:00:00.000Z",
      reportedBy: "roc-filter-001",
    });

    const bundle = await service.generateInvestigationBundle("acc-case-filter-001", {
      actorId: "investigator-filter-001",
    });

    const syncedVideo = bundle.sections.find(
      (section) => section.sectionId === "synced_video",
    );
    expect(
      (syncedVideo?.payload as { bookmarks: Array<{ bookmarkId: string }> }).bookmarks,
    ).toEqual([expect.objectContaining({ bookmarkId: "bookmark-keep-001" })]);

    const commands = bundle.sections.find(
      (section) => section.sectionId === "commands_and_receipts",
    );
    expect(
      (commands?.payload as { receipts: Array<{ commandId: string }> }).receipts,
    ).toEqual([expect.objectContaining({ commandId: "receipt-keep-001" })]);
  });

  it("keeps unlinked cases from inheriting same-vehicle Tesla and ROC evidence", async () => {
    const service = new AccidentInvestigationService(
      {
        rebuildCorrelatedTakeoverCases: () => ({
          cases: [],
          discrepancies: [],
        }),
        listTeslaAutonomyTransitionEvents: () => [
          {
            eventId: "tesla-unrelated-001",
            takeoverCorrelationId: "takeover-unrelated-001",
            autonomySessionId: "session-unrelated-001",
            vehicleId: "veh-review-001",
            orderId: "ord-unrelated-001",
            transitionType: "manual_takeover",
            occurredAt: "2026-06-26T13:30:05.000Z",
            source: {
              sourceSystem: "tesla_fleet_api",
              sourceRef: "tesla-unrelated-001",
              ingestedAt: "2026-06-26T13:30:05.000Z",
              recordedAt: "2026-06-26T13:30:05.000Z",
              signatureRef: null,
              schemaVersion: "2026-06",
            },
          },
        ],
        listRocTakeoverResponseRecords: () => [
          {
            responseId: "roc-unrelated-001",
            takeoverCorrelationId: "takeover-unrelated-001",
            autonomySessionId: "session-unrelated-001",
            triggeredByTeslaEventId: "tesla-unrelated-001",
            rocOperatorId: "roc-unrelated-001",
            vehicleId: "veh-review-001",
            orderId: "ord-unrelated-001",
            responseType: "remote_assist",
            requestedAt: "2026-06-26T13:30:15.000Z",
            respondedAt: "2026-06-26T13:30:30.000Z",
            resolvedAt: null,
            outcomeNote: "Unrelated ROC response for the same vehicle.",
            source: {
              sourceSystem: "roc_operator",
              sourceRef: "roc-unrelated-001",
              ingestedAt: "2026-06-26T13:30:15.000Z",
              recordedAt: "2026-06-26T13:30:15.000Z",
              signatureRef: null,
              schemaVersion: "2026-06",
            },
          },
        ],
        listManualTakeoverCorrelations: () => [],
      } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        getTelemetryStatus: vi.fn(() => null),
        getPublicTelemetrySample: vi.fn(() => null),
        getTelemetryProjection: vi.fn(() => null),
        listReceipts: () => [
          {
            commandId: "receipt-unrelated-001",
            idempotencyKey: "idem-unrelated-001",
            vehicleId: "veh-review-001",
            commandType: "flash_lights",
            status: "acknowledged",
            issuedBy: "roc-unrelated-001",
            issuedAt: "2026-06-26T13:30:45.000Z",
            acknowledgedAt: "2026-06-26T13:30:45.000Z",
            providerRef: "provider-unrelated-001",
            failureReasonCode: null,
            source: {
              sourceSystem: "tesla_fleet_api",
              sourceRef: "provider-unrelated-001",
              ingestedAt: "2026-06-26T13:30:45.000Z",
              recordedAt: "2026-06-26T13:30:45.000Z",
              signatureRef: null,
              schemaVersion: "2026-06",
            },
          },
        ],
      } as never,
      {
        listSegmentIndex: () => [
          {
            segmentId: "segment-review-001",
            recorderId: "recorder-review-001",
            vehicleId: "veh-review-001",
            caseId: "acc-case-review-001",
            manifestId: "manifest-review-001",
            artifactId: "artifact-review-001",
            artifactType: "video_clip",
            objectKey: "veh-review-001/segment-review-001.mp4",
            startedAt: "2026-06-26T12:59:30.000Z",
            endedAt: "2026-06-26T13:01:30.000Z",
            checksumSha256: "checksum-review-001",
            custodyState: "captured",
            uploadStatus: "uploaded",
            retryCount: 0,
            lastRetryAt: null,
            eventType: "collision",
            bookmarked: false,
          },
        ],
        listBookmarks: () => [
          {
            bookmarkId: "bookmark-unrelated-001",
            recorderId: "recorder-review-002",
            vehicleId: "veh-review-001",
            segmentId: "segment-unrelated-001",
            eventId: "tesla-unrelated-001",
            eventType: "collision",
            note: "Unrelated bookmark from the same vehicle.",
            bookmarkedAt: "2026-06-26T13:30:10.000Z",
          },
        ],
      } as never,
    );

    service.createAccidentCase({
      caseId: "acc-case-review-001",
      vehicleId: "veh-review-001",
      severity: "major",
      occurredAt: "2026-06-26T13:00:00.000Z",
      reportedBy: "roc-review-001",
      summary: "Unlinked case should not inherit unrelated evidence.",
    });

    const bundle = await service.generateInvestigationBundle("acc-case-review-001", {
      actorId: "investigator-review-001",
    });

    const fsdSection = bundle.sections.find(
      (section) => section.sectionId === "fsd_session_events",
    );
    expect(fsdSection?.payload).toMatchObject({
      correlatedTakeoverCase: null,
      teslaEvents: [],
      rocResponses: [],
    });
    expect(bundle.knownGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionId: "fsd_session_events",
          code: "FSD_SESSION_NOT_SYNCHRONIZED",
        }),
      ]),
    );

    const syncedVideo = bundle.sections.find(
      (section) => section.sectionId === "synced_video",
    );
    expect(
      (syncedVideo?.payload as { bookmarks: Array<{ bookmarkId: string }> }).bookmarks,
    ).toEqual([]);

    const commands = bundle.sections.find(
      (section) => section.sectionId === "commands_and_receipts",
    );
    expect(
      (commands?.payload as { receipts: Array<{ commandId: string }> }).receipts,
    ).toEqual([]);
  });

  it("reuses a single upstream snapshot across bundle sections", async () => {
    const getOrder = vi.fn(() => ({
      orderId: "ord-snapshot-001",
      orderNo: "ORD-SNAPSHOT-001",
      pickup: { lat: 25.0478, lng: 121.5319 },
      dropoff: { lat: 25.052, lng: 121.5436 },
    }));
    const listDispatchTrace = vi.fn(() => [{ traceId: "dispatch-trace-snapshot-001" }]);
    const getPublicTelemetrySample = vi.fn(() => ({
      sampleId: "sample-snapshot-001",
      externalVehicleRef: "tesla-veh-snapshot-001",
      capturedAt: "2026-06-26T11:00:00.000Z",
      location: { lat: 25.0478, lng: 121.5319 },
      batteryLevelPct: 76,
      online: true,
      source: {
        sourceSystem: "tesla_public_telemetry",
        sourceRef: "tesla-veh-snapshot-001",
        ingestedAt: "2026-06-26T11:00:00.000Z",
        recordedAt: "2026-06-26T11:00:00.000Z",
        signatureRef: null,
        schemaVersion: "2026-06",
      },
    }));
    const getTelemetryProjection = vi.fn(() => ({
      snapshotId: "projection-snapshot-001",
      vehicleId: "veh-snapshot-001",
      externalVehicleRef: "tesla-veh-snapshot-001",
      capturedAt: "2026-06-26T11:00:00.000Z",
      location: { lat: 25.0478, lng: 121.5319 },
      speedMps: 0,
      headingDeg: 180,
      shiftState: "D",
      autonomyState: "active",
      batteryLevelPct: 76,
      batteryRangeKm: 300.1,
      charging: false,
      online: true,
      source: {
        sourceSystem: "tesla_public_telemetry",
        sourceRef: "tesla-veh-snapshot-001",
        ingestedAt: "2026-06-26T11:00:00.000Z",
        recordedAt: "2026-06-26T11:00:00.000Z",
        signatureRef: null,
        schemaVersion: "2026-06",
      },
    }));
    const listRocTakeoverResponseRecords = vi.fn(() => []);
    const rebuildCorrelatedTakeoverCases = vi.fn(() => ({
      cases: [],
      discrepancies: [],
    }));

    const service = new AccidentInvestigationService(
      {
        rebuildCorrelatedTakeoverCases,
        listTeslaAutonomyTransitionEvents: vi.fn(() => []),
        listRocTakeoverResponseRecords,
        listManualTakeoverCorrelations: vi.fn(() => []),
      } as never,
      undefined,
      {
        getOrder,
        listDispatchTrace,
      } as never,
      undefined,
      undefined,
      {
        getTelemetryStatus: vi.fn(() => ({
          vehicleId: "veh-snapshot-001",
          mode: "public_mock",
          source: {
            sourceSystem: "tesla_public_telemetry",
            sourceRef: "veh-snapshot-001",
            ingestedAt: "2026-06-26T11:00:00.000Z",
            recordedAt: "2026-06-26T11:00:00.000Z",
            signatureRef: null,
            schemaVersion: "2026-06",
          },
          configuredAt: "2026-06-26T11:00:00.000Z",
          lastPublicSampleAt: "2026-06-26T11:00:00.000Z",
          lastProjectionAt: "2026-06-26T11:00:00.000Z",
        })),
        getPublicTelemetrySample,
        getTelemetryProjection,
        listReceipts: vi.fn(() => []),
      } as never,
      {
        listSegmentIndex: vi.fn(() => []),
        listBookmarks: vi.fn(() => []),
      } as never,
    );

    service.createAccidentCase({
      caseId: "acc-case-snapshot-001",
      vehicleId: "veh-snapshot-001",
      orderId: "ord-snapshot-001",
      severity: "major",
      occurredAt: "2026-06-26T11:00:00.000Z",
      reportedBy: "roc-snapshot-001",
    });
    rebuildCorrelatedTakeoverCases.mockClear();

    const bundle = await service.generateInvestigationBundle("acc-case-snapshot-001", {
      actorId: "investigator-snapshot-001",
    });

    const vehicleState = bundle.sections.find(
      (section) => section.sectionId === "vehicle_tesla_state",
    );
    const telemetry = bundle.sections.find(
      (section) => section.sectionId === "telemetry_and_gaps",
    );
    expect(vehicleState?.payload).toMatchObject({
      publicTelemetrySample: expect.objectContaining({
        sampleId: "sample-snapshot-001",
      }),
      stateProjection: expect.objectContaining({
        snapshotId: "projection-snapshot-001",
      }),
    });
    expect(telemetry?.payload).toMatchObject({
      publicTelemetrySample: expect.objectContaining({
        sampleId: "sample-snapshot-001",
      }),
      stateProjection: expect.objectContaining({
        snapshotId: "projection-snapshot-001",
      }),
    });

    expect(rebuildCorrelatedTakeoverCases).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(listDispatchTrace).toHaveBeenCalledTimes(1);
    expect(getPublicTelemetrySample).toHaveBeenCalledTimes(1);
    expect(getTelemetryProjection).toHaveBeenCalledTimes(1);
    expect(listRocTakeoverResponseRecords).toHaveBeenCalledTimes(1);
  });
});
