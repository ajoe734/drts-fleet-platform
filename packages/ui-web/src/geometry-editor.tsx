"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { CanvasIcon, type CanvasIconName } from "./canvas-primitives";
import {
  buildCanvasTheme,
  type CanvasTheme,
} from "./canvas-primitives";
import {
  buildGeometryEditorSnapshot,
  cloneGeometryDraft,
  createEmptyGeometryDraft,
  distanceMeters,
  hasGeometry,
  parseGeometryDraftGeoJson,
  resolveBounds,
} from "./geometry-editor-core";
import type {
  GeoPoint,
  GeometryBounds,
  GeometryDraft,
  GeometryDraftKind,
  GeometryEditorSnapshot,
} from "./geometry-editor-core";

export {
  buildGeometryEditorSnapshot,
  createEmptyGeometryDraft,
  geometryDraftToGeoJson,
  parseGeometryDraftGeoJson,
  resolveBounds,
  validateGeometryDraft,
} from "./geometry-editor-core";
export type {
  GeoPoint,
  GeometryBounds,
  GeometryCircleDraft,
  GeometryDraft,
  GeometryDraftKind,
  GeometryEditorBackendPayloads,
  GeometryEditorSnapshot,
  GeometryPolygonDraft,
  GeometryReviewDiff,
  GeometryRouteCorridorDraft,
  GeometryValidationResult,
} from "./geometry-editor-core";

export interface GeometryEditorLabels {
  polygon: string;
  circle: string;
  routeCorridor: string;
  undo: string;
  discard: string;
  import: string;
  export: string;
  applyImport: string;
  preview: string;
  validation: string;
  backendReady: string;
  invalid: string;
  valid: string;
  importPlaceholder: string;
  geoJsonLabel: string;
  mapEmpty: string;
  editVertex: string;
  editCircle: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  removeVertex: string;
  addHintPolygon: string;
  addHintCircle: string;
  addHintRoute: string;
  reviewDiff: string;
}

const DEFAULT_LABELS: GeometryEditorLabels = {
  polygon: "Polygon",
  circle: "Circle",
  routeCorridor: "Route corridor",
  undo: "Undo",
  discard: "Discard",
  import: "Import",
  export: "Export",
  applyImport: "Apply import",
  preview: "Preview",
  validation: "Validation",
  backendReady: "Backend-ready payload",
  invalid: "Invalid geometry",
  valid: "Ready",
  importPlaceholder:
    "Paste GeoJSON Feature / FeatureCollection / Geometry here.",
  geoJsonLabel: "GeoJSON",
  mapEmpty: "Click the map to start drawing geometry.",
  editVertex: "Vertex editor",
  editCircle: "Circle editor",
  latitude: "Latitude",
  longitude: "Longitude",
  radiusMeters: "Radius (m)",
  removeVertex: "Remove vertex",
  addHintPolygon: "Click map to add polygon vertices.",
  addHintCircle: "First click sets center, second click sets radius.",
  addHintRoute: "Click map to add route points. Radius defines the corridor.",
  reviewDiff: "Review diff",
};

const DEFAULT_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 380;
const STAGE_PADDING = 28;

interface ProjectedPoint {
  x: number;
  y: number;
}

interface ProjectedGeometry {
  bounds: GeometryBounds;
  polygonPoints: string | null;
  polylinePoints: string | null;
  routeStrokeWidth: number;
  vertices: ProjectedPoint[];
  circleCenter: ProjectedPoint | null;
  circleRadiusPx: number;
  circleRadiusLine: ProjectedPoint | null;
}

export interface GeometryPreviewItem {
  id: string;
  draft: GeometryDraft;
  tone?: "accent" | "muted";
}

export interface GeometryPreviewSurfaceProps {
  theme?: CanvasTheme;
  items: GeometryPreviewItem[];
  caption?: ReactNode;
  emptyLabel?: string;
  bounds?: GeometryBounds;
  height?: number;
}

