import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GeometryPreviewSurface,
  buildCanvasTheme,
  buildGeometryEditorSnapshot,
  createEmptyGeometryDraft,
  geometryDraftToGeoJson,
  parseGeometryDraftGeoJson,
  validateGeometryDraft,
  type GeometryDraft,
} from "../../src/index";

/** Planar shoelace signed area over a closed `[lng, lat][]` GeoJSON ring. */
function signedShoelaceArea(ring: [number, number][]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [lngA, latA] = ring[index]!;
    const [lngB, latB] = ring[index + 1]!;
    area += lngA * latB - lngB * latA;
  }
  return area / 2;
}

const DONUT_OUTER = [
  { lat: 25.0, lng: 121.5 },
  { lat: 25.0, lng: 121.6 },
  { lat: 25.1, lng: 121.6 },
  { lat: 25.1, lng: 121.5 },
];
const DONUT_HOLE = [
  { lat: 25.03, lng: 121.53 },
  { lat: 25.03, lng: 121.57 },
  { lat: 25.07, lng: 121.57 },
  { lat: 25.07, lng: 121.53 },
];
const DONUT_HOLE_2 = [
  { lat: 25.08, lng: 121.51 },
  { lat: 25.08, lng: 121.52 },
  { lat: 25.09, lng: 121.52 },
  { lat: 25.09, lng: 121.51 },
];

