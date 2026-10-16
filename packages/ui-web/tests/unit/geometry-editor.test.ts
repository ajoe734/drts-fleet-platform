// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  GeometryEditor,
  GeometryPreviewSurface,
  buildCanvasTheme,
  buildGeometryEditorSnapshot,
  createEmptyGeometryDraft,
  geometryDraftToGeoJson,
  parseGeometryDraftGeoJson,
  validateGeometryDraft,
  type GeometryDraft,
  type GeometryEditorSnapshot,
} from "../../src/index";

afterEach(() => {
  cleanup();
});

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 380;

function stubStageRect(container: HTMLElement) {
  const svg = container.querySelector(
    `svg[viewBox="0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}"]`,
  );
  if (!svg) {
    throw new Error("GeometryEditor stage <svg> not found.");
  }
  svg.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: STAGE_WIDTH,
      bottom: STAGE_HEIGHT,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return svg;
}

function getVertexHandle(container: HTMLElement, index: number): Element {
  const handle = container.querySelector(`rect[data-vertex-index="${index}"]`);
  if (!handle) {
    throw new Error(`Vertex handle ${index} not found.`);
  }
  return handle;
}

function getNumberFieldInput(container: HTMLElement, labelText: string): HTMLInputElement {
  const labels = Array.from(container.querySelectorAll("label"));
  for (const label of labels) {
    if (label.textContent?.startsWith(labelText)) {
      const input = label.querySelector("input");
      if (input) {
        return input as HTMLInputElement;
      }
    }
  }
  throw new Error(`Number field not found for label: ${labelText}`);
}

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

  describe("mounted <GeometryEditor> (real DOM events, holes)", () => {
    const EDITOR_BOUNDS = {
      minLat: 24.9,
      maxLat: 25.2,
      minLng: 121.4,
      maxLng: 121.7,
    };

    function findButton(container: HTMLElement, text: string): HTMLButtonElement {
      const button = Array.from(container.querySelectorAll("button")).find((el) =>
        el.textContent?.includes(text),
      );
      if (!button) {
        throw new Error(`Button not found: ${text}`);
      }
      return button as HTMLButtonElement;
    }

    function mountEditor(initialDraft: GeometryDraft) {
      const snapshots: GeometryEditorSnapshot[] = [];
      const { container } = render(
        createElement(GeometryEditor, {
          initialDraft,
          bounds: EDITOR_BOUNDS,
          onChange: (snapshot: GeometryEditorSnapshot) => snapshots.push(snapshot),
        }),
      );
      return { container, snapshots, latest: () => snapshots[snapshots.length - 1]! };
    }

    it("adds an outer vertex through a real stage click and keeps the hole intact", () => {
      const { container, latest } = mountEditor({
        kind: "polygon",
        points: DONUT_OUTER,
        holes: [DONUT_HOLE],
      });

      const svg = stubStageRect(container);
      fireEvent.click(svg, { clientX: 600, clientY: 40 });

      const draft = latest().draft;
      expect(draft.kind).toBe("polygon");
      if (draft.kind !== "polygon") {
        throw new Error("expected polygon draft");
      }
      expect(draft.points).toHaveLength(DONUT_OUTER.length + 1);
      expect(draft.points[draft.points.length - 1]).toEqual({
        lat: 25.188889,
        lng: 121.693836,
      });
      expect(draft.holes).toEqual([DONUT_HOLE]);
    });

    it("edits an outer vertex through the real Latitude field, keeping the hole intact and the polygon valid", () => {
      const { container, latest } = mountEditor({
        kind: "polygon",
        points: DONUT_OUTER,
        holes: [DONUT_HOLE],
      });

      fireEvent.click(getVertexHandle(container, 0));
      const latitudeInput = getNumberFieldInput(container, "Latitude");
      fireEvent.change(latitudeInput, { target: { value: "24.9" } });

      const snapshot = latest();
      const draft = snapshot.draft;
      expect(draft.kind).toBe("polygon");
      if (draft.kind !== "polygon") {
        throw new Error("expected polygon draft");
      }
      expect(draft.points[0]).toEqual({ lat: 24.9, lng: 121.5 });
      expect(draft.holes).toEqual([DONUT_HOLE]);
      expect(snapshot.canSubmit).toBe(true);
    });

    it("removes an outer vertex through the real Remove vertex button, keeping the hole intact", () => {
      const pentagonOuter = [
        DONUT_OUTER[0]!,
        DONUT_OUTER[1]!,
        DONUT_OUTER[2]!,
        { lat: 25.1, lng: 121.55 },
        DONUT_OUTER[3]!,
      ];
      const { container, latest } = mountEditor({
        kind: "polygon",
        points: pentagonOuter,
        holes: [DONUT_HOLE],
      });

      fireEvent.click(getVertexHandle(container, 3));
      fireEvent.click(findButton(container, "Remove vertex"));

      const snapshot = latest();
      const draft = snapshot.draft;
      expect(draft.kind).toBe("polygon");
      if (draft.kind !== "polygon") {
        throw new Error("expected polygon draft");
      }
      expect(draft.points).toEqual(DONUT_OUTER);
      expect(draft.holes).toEqual([DONUT_HOLE]);
      expect(snapshot.canSubmit).toBe(true);
    });

    it("leaves the hole intact but marks the draft invalid once a real edit shrinks the outer boundary across it", () => {
      const { container, latest } = mountEditor({
        kind: "polygon",
        points: DONUT_OUTER,
        holes: [DONUT_HOLE],
      });

      fireEvent.click(getVertexHandle(container, 2));
      const latitudeInput = getNumberFieldInput(container, "Latitude");
      fireEvent.change(latitudeInput, { target: { value: "25.04" } });

      const snapshot = latest();
      expect(snapshot.canSubmit).toBe(false);
      expect(snapshot.validation.errors.length).toBeGreaterThan(0);
      const draft = snapshot.draft;
      expect(draft.kind).toBe("polygon");
      if (draft.kind !== "polygon") {
        throw new Error("expected polygon draft");
      }
      expect(draft.holes).toEqual([DONUT_HOLE]);
      expect(snapshot.backendPayloads.serviceAreaGeometry).toMatchObject({
        holes: [DONUT_HOLE],
      });
    });

    it("Undo restores the exact prior hole-bearing draft, and Discard resets to the initial hole-bearing draft", () => {
      const initialDraft: GeometryDraft = {
        kind: "polygon",
        points: DONUT_OUTER,
        holes: [DONUT_HOLE],
      };
      const { container, latest } = mountEditor(initialDraft);

      fireEvent.click(getVertexHandle(container, 0));
      const latitudeInput = getNumberFieldInput(container, "Latitude");
      fireEvent.change(latitudeInput, { target: { value: "24.9" } });
      expect(
        latest().draft.kind === "polygon" && latest().draft.points[0]!.lat,
      ).toBe(24.9);

      fireEvent.click(findButton(container, "Undo"));
      expect(latest().draft).toEqual(initialDraft);

      fireEvent.click(getVertexHandle(container, 0));
      fireEvent.change(getNumberFieldInput(container, "Latitude"), {
        target: { value: "24.8" },
      });
      expect(
        latest().draft.kind === "polygon" && latest().draft.points[0]!.lat,
      ).toBe(24.8);

      fireEvent.click(findButton(container, "Discard"));
      expect(latest().draft).toEqual(initialDraft);
    });

    it("Apply import of a hole-bearing GeoJSON Polygon through the real import textarea renders a true evenodd cutout path", () => {
      const { container, latest } = mountEditor(createEmptyGeometryDraft("polygon"));

      const textareas = container.querySelectorAll("textarea");
      const importTextarea = textareas[1]!;
      const donutGeoJson = JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [121.5, 25.0],
            [121.6, 25.0],
            [121.6, 25.1],
            [121.5, 25.1],
            [121.5, 25.0],
          ],
          [
            [121.53, 25.03],
            [121.57, 25.03],
            [121.57, 25.07],
            [121.53, 25.07],
            [121.53, 25.03],
          ],
        ],
      });
      fireEvent.change(importTextarea, { target: { value: donutGeoJson } });
      fireEvent.click(findButton(container, "Apply import"));

      const snapshot = latest();
      expect(snapshot.canSubmit).toBe(true);
      const draft = snapshot.draft;
      expect(draft.kind).toBe("polygon");
      if (draft.kind !== "polygon") {
        throw new Error("expected polygon draft");
      }
      expect(draft.holes).toHaveLength(1);
      expect(draft.holes![0]).toHaveLength(4);

      const cutoutPath = container.querySelector(
        'path[data-geometry-polygon-cutout="true"]',
      );
      expect(cutoutPath).not.toBeNull();
      expect(cutoutPath!.getAttribute("fill-rule")).toBe("evenodd");
    });

    it("Export then Apply import round-trips the current hole-bearing draft losslessly through the real GeoJSON textareas", () => {
      const initialDraft: GeometryDraft = {
        kind: "polygon",
        points: DONUT_OUTER,
        holes: [DONUT_HOLE],
      };
      const { container, latest } = mountEditor(initialDraft);

      fireEvent.click(findButton(container, "Export"));
      const textareas = container.querySelectorAll("textarea");
      const readOnlyGeoJsonTextarea = textareas[0]!;
      const importTextarea = textareas[1]!;
      expect(importTextarea.value).toBe(readOnlyGeoJsonTextarea.value);

      fireEvent.click(findButton(container, "Apply import"));

      const snapshot = latest();
      // The outer ring was already CCW, so it round-trips byte-identical.
      // DONUT_HOLE is authored CCW; export canonicalizes every hole ring to
      // CW, so re-import yields the same 4 vertices starting at the same
      // point but walked in the opposite (canonical) direction.
      expect(snapshot.draft).toEqual({
        kind: "polygon",
        points: DONUT_OUTER,
        holes: [[DONUT_HOLE[0], DONUT_HOLE[3], DONUT_HOLE[2], DONUT_HOLE[1]]],
      });
      expect(snapshot.canSubmit).toBe(true);
    });
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
