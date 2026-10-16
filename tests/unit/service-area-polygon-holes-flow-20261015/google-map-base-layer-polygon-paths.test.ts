import { describe, expect, it } from "vitest";
import type { ServiceAreaGeoJsonFeature } from "@drts/contracts";

import {
  buildFeaturePolygonPaths,
  polygonStyle,
} from "../../../apps/ops-console-web/components/google-map-base-layer";

/**
 * `buildFeaturePolygonPaths` and `polygonStyle` are the exact ring-grouping
 * and style-mapping logic `GoogleMapBaseLayer`'s real `useEffect` calls
 * before constructing each `google.maps.Polygon` (one instance per feature,
 * paths = [outerRing, ...holeRings] rather than one Polygon per ring), kept
 * here as pure-function regression coverage for that math. The effect
 * itself — mounting the real component, mocking only `@googlemaps/js-api-loader`
 * and the global `google.maps.*` constructors — is exercised in
 * `apps/ops-console-web/tests/unit/google-map-base-layer.test.ts`: that
 * package resolves `@googlemaps/js-api-loader` directly (it is one of its
 * own dependencies), while this directory (run with cwd = repo root) cannot
 * resolve that bare specifier, since it is not a root dependency.
 */
describe("GoogleMapBaseLayer polygon ring grouping (HCD-R3)", () => {
  const donutFeature: ServiceAreaGeoJsonFeature = {
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
      serviceAreaId: "khh-donut-core-id",
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
  };

  const solidFeature: ServiceAreaGeoJsonFeature = {
    ...donutFeature,
    id: "taipei-core",
    geometry: {
      type: "Polygon",
      coordinates: [donutFeature.geometry.coordinates[0]!],
    },
    properties: {
      ...donutFeature.properties,
      areaCode: "TAIPEI_CORE",
    } as ServiceAreaGeoJsonFeature["properties"],
  };

  it("groups all rings of a hole-bearing feature into one path list (one Polygon per feature, not per ring)", () => {
    const paths = buildFeaturePolygonPaths(donutFeature);

    expect(paths).toHaveLength(2);
    expect(paths[0]).toEqual([
      { lat: 22.58, lng: 120.25 },
      { lat: 22.58, lng: 120.35 },
      { lat: 22.68, lng: 120.35 },
      { lat: 22.68, lng: 120.25 },
      { lat: 22.58, lng: 120.25 },
    ]);
    expect(paths[1]).toEqual([
      { lat: 22.65, lng: 120.28 },
      { lat: 22.61, lng: 120.28 },
      { lat: 22.61, lng: 120.32 },
      { lat: 22.65, lng: 120.32 },
      { lat: 22.65, lng: 120.28 },
    ]);
  });

  it("leaves a single-ring feature as a single path", () => {
    const paths = buildFeaturePolygonPaths(solidFeature);
    expect(paths).toHaveLength(1);
  });

  it("drops degenerate rings with fewer than 3 valid points", () => {
    const degenerate: ServiceAreaGeoJsonFeature = {
      ...solidFeature,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [120.25, 22.58],
            [120.35, Number.NaN],
          ],
        ],
      },
    };
    expect(buildFeaturePolygonPaths(degenerate)).toEqual([]);
  });

  it("preserves existing polygonStyle color/weight mapping for service areas and stop-policy effects", () => {
    expect(polygonStyle(donutFeature)).toMatchObject({
      fillColor: "#0ea5e9",
      strokeColor: "#38bdf8",
    });

    const denyPolicy: ServiceAreaGeoJsonFeature = {
      ...donutFeature,
      properties: {
        recordKind: "stop_policy",
        stopPolicyId: "policy-1",
        policyCode: "KHH_CURB_DONUT_POLICY",
        displayName: "Kaohsiung curb donut restriction",
        status: "active",
        direction: "pickup",
        effect: "deny",
        sourceGeometry: donutFeature.properties.sourceGeometry,
        serviceAreaCodes: ["KHH_DONUT_CORE"],
        serviceProductTypes: ["taxi_realtime"],
        reasonCode: "KHH_CURB_RESTRICTED",
        reasonMessage: "Curb pickup is restricted in this donut zone.",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        version: 1,
        geometryVersionRef: "stop_policy:KHH_CURB_DONUT_POLICY@1",
      },
    };
    expect(polygonStyle(denyPolicy)).toMatchObject({
      fillColor: "#ef4444",
      strokeColor: "#f87171",
    });
  });
});