describe("ui-web geometry editor", () => {
  it("creates backend-ready polygon payloads", () => {
    const draft: GeometryDraft = {
      kind: "polygon",
      points: [
        { lat: 25.033, lng: 121.5654 },
        { lat: 25.041, lng: 121.578 },
        { lat: 25.024, lng: 121.584 },
      ],
    };

    const snapshot = buildGeometryEditorSnapshot(draft);

    expect(snapshot.canSubmit).toBe(true);
    expect(snapshot.backendPayloads.serviceAreaGeometry).toEqual({
      type: "polygon",
      coordinates: draft.points,
    });
    // Input triangle is clockwise in [lng, lat]; exported GeoJSON reorients
    // the exterior ring to RFC 7946 counterclockwise while the canonical
    // `serviceAreaGeometry.coordinates` above retains the caller's order.
    expect(signedShoelaceArea(snapshot.backendPayloads.sandboxAreaGeometry!.coordinates[0]![0]!)).toBeGreaterThan(0);
    expect(snapshot.backendPayloads.sandboxAreaGeometry).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [121.5654, 25.033],
            [121.584, 25.024],
            [121.578, 25.041],
            [121.5654, 25.033],
          ],
        ],
      ],
    });
  });

  it("blocks invalid geometry from submit-ready state", () => {
    const invalid = validateGeometryDraft({
      kind: "routeCorridor",
      points: [{ lat: 25.033, lng: 121.5654 }],
      radiusMeters: 0,
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual([
      "Route corridor requires at least 2 points.",
      "Route corridor radius must be greater than 0.",
    ]);
  });

  it("rejects out-of-range coordinates from submit-ready state", () => {
    const snapshot = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: [
        { lat: 25.033, lng: 121.5654 },
        { lat: 95, lng: 121.578 },
        { lat: 25.024, lng: 121.584 },
      ],
    });

    expect(snapshot.canSubmit).toBe(false);
    expect(snapshot.validation.errors).toContain(
      "Polygon vertex 2 latitude must be between -90 and 90.",
    );
  });

  it("rejects self-intersecting polygons from submit-ready state", () => {
    const snapshot = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: [
        { lat: 25.03, lng: 121.56 },
        { lat: 25.05, lng: 121.58 },
        { lat: 25.03, lng: 121.58 },
        { lat: 25.05, lng: 121.56 },
      ],
    });

    expect(snapshot.canSubmit).toBe(false);
    expect(snapshot.validation.errors).toContain(
      "Polygon cannot self-intersect.",
    );
  });

  it("round-trips GeoJSON import/export for route corridors", () => {
    const draft: GeometryDraft = {
      kind: "routeCorridor",
      points: [
        { lat: 25.033, lng: 121.5654 },
        { lat: 25.039, lng: 121.5771 },
      ],
      radiusMeters: 180,
    };

    const parsed = parseGeometryDraftGeoJson(geometryDraftToGeoJson(draft));

    expect(parsed).toEqual(draft);
  });

  it("rejects GeoJSON imports with invalid coordinates", () => {
    expect(() =>
      parseGeometryDraftGeoJson(
        JSON.stringify({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [121.5654, 25.033],
                [121.578, 91],
                [121.584, 25.024],
                [121.5654, 25.033],
              ],
            ],
          },
          properties: { geometryEditorKind: "polygon" },
        }),
      ),
    ).toThrowError("GeoJSON latitude must be between -90 and 90.");
  });

  it("exposes review diff hooks for edited geometry", () => {
    const baseline: GeometryDraft = {
      kind: "circle",
      center: { lat: 25.033, lng: 121.5654 },
      radiusMeters: 200,
    };
    const edited: GeometryDraft = {
      kind: "circle",
      center: { lat: 25.033, lng: 121.5654 },
      radiusMeters: 260,
    };

    const snapshot = buildGeometryEditorSnapshot(edited, baseline);

    expect(snapshot.review.changed).toBe(true);
    expect(snapshot.review.summary).toContain("Circle radius 260 m.");
    expect(snapshot.review.beforeGeoJson).not.toBeNull();
  });

  it("renders degraded preview state when there is no geometry", () => {
    const markup = renderToStaticMarkup(
      createElement(GeometryPreviewSurface, {
        theme: buildCanvasTheme({ surface: "platform", density: "compact" }),
        items: [{ id: "empty", draft: createEmptyGeometryDraft("polygon") }],
        emptyLabel: "No geometry loaded",
      }),
    );

    expect(markup).toContain("No geometry loaded");
  });

  it("accepts a polygon with a strictly interior hole and preserves it through backend payloads", () => {
    const draft: GeometryDraft = {
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [DONUT_HOLE],
    };

    const snapshot = buildGeometryEditorSnapshot(draft);

    expect(snapshot.canSubmit).toBe(true);
    expect(snapshot.validation.errors).toEqual([]);
    expect(snapshot.backendPayloads.serviceAreaGeometry).toEqual({
      type: "polygon",
      coordinates: DONUT_OUTER,
      holes: [DONUT_HOLE],
    });
    const sandbox = snapshot.backendPayloads.sandboxAreaGeometry!;
    expect(sandbox.coordinates[0]).toHaveLength(2);
    expect(signedShoelaceArea(sandbox.coordinates[0]![0]!)).toBeGreaterThan(0);
    expect(signedShoelaceArea(sandbox.coordinates[0]![1]!)).toBeLessThan(0);
    expect(snapshot.review.summary).toContain("1 polygon hole.");
  });

  it("reports hole counts with correct pluralization in the review summary", () => {
    const snapshot = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [DONUT_HOLE, DONUT_HOLE_2],
    });

    expect(snapshot.canSubmit).toBe(true);
    expect(snapshot.review.summary).toContain("2 polygon holes.");
  });

  it("omits holes from the canonical payload when absent or empty", () => {
    const withoutHoles = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: DONUT_OUTER,
    });
    const withEmptyHoles = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [],
    });

    expect(withoutHoles.backendPayloads.serviceAreaGeometry).toEqual({
      type: "polygon",
      coordinates: DONUT_OUTER,
    });
    expect(withEmptyHoles.backendPayloads.serviceAreaGeometry).toEqual({
      type: "polygon",
      coordinates: DONUT_OUTER,
    });
    expect(
      "holes" in (withoutHoles.backendPayloads.serviceAreaGeometry as object),
    ).toBe(false);
  });

  it("rejects a hole that crosses the outer boundary", () => {
    const snapshot = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [
        [
          { lat: 25.05, lng: 121.45 },
          { lat: 25.05, lng: 121.55 },
          { lat: 25.09, lng: 121.55 },
          { lat: 25.09, lng: 121.45 },
        ],
      ],
    });

    expect(snapshot.canSubmit).toBe(false);
    expect(snapshot.validation.errors).toContain(
      "Polygon hole must lie strictly inside the outer boundary.",
    );
  });

  it("rejects two holes that overlap, touch, or nest each other", () => {
    const overlapping = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [
        DONUT_HOLE,
        [
          { lat: 25.04, lng: 121.54 },
          { lat: 25.04, lng: 121.58 },
          { lat: 25.06, lng: 121.58 },
          { lat: 25.06, lng: 121.54 },
        ],
      ],
    });

    expect(overlapping.canSubmit).toBe(false);
    expect(overlapping.validation.errors).toContain(
      "Polygon holes cannot intersect, touch, or nest.",
    );
  });

  it("rejects a degenerate collinear hole and a self-intersecting hole", () => {
    const collinearHole = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [
        [
          { lat: 25.05, lng: 121.53 },
          { lat: 25.05, lng: 121.55 },
          { lat: 25.05, lng: 121.57 },
        ],
      ],
    });
    expect(collinearHole.canSubmit).toBe(false);
    expect(collinearHole.validation.errors).toContain(
      "Polygon hole area must be non-zero.",
    );

    const bowtieHole = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [
        [
          { lat: 25.03, lng: 121.53 },
          { lat: 25.07, lng: 121.57 },
          { lat: 25.03, lng: 121.57 },
          { lat: 25.07, lng: 121.53 },
        ],
      ],
    });
    expect(bowtieHole.canSubmit).toBe(false);
    expect(bowtieHole.validation.errors).toContain(
      "Polygon hole cannot self-intersect.",
    );
  });

  it("round-trips a GeoJSON polygon with holes through export and re-import losslessly", () => {
    const draft: GeometryDraft = {
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [DONUT_HOLE, DONUT_HOLE_2],
    };

    const exported = geometryDraftToGeoJson(draft);
    const geoJsonObject = JSON.parse(exported) as {
      geometry: { coordinates: [number, number][][] };
    };
    expect(geoJsonObject.geometry.coordinates).toHaveLength(3);
    expect(
      signedShoelaceArea(geoJsonObject.geometry.coordinates[0]!),
    ).toBeGreaterThan(0);
    expect(
      signedShoelaceArea(geoJsonObject.geometry.coordinates[1]!),
    ).toBeLessThan(0);
    expect(
      signedShoelaceArea(geoJsonObject.geometry.coordinates[2]!),
    ).toBeLessThan(0);

    // Export always reorients to RFC 7946 (CCW outer / CW holes), so a hole
    // whose caller input happened to be CCW is reversed on first export; the
    // guaranteed invariant is that re-importing that canonical GeoJSON and
    // exporting it again is idempotent (byte-identical), not that arbitrary
    // input winding survives an export+reimport round trip unchanged.
    const reimported = parseGeometryDraftGeoJson(exported) as GeometryDraft & {
      kind: "polygon";
    };
    expect(reimported.points).toHaveLength(DONUT_OUTER.length);
    expect(reimported.holes).toHaveLength(2);
    expect(geometryDraftToGeoJson(reimported)).toBe(exported);
  });

  it("imports a GeoJSON Feature with an exterior ring and a hole ring via Apply import", () => {
    const feature = JSON.stringify({
      type: "Feature",
      properties: { geometryEditorKind: "polygon" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [121.5, 25.0],
            [121.5, 25.1],
            [121.6, 25.1],
            [121.6, 25.0],
            [121.5, 25.0],
          ],
          [
            [121.53, 25.03],
            [121.53, 25.07],
            [121.57, 25.07],
            [121.57, 25.03],
            [121.53, 25.03],
          ],
        ],
      },
    });

    const imported = parseGeometryDraftGeoJson(feature);
    expect(imported.kind).toBe("polygon");
    const snapshot = buildGeometryEditorSnapshot(imported);
    expect(snapshot.draft.kind === "polygon" && snapshot.draft.holes).toHaveLength(1);
    expect(snapshot.backendPayloads.serviceAreaGeometry).toMatchObject({
      holes: expect.arrayContaining([expect.any(Array)]),
    });
    expect(snapshot.canSubmit).toBe(true);
  });

  /**
   * `handleStageClick`, `updateVertex`, and `removeVertex` in the live
   * `<GeometryEditor>` component are closures reachable only through DOM
   * click/input events; this repo's test setup has no jsdom/testing-library
   * (checked: none configured anywhere under `apps/*` or `packages/*`), and
   * the task's write scope forbids adding a new test dependency. All three
   * handlers were verified by source inspection
   * (packages/ui-web/src/geometry-editor.tsx:505-601) to spread
   * `...(current.holes && current.holes.length > 0 ? { holes: current.holes } : {})`
   * into the next draft, i.e. holes survive outer-vertex add/edit/remove.
   * This test instead exercises the same draft-mutation shape those handlers
   * produce, directly through the exported pure snapshot builder.
   */
  it("preserves holes across outer-vertex add/edit/remove draft mutations", () => {
    const base: GeometryDraft = {
      kind: "polygon",
      points: DONUT_OUTER,
      holes: [DONUT_HOLE],
    };

    const afterAdd: GeometryDraft = {
      kind: "polygon",
      points: [...base.points, { lat: 25.05, lng: 121.605 }],
      ...(base.holes && base.holes.length > 0 ? { holes: base.holes } : {}),
    };
    expect(buildGeometryEditorSnapshot(afterAdd).draft).toMatchObject({
      holes: [DONUT_HOLE],
    });

    const afterEdit: GeometryDraft = {
      kind: "polygon",
      points: afterAdd.points.map((point, index) =>
        index === 0 ? { ...point, lat: 24.99 } : point,
      ),
      ...(afterAdd.kind === "polygon" && afterAdd.holes && afterAdd.holes.length > 0
        ? { holes: afterAdd.holes }
        : {}),
    };
    expect(buildGeometryEditorSnapshot(afterEdit).draft).toMatchObject({
      holes: [DONUT_HOLE],
    });

    const afterRemove: GeometryDraft = {
      kind: "polygon",
      points: afterEdit.points.slice(0, -1),
      ...(afterEdit.kind === "polygon" &&
      afterEdit.holes &&
      afterEdit.holes.length > 0
        ? { holes: afterEdit.holes }
        : {}),
    };
    const removedSnapshot = buildGeometryEditorSnapshot(afterRemove);
    expect(removedSnapshot.draft).toMatchObject({ holes: [DONUT_HOLE] });
    expect(removedSnapshot.canSubmit).toBe(true);
  });

  it("flags a hole as invalid once an outer-boundary edit moves the boundary across it, without dropping the hole", () => {
    const shrunkOuter = DONUT_OUTER.map((point) =>
      point.lat === 25.1 ? { ...point, lat: 25.04 } : point,
    );
    const snapshot = buildGeometryEditorSnapshot({
      kind: "polygon",
      points: shrunkOuter,
      holes: [DONUT_HOLE],
    });

    expect(snapshot.draft.kind === "polygon" && snapshot.draft.holes).toEqual([
      DONUT_HOLE,
    ]);
    expect(snapshot.canSubmit).toBe(false);
    expect(snapshot.validation.errors.length).toBeGreaterThan(0);
  });

  it("renders a polygon-with-hole as a single evenodd cutout path in GeometryPreviewSurface", () => {
    const markup = renderToStaticMarkup(
      createElement(GeometryPreviewSurface, {
        theme: buildCanvasTheme({ surface: "platform", density: "compact" }),
        items: [
          {
            id: "donut",
            draft: { kind: "polygon", points: DONUT_OUTER, holes: [DONUT_HOLE] },
          },
        ],
      }),
    );

    expect(markup).toContain('data-geometry-polygon-cutout="true"');
    expect(markup).toContain("fill-rule=\"evenodd\"");
    const cutoutTag = markup
      .match(/<path[^>]*>/g)
      ?.find((tag) => tag.includes('data-geometry-polygon-cutout="true"'));
    expect(cutoutTag).toBeDefined();
    const pathD = cutoutTag!.match(/\sd="([^"]+)"/)?.[1];
    expect(pathD).toBeDefined();
    expect(pathD!.match(/Z/g)).toHaveLength(2);
    expect(markup).not.toContain("<polygon");
  });

  it("renders a single-ring polygon without a hole as a plain filled polygon, not a cutout path", () => {
    const markup = renderToStaticMarkup(
      createElement(GeometryPreviewSurface, {
        theme: buildCanvasTheme({ surface: "platform", density: "compact" }),
        items: [{ id: "solid", draft: { kind: "polygon", points: DONUT_OUTER } }],
      }),
    );

    expect(markup).not.toContain("data-geometry-polygon-cutout");
    expect(markup).toContain("<polygon");
  });
});