export function GeometryPreviewSurface({
  theme: themeProp,
  items,
  caption,
  emptyLabel = DEFAULT_LABELS.mapEmpty,
  bounds,
  height = STAGE_HEIGHT,
}: GeometryPreviewSurfaceProps) {
  const theme = themeProp ?? DEFAULT_THEME;
  const resolvedBounds = bounds ?? resolveBounds(items.map((item) => item.draft));
  const hasVisibleGeometry = items.some((item) => hasGeometry(item.draft));

  return (
    <div
      style={{
        height,
        background: `linear-gradient(135deg, ${theme.accentBg}, ${theme.surfaceLo})`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {hasVisibleGeometry ? (
        <svg
          viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          {items.map((item) => renderPreviewItem(theme, item, resolvedBounds))}
        </svg>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.textMuted,
            fontSize: 12.5,
          }}
        >
          {emptyLabel}
        </div>
      )}
      {caption ? (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            fontSize: 10.5,
            color: theme.textMuted,
            background: theme.surface,
            padding: "4px 9px",
            borderRadius: 6,
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}

export interface GeometryEditorProps {
  theme?: CanvasTheme;
  initialDraft?: GeometryDraft;
  baselineDraft?: GeometryDraft | null;
  bounds?: GeometryBounds;
  onChange?: (snapshot: GeometryEditorSnapshot) => void;
  labels?: Partial<GeometryEditorLabels>;
}

export function GeometryEditor({
  theme: themeProp,
  initialDraft = createEmptyGeometryDraft("polygon"),
  baselineDraft = null,
  bounds,
  onChange,
  labels: labelsProp,
}: GeometryEditorProps) {
  const theme = themeProp ?? DEFAULT_THEME;
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const [history, setHistory] = useState<GeometryDraft[]>([cloneGeometryDraft(initialDraft)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setHistory([cloneGeometryDraft(initialDraft)]);
    setHistoryIndex(0);
    setSelectedVertexIndex(null);
  }, [initialDraft]);

  const draft = history[historyIndex] ?? initialDraft;
  const snapshot = useMemo(
    () => buildGeometryEditorSnapshot(draft, baselineDraft),
    [draft, baselineDraft],
  );

  useEffect(() => {
    onChange?.(snapshot);
  }, [onChange, snapshot]);

  const resolvedBounds = useMemo(
    () => bounds ?? resolveBounds([draft, ...(baselineDraft ? [baselineDraft] : [])]),
    [bounds, draft, baselineDraft],
  );

  const projected = useMemo(
    () => projectDraft(draft, resolvedBounds),
    [draft, resolvedBounds],
  );

  function pushDraft(nextDraft: GeometryDraft) {
    setHistory((current) => {
      const head = current.slice(0, historyIndex + 1);
      return [...head, cloneGeometryDraft(nextDraft)];
    });
    setHistoryIndex((current) => current + 1);
  }

  function updateCurrent(mutator: (current: GeometryDraft) => GeometryDraft) {
    pushDraft(mutator(draft));
  }

  function handleStageClick(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT;
    const point = unprojectPoint(x, y, resolvedBounds);

    switch (draft.kind) {
      case "polygon":
        pushDraft({
          kind: "polygon",
          points: [...draft.points, point],
        });
        break;
      case "routeCorridor":
        pushDraft({
          kind: "routeCorridor",
          points: [...draft.points, point],
          radiusMeters: draft.radiusMeters,
        });
        break;
      case "circle":
        pushDraft(
          !draft.center
            ? {
                kind: "circle",
                center: point,
                radiusMeters: draft.radiusMeters,
              }
            : {
                kind: "circle",
                center: draft.center,
                radiusMeters: Math.max(
                  25,
                  Math.round(distanceMeters(draft.center, point)),
                ),
              },
        );
        break;
    }
  }

  function updateVertex(
    vertexIndex: number,
    field: "lat" | "lng",
    value: number,
  ) {
    if (!Number.isFinite(value)) {
      return;
    }
    updateCurrent((current) => {
      if (current.kind === "circle") {
        return current;
      }
      const nextPoints = current.points.map((point, index) =>
        index === vertexIndex ? { ...point, [field]: value } : point,
      );
      return current.kind === "polygon"
        ? { kind: "polygon", points: nextPoints }
        : {
            kind: "routeCorridor",
            points: nextPoints,
            radiusMeters: current.radiusMeters,
          };
    });
  }

  function removeVertex(vertexIndex: number) {
    updateCurrent((current) => {
      if (current.kind === "circle") {
        return current;
      }
      const nextPoints = current.points.filter((_, index) => index !== vertexIndex);
      setSelectedVertexIndex(null);
      return current.kind === "polygon"
        ? { kind: "polygon", points: nextPoints }
        : {
            kind: "routeCorridor",
            points: nextPoints,
            radiusMeters: current.radiusMeters,
          };
    });
  }

  function updateCircle(
    field: "lat" | "lng" | "radiusMeters",
    value: number,
  ) {
    if (!Number.isFinite(value)) {
      return;
    }
    updateCurrent((current) => {
      if (current.kind !== "circle") {
        return current;
      }
      if (field === "radiusMeters") {
        return { ...current, radiusMeters: value };
      }
      const center = current.center ?? { lat: 25.033, lng: 121.5654 };
      return { ...current, center: { ...center, [field]: value } };
    });
  }

  function switchKind(kind: GeometryDraftKind) {
    if (draft.kind === kind) {
      return;
    }
    pushDraft(createEmptyGeometryDraft(kind));
    setSelectedVertexIndex(null);
  }

  function applyImport() {
    try {
      const imported = parseGeometryDraftGeoJson(importValue);
      setImportError(null);
      pushDraft(imported);
      setSelectedVertexIndex(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  }

  const selectedVertex =
    draft.kind === "circle" || selectedVertexIndex === null
      ? null
      : draft.points[selectedVertexIndex] ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start" }}>
      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          background: theme.surface,
          overflow: "hidden",
          boxShadow: theme.shadowSm,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 14px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.surfaceLo,
            flexWrap: "wrap",
          }}
        >
          {([
            ["polygon", labels.polygon, "integrationGov"],
            ["circle", labels.circle, "pin"],
            ["routeCorridor", labels.routeCorridor, "dispatch"],
          ] as const).map(([kind, label, icon]) => {
            const active = draft.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => switchKind(kind)}
                style={toolButtonStyle(theme, active)}
              >
                <CanvasIcon name={icon} size={13} />
                {label}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setHistoryIndex((current) => Math.max(0, current - 1))}
            disabled={historyIndex === 0}
            style={toolButtonStyle(theme, false, historyIndex === 0)}
          >
            <CanvasIcon name="arrow" size={13} style={{ transform: "rotate(180deg)" }} />
            {labels.undo}
          </button>
          <button
            type="button"
            onClick={() => {
              setHistory([cloneGeometryDraft(initialDraft)]);
              setHistoryIndex(0);
              setSelectedVertexIndex(null);
            }}
            style={toolButtonStyle(theme, false)}
          >
            <CanvasIcon name="x" size={13} />
            {labels.discard}
          </button>
        </div>
        <div
          style={{
            height: STAGE_HEIGHT,
            background: `linear-gradient(135deg, ${theme.accentBg}, ${theme.surfaceLo})`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <svg
            viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "crosshair" }}
            onClick={handleStageClick}
          >
            <rect
              x={STAGE_PADDING}
              y={STAGE_PADDING}
              width={STAGE_WIDTH - STAGE_PADDING * 2}
              height={STAGE_HEIGHT - STAGE_PADDING * 2}
              fill="none"
              stroke={theme.border}
              strokeDasharray="4 6"
            />
            {baselineDraft && hasGeometry(baselineDraft) ? (
              <g opacity={0.45}>{renderEditorDraft(theme, projectDraft(baselineDraft, resolvedBounds), "muted")}</g>
            ) : null}
            {renderEditorDraft(theme, projected, "accent")}
            {draft.kind !== "circle"
              ? projected.vertices.map((point, index) => {
                  const selected = selectedVertexIndex === index;
                  return (
                    <rect
                      key={`vertex-${index}`}
                      x={point.x - 5}
                      y={point.y - 5}
                      width={10}
                      height={10}
                      fill={selected ? theme.accent : theme.surface}
                      stroke={theme.accent}
                      strokeWidth={2}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedVertexIndex(index);
                      }}
                    />
                  );
                })
              : null}
            {draft.kind === "circle" && projected.circleCenter ? (
              <circle
                cx={projected.circleCenter.x}
                cy={projected.circleCenter.y}
                r={6}
                fill={theme.accent}
                stroke={theme.surface}
                strokeWidth={2}
              />
            ) : null}
          </svg>
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              fontSize: 10.5,
              color: theme.textMuted,
              background: theme.surface,
              padding: "4px 9px",
              borderRadius: 6,
            }}
          >
            {draft.kind === "polygon"
              ? labels.addHintPolygon
              : draft.kind === "circle"
                ? labels.addHintCircle
                : labels.addHintRoute}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <InfoCard theme={theme} title={labels.validation}>
          <StatusRow
            theme={theme}
            tone={snapshot.canSubmit ? "success" : "danger"}
            icon={snapshot.canSubmit ? "check" : "warn"}
            label={snapshot.canSubmit ? labels.valid : labels.invalid}
          />
          {snapshot.validation.errors.length > 0 ? (
            <ul style={listStyle(theme)}>
              {snapshot.validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {snapshot.validation.warnings.length > 0 ? (
            <ul style={listStyle(theme)}>
              {snapshot.validation.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </InfoCard>

        <InfoCard
          theme={theme}
          title={draft.kind === "circle" ? labels.editCircle : labels.editVertex}
        >
          {draft.kind === "circle" ? (
            <div style={fieldStackStyle}>
              <NumberField
                theme={theme}
                label={labels.latitude}
                value={draft.center?.lat ?? 25.033}
                onChange={(value) => updateCircle("lat", value)}
              />
              <NumberField
                theme={theme}
                label={labels.longitude}
                value={draft.center?.lng ?? 121.5654}
                onChange={(value) => updateCircle("lng", value)}
              />
              <NumberField
                theme={theme}
                label={labels.radiusMeters}
                value={draft.radiusMeters}
                onChange={(value) => updateCircle("radiusMeters", value)}
              />
            </div>
          ) : selectedVertex ? (
            <div style={fieldStackStyle}>
              <NumberField
                theme={theme}
                label={labels.latitude}
                value={selectedVertex.lat}
                onChange={(value) => updateVertex(selectedVertexIndex!, "lat", value)}
              />
              <NumberField
                theme={theme}
                label={labels.longitude}
                value={selectedVertex.lng}
                onChange={(value) => updateVertex(selectedVertexIndex!, "lng", value)}
              />
              <button
                type="button"
                onClick={() => removeVertex(selectedVertexIndex!)}
                style={inlineActionStyle(theme)}
              >
                <CanvasIcon name="x" size={13} />
                {labels.removeVertex}
              </button>
            </div>
          ) : (
            <div style={mutedCopyStyle(theme)}>Select a handle on the map.</div>
          )}
        </InfoCard>

        <InfoCard theme={theme} title={labels.backendReady}>
          <pre style={codeBlockStyle(theme)}>
            {JSON.stringify(snapshot.backendPayloads, null, 2)}
          </pre>
        </InfoCard>

        <InfoCard theme={theme} title={labels.reviewDiff}>
          <ul style={listStyle(theme)}>
            {snapshot.review.summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard theme={theme} title={labels.geoJsonLabel}>
          <div style={fieldStackStyle}>
            <textarea
              value={snapshot.geoJson}
              readOnly
              style={textAreaStyle(theme)}
            />
            <textarea
              value={importValue}
              onChange={(event) => setImportValue(event.target.value)}
              placeholder={labels.importPlaceholder}
              style={textAreaStyle(theme)}
            />
            {importError ? (
              <div style={{ color: theme.danger, fontSize: 12 }}>{importError}</div>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setImportValue(snapshot.geoJson)} style={inlineActionStyle(theme)}>
                <CanvasIcon name="copy" size={13} />
                {labels.export}
              </button>
              <button type="button" onClick={applyImport} style={inlineActionStyle(theme)}>
                <CanvasIcon name="arrow" size={13} />
                {labels.applyImport}
              </button>
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  );
}

function renderPreviewItem(
  theme: CanvasTheme,
  item: GeometryPreviewItem,
  bounds: GeometryBounds,
) {
  const projected = projectDraft(item.draft, bounds);
  return (
    <g key={item.id}>
      {renderEditorDraft(theme, projected, item.tone ?? "accent")}
      {item.draft.kind !== "circle"
        ? projected.vertices.map((point, index) => (
            <rect
              key={`${item.id}-vertex-${index}`}
              x={point.x - 4}
              y={point.y - 4}
              width={8}
              height={8}
              fill={item.tone === "muted" ? theme.surfaceLo : theme.surface}
              stroke={item.tone === "muted" ? theme.textMuted : theme.accent}
              strokeWidth={2}
            />
          ))
        : null}
      {item.draft.kind === "circle" && projected.circleCenter ? (
        <circle
          cx={projected.circleCenter.x}
          cy={projected.circleCenter.y}
          r={6}
          fill={item.tone === "muted" ? theme.textMuted : theme.accent}
          stroke={theme.surface}
          strokeWidth={2}
        />
      ) : null}
    </g>
  );
}

function renderEditorDraft(
  theme: CanvasTheme,
  projected: ProjectedGeometry,
  tone: "accent" | "muted",
) {
  const stroke = tone === "muted" ? theme.textMuted : theme.accent;
  const fill = tone === "muted" ? `${theme.textMuted}22` : `${theme.accent}22`;
  const routeStroke = tone === "muted" ? theme.textDim : theme.accentHi;

  return (
    <g>
      {projected.polygonPoints ? (
        <polygon
          points={projected.polygonPoints}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      ) : null}
      {projected.circleCenter && projected.circleRadiusPx > 0 ? (
        <>
          <circle
            cx={projected.circleCenter.x}
            cy={projected.circleCenter.y}
            r={projected.circleRadiusPx}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          {projected.circleRadiusLine ? (
            <line
              x1={projected.circleCenter.x}
              y1={projected.circleCenter.y}
              x2={projected.circleRadiusLine.x}
              y2={projected.circleRadiusLine.y}
              stroke={stroke}
              strokeWidth={1.5}
            />
          ) : null}
        </>
      ) : null}
      {projected.polylinePoints ? (
        <>
          <polyline
            points={projected.polylinePoints}
            fill="none"
            stroke={`${routeStroke}26`}
            strokeWidth={projected.routeStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={projected.polylinePoints}
            fill="none"
            stroke={routeStroke}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
    </g>
  );
}

function projectDraft(draft: GeometryDraft, bounds: GeometryBounds): ProjectedGeometry {
  switch (draft.kind) {
    case "polygon": {
      const vertices = draft.points.map((point) => projectPoint(point, bounds));
      return {
        bounds,
        polygonPoints:
          vertices.length > 0
            ? vertices.map((point) => `${round(point.x)},${round(point.y)}`).join(" ")
            : null,
        polylinePoints: null,
        routeStrokeWidth: 0,
        vertices,
        circleCenter: null,
        circleRadiusPx: 0,
        circleRadiusLine: null,
      };
    }
    case "circle": {
      const center = draft.center ? projectPoint(draft.center, bounds) : null;
      const pxRadius = center ? metersToPx(draft.radiusMeters, bounds) : 0;
      return {
        bounds,
        polygonPoints: null,
        polylinePoints: null,
        routeStrokeWidth: 0,
        vertices: [],
        circleCenter: center,
        circleRadiusPx: pxRadius,
        circleRadiusLine: center ? { x: center.x + pxRadius, y: center.y } : null,
      };
    }
    case "routeCorridor": {
      const vertices = draft.points.map((point) => projectPoint(point, bounds));
      return {
        bounds,
        polygonPoints: null,
        polylinePoints:
          vertices.length > 0
            ? vertices.map((point) => `${round(point.x)},${round(point.y)}`).join(" ")
            : null,
        routeStrokeWidth: Math.max(12, metersToPx(draft.radiusMeters, bounds) * 2),
        vertices,
        circleCenter: null,
        circleRadiusPx: 0,
        circleRadiusLine: null,
      };
    }
  }
}

function projectPoint(point: GeoPoint, bounds: GeometryBounds): ProjectedPoint {
  const usableWidth = STAGE_WIDTH - STAGE_PADDING * 2;
  const usableHeight = STAGE_HEIGHT - STAGE_PADDING * 2;
  const lngSpan = Math.max(1e-6, bounds.maxLng - bounds.minLng);
  const latSpan = Math.max(1e-6, bounds.maxLat - bounds.minLat);

  return {
    x: STAGE_PADDING + ((point.lng - bounds.minLng) / lngSpan) * usableWidth,
    y: STAGE_PADDING + ((bounds.maxLat - point.lat) / latSpan) * usableHeight,
  };
}

function unprojectPoint(x: number, y: number, bounds: GeometryBounds): GeoPoint {
  const usableWidth = STAGE_WIDTH - STAGE_PADDING * 2;
  const usableHeight = STAGE_HEIGHT - STAGE_PADDING * 2;
  const lngSpan = bounds.maxLng - bounds.minLng;
  const latSpan = bounds.maxLat - bounds.minLat;
  const lng = bounds.minLng + ((x - STAGE_PADDING) / usableWidth) * lngSpan;
  const lat = bounds.maxLat - ((y - STAGE_PADDING) / usableHeight) * latSpan;
  return {
    lat: round(lat, 6),
    lng: round(lng, 6),
  };
}

function metersToPx(meters: number, bounds: GeometryBounds): number {
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const metersPerLngDegree =
    111_320 * Math.max(0.1, Math.cos((centerLat * Math.PI) / 180));
  const lngSpan = Math.max(1e-6, bounds.maxLng - bounds.minLng);
  const usableWidth = STAGE_WIDTH - STAGE_PADDING * 2;
  return (meters / (lngSpan * metersPerLngDegree)) * usableWidth;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toolButtonStyle(
  theme: CanvasTheme,
  active: boolean,
  disabled = false,
): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 11px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accentBg : theme.surface,
    color: disabled ? theme.textDim : active ? theme.accent : theme.textMuted,
    opacity: disabled ? 0.6 : 1,
  };
}

function InfoCard({
  theme,
  title,
  children,
}: {
  theme: CanvasTheme;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        background: theme.surface,
        boxShadow: theme.shadowSm,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{title}</div>
      {children}
    </div>
  );
}

function StatusRow({
  theme,
  tone,
  icon,
  label,
}: {
  theme: CanvasTheme;
  tone: "success" | "danger";
  icon: CanvasIconName;
  label: string;
}) {
  const color = tone === "success" ? theme.success : theme.danger;
  const background = tone === "success" ? theme.successBg : theme.dangerBg;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 10,
        background,
        color,
        border: `1px solid ${tone === "success" ? theme.successBorder : theme.dangerBorder}`,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <CanvasIcon name={icon} size={13} />
      {label}
    </div>
  );
}

function NumberField({
  theme,
  label,
  value,
  onChange,
}: {
  theme: CanvasTheme;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          padding: "8px 10px",
          background: theme.surfaceLo,
          color: theme.text,
          fontSize: 12.5,
        }}
      />
    </label>
  );
}

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

function listStyle(theme: CanvasTheme): CSSProperties {
  return {
    margin: 0,
    paddingLeft: 18,
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 1.5,
  };
}

function inlineActionStyle(theme: CanvasTheme): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: "8px 10px",
    background: theme.surface,
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function codeBlockStyle(theme: CanvasTheme): CSSProperties {
  return {
    margin: 0,
    padding: 12,
    borderRadius: 12,
    background: theme.surfaceLo,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    fontSize: 11,
    lineHeight: 1.5,
    overflowX: "auto",
  };
}

function textAreaStyle(theme: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    minHeight: 132,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    padding: 10,
    background: theme.surfaceLo,
    color: theme.text,
    fontSize: 11.5,
    lineHeight: 1.5,
    resize: "vertical",
    fontFamily: theme.monoFamily,
  };
}

function mutedCopyStyle(theme: CanvasTheme): CSSProperties {
  return {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 1.5,
  };
}
