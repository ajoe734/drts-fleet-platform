import { describe, expect, it } from "vitest";
import {
  buildGeometryEditorSnapshot,
  createEmptyGeometryDraft,
  geometryDraftToGeoJson,
  parseGeometryDraftGeoJson,
  validateGeometryDraft,
  type GeometryDraft,
} from "../../packages/ui-web/src/geometry-editor-core";

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
    expect(snapshot.backendPayloads.sandboxAreaGeometry).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [[
          [121.5654, 25.033],
          [121.578, 25.041],
          [121.584, 25.024],
          [121.5654, 25.033],
        ]],
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
    expect(snapshot.validation.errors).toContain("Polygon cannot self-intersect.");
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
  it("creates empty drafts for editor mode switches", () => {
    expect(createEmptyGeometryDraft("polygon")).toEqual({
      kind: "polygon",
      points: [],
    });
    expect(createEmptyGeometryDraft("circle")).toEqual({
      kind: "circle",
      center: null,
      radiusMeters: 250,
    });
    expect(createEmptyGeometryDraft("routeCorridor")).toEqual({
      kind: "routeCorridor",
      points: [],
      radiusMeters: 250,
    });
  });
});
