import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GeometryEditor,
  GeometryPreviewSurface,
  buildCanvasTheme,
  geometryDraftToGeoJson,
  parseGeometryDraftGeoJson,
  type GeometryDraft,
} from "../../src";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

describe("GeometryEditor component", () => {
  it("renders a degraded preview state when no geometry exists", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GeometryPreviewSurface, {
        theme,
        items: [],
        emptyLabel: "Map unavailable",
      }),
    );

    expect(markup).toContain("Map unavailable");
  });

  it("renders create/export state for polygon drafts", () => {
    const draft: GeometryDraft = {
      kind: "polygon",
      points: [
        { lat: 25.033, lng: 121.5654 },
        { lat: 25.041, lng: 121.5784 },
        { lat: 25.026, lng: 121.5862 },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(GeometryEditor, {
        theme,
        initialDraft: draft,
      }),
    );

    expect(markup).toContain("Backend-ready payload");
    expect(markup).toContain("Created polygon geometry.");
    expect(markup).toContain("&quot;type&quot;: &quot;Polygon&quot;");
    expect(markup).toContain("&quot;coordinates&quot;");
    expect(markup).toContain("Ready");
  });

  it("renders edit diff state for baseline comparisons", () => {
    const baseline: GeometryDraft = {
      kind: "circle",
      center: { lat: 25.033, lng: 121.5654 },
      radiusMeters: 200,
    };
    const edited: GeometryDraft = {
      kind: "circle",
      center: { lat: 25.04, lng: 121.57 },
      radiusMeters: 260,
    };

    const markup = renderToStaticMarkup(
      React.createElement(GeometryEditor, {
        theme,
        initialDraft: edited,
        baselineDraft: baseline,
      }),
    );

    expect(markup).toContain("Changed geometry from circle to circle.");
    expect(markup).toContain("Circle radius 260 m.");
    expect(markup).toContain("value=\"25.04\"");
    expect(markup).toContain("value=\"121.57\"");
    expect(markup).toContain("value=\"260\"");
  });

  it("renders imported route corridor state from GeoJSON", () => {
    const imported = parseGeometryDraftGeoJson(
      geometryDraftToGeoJson({
        kind: "routeCorridor",
        points: [
          { lat: 25.041, lng: 121.551 },
          { lat: 25.048, lng: 121.566 },
        ],
        radiusMeters: 150,
      }),
    );

    const markup = renderToStaticMarkup(
      React.createElement(GeometryEditor, {
        theme,
        initialDraft: imported,
      }),
    );

    expect(markup).toContain("Route corridor");
    expect(markup).toContain("2 route points.");
    expect(markup).toContain("Corridor radius 150 m.");
    expect(markup).toContain("&quot;geometryEditorKind&quot;: &quot;routeCorridor&quot;");
  });
});
