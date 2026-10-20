import type { ServiceAreaGeoJsonResponse } from "@drts/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CallcenterInteractiveMap } from "../../app/callcenter/callcenter-interactive-map";
import { filterCallcenterMapFeatures } from "../../app/callcenter/callcenter-map-overlays";

const BASE_LABELS = {
  instruction: "Tap the map to set the point.",
  serviceArea: "Service area",
  deny: "Deny",
  manual: "Manual review",
  overlayError: "Could not load the map overlay.",
  overlayLoading: "Loading map overlay…",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
};

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

  it("renders a polygon-with-hole feature as one evenodd overlay, not one filled shape per ring", () => {
    const donutGeoJson: ServiceAreaGeoJsonResponse = {
      type: "FeatureCollection",
      generatedAt: "2026-07-11T00:00:00.000Z",
      features: [
        {
          type: "Feature",
          id: "khh-donut-core",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [120.25, 22.58],
                [120.35, 22.58],
                [120.35, 22.68],
                [120.25, 22.68],
                [120.25, 22.58],
              ],
              [
                [120.28, 22.65],
                [120.28, 22.61],
                [120.32, 22.61],
                [120.32, 22.65],
                [120.28, 22.65],
              ],
            ],
          },
          properties: {
            recordKind: "service_area",
            serviceAreaId: "khh-donut-core",
            areaCode: "KHH_DONUT_CORE",
            displayName: "Kaohsiung donut operating area",
            status: "active",
            sourceGeometry: {
              type: "polygon",
              coordinates: [
                { lat: 22.58, lng: 120.25 },
                { lat: 22.58, lng: 120.35 },
                { lat: 22.68, lng: 120.35 },
                { lat: 22.68, lng: 120.25 },
              ],
              holes: [
                [
                  { lat: 22.61, lng: 120.28 },
                  { lat: 22.61, lng: 120.32 },
                  { lat: 22.65, lng: 120.32 },
                  { lat: 22.65, lng: 120.28 },
                ],
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
            effectiveFrom: "2026-06-01T00:00:00.000Z",
            effectiveUntil: null,
            version: 1,
            geometryVersionRef: "service_area:KHH_DONUT_CORE@1",
          },
        },
        feature("other-product", "stop_policy", "both", "taxi_reservation"),
      ],
    };

    const markup = renderToStaticMarkup(
      createElement(CallcenterInteractiveMap, {
        id: "map-1",
        stopKind: "pickup",
        value: { lat: 22.62, lng: 120.3 },
        serviceProductType: "taxi_realtime",
        geoJson: donutGeoJson,
        overlayStatus: "ready",
        tileUrlTemplate: "https://tiles.example/{z}/{x}/{y}.png",
        labels: BASE_LABELS,
        onPinSelect: () => {},
      }),
    );

    expect(markup).toMatch(
      /<path[^>]*data-map-feature-code="KHH_DONUT_CORE"[^>]*data-map-ring-count="2"[^>]*fill-rule="evenodd"/,
    );
    expect(markup).not.toMatch(
      /<polygon[^>]*data-map-feature-code="KHH_DONUT_CORE"/,
    );
    const donutMatches = markup.match(
      /data-map-feature-code="KHH_DONUT_CORE"/g,
    );
    expect(donutMatches).toHaveLength(1);
  });

  it("keeps single-ring features rendering as a plain polygon with ring-count 1", () => {
    const markup = renderToStaticMarkup(
      createElement(CallcenterInteractiveMap, {
        id: "map-2",
        stopKind: "pickup",
        value: { lat: 25.05, lng: 121.55 },
        serviceProductType: "taxi_realtime",
        geoJson,
        overlayStatus: "ready",
        tileUrlTemplate: "https://tiles.example/{z}/{x}/{y}.png",
        labels: BASE_LABELS,
        onPinSelect: () => {},
      }),
    );

    expect(markup).toMatch(
      /<polygon[^>]*data-map-feature-code="service"[^>]*data-map-ring-count="1"/,
    );
  });
});
