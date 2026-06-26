import { describe, expect, it } from "vitest";

import type {
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
} from "@drts/contracts";

import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";

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
});
