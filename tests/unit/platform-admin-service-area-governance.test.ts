import { describe, expect, it } from "vitest";

import {
  buildAffectedEvaluationSamples,
  summarizeServiceAreaEvaluationResults,
  validateServiceAreaGeometry,
} from "../../apps/platform-admin-web/lib/service-area-governance";
import type {
  ServiceAreaEvaluationResult,
  StopPolicyRecord,
} from "@drts/contracts";

const stopPolicy: StopPolicyRecord = {
  stopPolicyId: "stop-policy-unit-001",
  policyCode: "TPE_STATION_PICKUP_BLOCK",
  displayName: "Taipei station pickup curb restriction",
  status: "review",
  direction: "pickup",
  effect: "deny",
  geometry: {
    type: "circle",
    center: { lat: 25.0478, lng: 121.5171 },
    radiusMeters: 220,
  },
  serviceAreaCodes: ["TAIPEI_CORE"],
  serviceProductTypes: ["taxi_realtime"],
  reasonCode: "PICKUP_NOT_ALLOWED",
  reasonMessage: "Pickup is not allowed at this curb zone.",
  effectiveFrom: "2026-07-10T00:00:00.000Z",
  effectiveUntil: null,
  version: 3,
  metadata: { source: "unit" },
  createdAt: "2026-06-29T00:00:00.000Z",
  updatedAt: "2026-06-30T12:00:00.000Z",
};

describe("platform-admin service-area governance helpers", () => {
  it("blocks self-intersecting polygons before publish", () => {
    const errors = validateServiceAreaGeometry({
      type: "polygon",
      coordinates: [
        { lat: 25, lng: 121 },
        { lat: 26, lng: 122 },
        { lat: 26, lng: 121 },
        { lat: 25, lng: 122 },
      ],
    });

    expect(errors).toContain("Polygon edges must not self-intersect.");
  });

  it("builds affected evaluator samples with target version refs", () => {
    const samples = buildAffectedEvaluationSamples(stopPolicy, {
      requestedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(samples).toHaveLength(3);
    expect(samples.map((sample) => sample.sampleId)).toEqual([
      "target-pickup",
      "target-dropoff",
      "outside-control",
    ]);
    expect(samples[0]).toMatchObject({
      targetVersionRef: "stop_policy:TPE_STATION_PICKUP_BLOCK@v3",
      command: {
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.0478, lng: 121.5171 },
      },
    });
  });

  it("summarizes evaluator decisions for publish proof", () => {
    const results: ServiceAreaEvaluationResult[] = [
      {
        decision: "not_serviceable",
        serviceProductType: "taxi_realtime",
        evaluatedAt: "2026-07-01T00:00:00.000Z",
        stops: [],
        serviceAreaCodes: ["TAIPEI_CORE"],
        geometryVersionRefs: ["stop_policy:TPE_STATION_PICKUP_BLOCK@v3"],
        reasonCodes: ["PICKUP_NOT_ALLOWED"],
        reasonMessages: ["Pickup is not allowed at this curb zone."],
      },
      {
        decision: "manual_review",
        serviceProductType: "taxi_realtime",
        evaluatedAt: "2026-07-01T00:00:00.000Z",
        stops: [],
        serviceAreaCodes: ["TAIPEI_CORE"],
        geometryVersionRefs: ["svc_area:TAIPEI_CORE@v2"],
        reasonCodes: ["MANUAL_REVIEW_ZONE"],
        reasonMessages: ["Manual review required."],
      },
      {
        decision: "serviceable",
        serviceProductType: "taxi_realtime",
        evaluatedAt: "2026-07-01T00:00:00.000Z",
        stops: [],
        serviceAreaCodes: ["TAIPEI_CORE"],
        geometryVersionRefs: ["svc_area:TAIPEI_CORE@v2"],
        reasonCodes: [],
        reasonMessages: [],
      },
    ];

    expect(summarizeServiceAreaEvaluationResults(results)).toMatchObject({
      total: 3,
      blocked: 1,
      manualReview: 1,
      serviceable: 1,
      versionRefs: [
        "stop_policy:TPE_STATION_PICKUP_BLOCK@v3",
        "svc_area:TAIPEI_CORE@v2",
      ],
      reasonCodes: ["MANUAL_REVIEW_ZONE", "PICKUP_NOT_ALLOWED"],
    });
  });
});
