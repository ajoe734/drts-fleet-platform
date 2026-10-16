import { describe, expect, it } from "vitest";
import type { ServiceAreaGeoJsonFeature } from "@drts/contracts";

import {
  buildFeaturePolygonPaths,
  polygonStyle,
} from "../../../apps/ops-console-web/components/google-map-base-layer";

/**
 * `GoogleMapBaseLayer`'s real `useEffect` (lines ~266-297) that constructs
 * `google.maps.Polygon` instances is only reachable through React's
 * commit/effect phase, which requires a DOM (`document`, refs attaching to
 * real nodes). This repo has no jsdom/testing-library configured anywhere
 * under `apps/*` or `packages/*`, and the task's write scope forbids adding
 * a new test dependency to introduce one. `buildFeaturePolygonPaths` is the
 * exact ring-grouping logic the effect calls before constructing each
 * `google.maps.Polygon`, extracted verbatim (no behavior change) so the
 * HCD-R3 fix — one Polygon instance per feature, paths = [outerRing,
 * ...holeRings] rather than one Polygon per ring — is directly unit
 * testable without the SDK/DOM boundary. Combined with the single
 * `features.flatMap(feature => [new google.maps.Polygon({ paths: buildFeaturePolygonPaths(feature), ... })])`
 * call site (one array entry per feature, confirmed by source read), this
 * demonstrates the fix without executing the effect itself.
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
