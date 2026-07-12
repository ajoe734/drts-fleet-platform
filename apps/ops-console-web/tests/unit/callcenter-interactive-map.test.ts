import type { ServiceAreaGeoJsonResponse } from "@drts/contracts";
import { describe, expect, it } from "vitest";

import { filterCallcenterMapFeatures } from "../../app/callcenter/callcenter-map-overlays";

const geoJson: ServiceAreaGeoJsonResponse = {
  type: "FeatureCollection",
  generatedAt: "2026-07-11T00:00:00.000Z",
  features: [
    feature("service", "service_area", "both", "taxi_realtime"),
    feature("pickup-deny", "stop_policy", "pickup", "taxi_realtime"),
    feature("dropoff-deny", "stop_policy", "dropoff", "taxi_realtime"),
    feature("other-product", "stop_policy", "both", "taxi_reservation"),
  ],
};

function feature(
  id: string,
  kind: "service_area" | "stop_policy",
  direction: "pickup" | "dropoff" | "both",
  product: "taxi_realtime" | "taxi_reservation",
): ServiceAreaGeoJsonResponse["features"][number] {
  const base = {
    type: "Feature" as const,
    id,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [121.5, 25.0],
          [121.6, 25.0],
          [121.6, 25.1],
          [121.5, 25.0],
        ],
      ],
    },
  };
  if (kind === "service_area") {
    return {
      ...base,
      properties: {
        recordKind: "service_area",
        serviceAreaId: id,
        areaCode: id,
        displayName: id,
        status: "active",
        sourceGeometry: {
          type: "circle",
          center: { lat: 25.0, lng: 121.5 },
          radiusMeters: 100,
        },
        serviceProductTypes: [product],
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: null,
        version: 1,
        geometryVersionRef: `${id}@1`,
      },
    };
  }
  return {
    ...base,
    properties: {
      recordKind: "stop_policy",
      stopPolicyId: id,
      policyCode: id,
      displayName: id,
      status: "active",
      direction,
      effect: "deny",
      sourceGeometry: {
        type: "circle",
        center: { lat: 25.0, lng: 121.5 },
        radiusMeters: 100,
      },
      serviceAreaCodes: ["service"],
      serviceProductTypes: [product],
      reasonCode: "NO_STOP",
      reasonMessage: "No stop",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: null,
      version: 1,
      geometryVersionRef: `${id}@1`,
    },
  };
}

describe("Callcenter interactive map overlays", () => {
  it("shows service areas and only policies that apply to the stop direction", () => {
    const pickup = filterCallcenterMapFeatures(
      geoJson,
      "pickup",
      "taxi_realtime",
    );
    const dropoff = filterCallcenterMapFeatures(
      geoJson,
      "dropoff",
      "taxi_realtime",
    );

    expect(pickup.map((item) => item.id)).toEqual(["service", "pickup-deny"]);
    expect(dropoff.map((item) => item.id)).toEqual(["service", "dropoff-deny"]);
  });
});
