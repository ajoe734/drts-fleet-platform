import { describe, expect, it } from "vitest";

import { AccidentInvestigationController } from "../../src/modules/accident-investigation/accident-investigation.controller";
import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";

function createController() {
  const service = new AccidentInvestigationService({
    rebuildCorrelatedTakeoverCases: () => ({
      cases: [],
      discrepancies: [],
    }),
  } as never);
  return {
    service,
    controller: new AccidentInvestigationController(service),
  };
}

describe("AccidentInvestigationController", () => {
  it("returns the synchronized timeline envelope without letting derived facts overwrite provider-signed facts", () => {
    const { service, controller } = createController();
    const accidentCase = service.createAccidentCase({
      caseId: "acc-case-ctrl-001",
      vehicleId: "veh-ctrl-001",
      severity: "major",
      occurredAt: "2026-06-26T11:00:00.000Z",
      reportedBy: "roc-ctrl-001",
    });

    service.importExternalDocument(accidentCase.caseId, {
      documentId: "doc-police-001",
      documentType: "police_report",
      title: "Signed police collision report",
      receivedAt: "2026-06-26T11:15:00.000Z",
      source: {
        sourceSystem: "regulatory_filing",
        sourceRef: "police-report-001",
        ingestedAt: "2026-06-26T11:15:00.000Z",
        recordedAt: "2026-06-26T11:05:00.000Z",
        signatureRef: "sig-police-001",
        schemaVersion: "2026-06",
      },
      extractedFacts: [
        {
          factKey: "impact.velocity_estimate_mps",
          label: "Impact velocity estimate",
          value: 13.7,
          occurredAt: "2026-06-26T11:05:00.000Z",
        },
      ],
    });
    service.addTimelineFact(accidentCase.caseId, {
      factId: "derived-speed-001",
      factKey: "impact.velocity_estimate_mps",
      label: "Impact velocity estimate",
      value: 15.2,
      occurredAt: "2026-06-26T11:05:00.000Z",
      confidence: "system_derived",
      sourceSystem: "system_derived",
      derivationRule: "vehicle_dynamics_reconstruction_v2",
      derivedFromFactIds: ["wheel-speed-001", "imu-001"],
    });

    const response = controller.getTimeline(
      accidentCase.caseId,
      "req-accident-timeline-ctrl-001",
    );
    const impactEntry = response.data.items.find(
      (entry) => entry.factKey === "impact.velocity_estimate_mps",
    );

    expect(response.meta).toEqual({
      requestId: "req-accident-timeline-ctrl-001",
      timestamp: expect.any(String),
    });
    expect(impactEntry).toMatchObject({
      value: 13.7,
      confidence: "provider_signed",
      externalDocumentIds: ["doc-police-001"],
      facts: [
        expect.objectContaining({
          confidence: "provider_signed",
          value: 13.7,
          externalDocumentId: "doc-police-001",
        }),
        expect.objectContaining({
          confidence: "system_derived",
          value: 15.2,
          derivationRule: "vehicle_dynamics_reconstruction_v2",
        }),
      ],
    });
    expect(response.data.refresh).toEqual({
      generatedAt: expect.any(String),
      staleAfterMs: 15_000,
      dataFreshness: "fresh",
      source: "live",
    });
  });
});
