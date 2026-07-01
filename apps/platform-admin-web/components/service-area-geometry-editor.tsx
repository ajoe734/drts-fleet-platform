"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { GeoPoint, ServiceAreaGeometry } from "@drts/contracts";
import { CanvasBtn, CanvasPill, type CanvasTheme } from "@drts/ui-web";
import {
  buildGeometryPreviewSummary,
  geometryToGeoJsonExport,
  parseGeometryImport,
  validateServiceAreaGeometry,
} from "../lib/service-area-governance";

type GeometryEditorProps = {
  theme: CanvasTheme;
  value: ServiceAreaGeometry;
  onChange: (value: ServiceAreaGeometry) => void;
  disabled?: boolean;
  recordLabel: string;
  testId?: string;
};

const editorGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 0.8fr)",
  gap: 12,
};

export function ServiceAreaGeometryEditor({
  theme,
  value,
  onChange,
  disabled = false,
  recordLabel,
  testId = "service-area-geometry-editor",
}: GeometryEditorProps) {
  const [importText, setImportText] = useState("");
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const validationErrors = useMemo(
    () => validateServiceAreaGeometry(value),
    [value],
  );
  const exportText = useMemo(
    () => JSON.stringify(geometryToGeoJsonExport(value, recordLabel), null, 2),
    [recordLabel, value],
  );
  const previewLines = useMemo(
    () => buildGeometryPreviewSummary(value),
    [value],
  );

  const inputStyle = buildInputStyle(theme);
  const labelStyle = buildLabelStyle(theme);
  const helpStyle = buildHelpStyle(theme);

  function applyImport() {
    try {
      const nextGeometry = parseGeometryImport(importText);
      onChange(nextGeometry);
      setImportNotice(
        "Import applied to editor draft. Save geometry before publish.",
      );
    } catch (error: unknown) {
      setImportNotice(error instanceof Error ? error.message : String(error));
    }
  }

  function changeType(type: ServiceAreaGeometry["type"]) {
    if (type === value.type) {
      return;
    }
    onChange(convertGeometryType(value, type));
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      data-testid={testId}
      data-geometry-type={value.type}
      data-validation-state={validationErrors.length ? "invalid" : "valid"}
      data-validation-errors={validationErrors.join(" | ")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <label style={{ ...fieldStyle, flex: "1 1 180px" }}>
          <span style={labelStyle}>Geometry type</span>
          <select
            style={inputStyle}
            value={value.type}
            disabled={disabled}
            onChange={(event) =>
              changeType(event.target.value as ServiceAreaGeometry["type"])
            }
            data-testid={`${testId}-type`}
          >
            <option value="polygon">Polygon</option>
            <option value="circle">Circle</option>
          </select>
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            paddingBottom: 3,
          }}
        >
          <CanvasPill
            theme={theme}
            tone={validationErrors.length ? "danger" : "success"}
            dot
          >
            {validationErrors.length ? "invalid" : "valid"}
          </CanvasPill>
        </div>
      </div>

      <div style={editorGridStyle}>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {value.type === "polygon" ? (
            <PolygonEditor
              theme={theme}
              value={value.coordinates}
              onChange={(coordinates) =>
                onChange({ type: "polygon", coordinates })
              }
              disabled={disabled}
              testId={testId}
            />
          ) : (
            <CircleEditor
              theme={theme}
              value={value}
              onChange={onChange}
              disabled={disabled}
              testId={testId}
            />
          )}

          <div
            style={{
              ...helpStyle,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
            data-testid={`${testId}-preview-summary`}
          >
            {previewLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>

          {validationErrors.length ? (
            <div
              style={{
                border: `1px solid ${theme.danger}`,
                borderRadius: 10,
                color: theme.danger,
                fontSize: 12,
                padding: 10,
              }}
              data-testid={`${testId}-validation`}
            >
              {validationErrors.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </div>
          ) : null}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>GeoJSON / geometry import</span>
            <textarea
              style={{
                ...inputStyle,
                minHeight: 122,
                fontFamily: theme.monoFamily,
              }}
              value={importText}
              disabled={disabled}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportNotice(null);
              }}
              placeholder="Paste a ServiceArea geometry, GeoJSON Feature, or FeatureCollection."
              spellCheck={false}
              data-testid={`${testId}-import`}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CanvasBtn theme={theme} disabled={disabled} onClick={applyImport}>
              Apply import
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setImportText(exportText);
                setImportNotice(
                  "Current editor geometry copied to import box.",
                );
              }}
            >
              Use current export
            </CanvasBtn>
          </div>
          {importNotice ? (
            <div style={helpStyle} data-testid={`${testId}-import-state`}>
              {importNotice}
            </div>
          ) : null}
          <label style={fieldStyle}>
            <span style={labelStyle}>Editor GeoJSON export</span>
            <textarea
              style={{
                ...inputStyle,
                minHeight: 122,
                fontFamily: theme.monoFamily,
              }}
              value={exportText}
              readOnly
              spellCheck={false}
              data-testid={`${testId}-export`}
            />
          </label>
        </section>
      </div>
    </div>
  );
}

function PolygonEditor({
  theme,
  value,
  onChange,
  disabled,
  testId,
}: {
  theme: CanvasTheme;
  value: GeoPoint[];
  onChange: (points: GeoPoint[]) => void;
  disabled: boolean;
  testId: string;
}) {
  const inputStyle = buildInputStyle(theme);
  const labelStyle = buildLabelStyle(theme);

  function updatePoint(index: number, key: keyof GeoPoint, nextValue: string) {
    const nextPoints = value.map((point, pointIndex) =>
      pointIndex === index ? { ...point, [key]: Number(nextValue) } : point,
    );
    onChange(nextPoints);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={labelStyle}>Polygon coordinates</div>
      {value.map((point, index) => (
        <div
          key={`${index}-${point.lat}-${point.lng}`}
          style={{
            display: "grid",
            gridTemplateColumns: "28px minmax(0, 1fr) minmax(0, 1fr) auto",
            gap: 6,
            alignItems: "center",
          }}
          data-testid={`${testId}-polygon-point-${index}`}
        >
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            {index + 1}
          </span>
          <input
            style={inputStyle}
            type="number"
            step="0.000001"
            value={Number.isFinite(point.lat) ? point.lat : ""}
            disabled={disabled}
            aria-label={`Vertex ${index + 1} latitude`}
            onChange={(event) => updatePoint(index, "lat", event.target.value)}
            data-testid={`${testId}-polygon-lat-${index}`}
          />
          <input
            style={inputStyle}
            type="number"
            step="0.000001"
            value={Number.isFinite(point.lng) ? point.lng : ""}
            disabled={disabled}
            aria-label={`Vertex ${index + 1} longitude`}
            onChange={(event) => updatePoint(index, "lng", event.target.value)}
            data-testid={`${testId}-polygon-lng-${index}`}
          />
          <CanvasBtn
            theme={theme}
            size="xs"
            danger
            disabled={disabled || value.length <= 3}
            onClick={() =>
              onChange(value.filter((_, pointIndex) => pointIndex !== index))
            }
          >
            Remove
          </CanvasBtn>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <CanvasBtn
          theme={theme}
          disabled={disabled}
          onClick={() => {
            const anchor = value[value.length - 1] ?? {
              lat: 25.04,
              lng: 121.5,
            };
            onChange([
              ...value,
              {
                lat: roundCoordinate(anchor.lat + 0.001),
                lng: roundCoordinate(anchor.lng + 0.001),
              },
            ]);
          }}
        >
          Add vertex
        </CanvasBtn>
        <CanvasBtn
          theme={theme}
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange(buildSamplePolygon())}
        >
          Reset sample polygon
        </CanvasBtn>
      </div>
    </div>
  );
}

function CircleEditor({
  theme,
  value,
  onChange,
  disabled,
  testId,
}: {
  theme: CanvasTheme;
  value: Extract<ServiceAreaGeometry, { type: "circle" }>;
  onChange: (geometry: ServiceAreaGeometry) => void;
  disabled: boolean;
  testId: string;
}) {
  const inputStyle = buildInputStyle(theme);
  const labelStyle = buildLabelStyle(theme);

  function updateCenter(key: keyof GeoPoint, nextValue: string) {
    onChange({
      ...value,
      center: { ...value.center, [key]: Number(nextValue) },
    });
  }

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
    >
      <label style={fieldStyle}>
        <span style={labelStyle}>Center latitude</span>
        <input
          style={inputStyle}
          type="number"
          step="0.000001"
          value={Number.isFinite(value.center.lat) ? value.center.lat : ""}
          disabled={disabled}
          onChange={(event) => updateCenter("lat", event.target.value)}
          data-testid={`${testId}-circle-lat`}
        />
      </label>
      <label style={fieldStyle}>
        <span style={labelStyle}>Center longitude</span>
        <input
          style={inputStyle}
          type="number"
          step="0.000001"
          value={Number.isFinite(value.center.lng) ? value.center.lng : ""}
          disabled={disabled}
          onChange={(event) => updateCenter("lng", event.target.value)}
          data-testid={`${testId}-circle-lng`}
        />
      </label>
      <label style={fieldStyle}>
        <span style={labelStyle}>Radius meters</span>
        <input
          style={inputStyle}
          type="number"
          step="1"
          value={Number.isFinite(value.radiusMeters) ? value.radiusMeters : ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, radiusMeters: Number(event.target.value) })
          }
          data-testid={`${testId}-circle-radius`}
        />
      </label>
    </div>
  );
}

function convertGeometryType(
  geometry: ServiceAreaGeometry,
  type: ServiceAreaGeometry["type"],
): ServiceAreaGeometry {
  if (type === "circle") {
    const center =
      geometry.type === "circle"
        ? geometry.center
        : centroid(geometry.coordinates);
    return { type: "circle", center, radiusMeters: 250 };
  }

  const center =
    geometry.type === "circle"
      ? geometry.center
      : centroid(geometry.coordinates);
  return {
    type: "polygon",
    coordinates: [
      {
        lat: roundCoordinate(center.lat - 0.002),
        lng: roundCoordinate(center.lng - 0.002),
      },
      {
        lat: roundCoordinate(center.lat - 0.002),
        lng: roundCoordinate(center.lng + 0.002),
      },
      {
        lat: roundCoordinate(center.lat + 0.002),
        lng: roundCoordinate(center.lng + 0.002),
      },
      {
        lat: roundCoordinate(center.lat + 0.002),
        lng: roundCoordinate(center.lng - 0.002),
      },
    ],
  };
}

function centroid(points: GeoPoint[]) {
  const count = points.length || 1;
  return {
    lat: roundCoordinate(
      points.reduce((sum, point) => sum + point.lat, 0) / count,
    ),
    lng: roundCoordinate(
      points.reduce((sum, point) => sum + point.lng, 0) / count,
    ),
  };
}

function buildSamplePolygon(): GeoPoint[] {
  return [
    { lat: 25.047, lng: 121.515 },
    { lat: 25.047, lng: 121.519 },
    { lat: 25.05, lng: 121.519 },
    { lat: 25.05, lng: 121.515 },
  ];
}

function buildInputStyle(theme: CanvasTheme): CSSProperties {
  return {
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    color: theme.text,
    fontFamily: theme.fontFamily,
    fontSize: 12.5,
    padding: "8px 10px",
    width: "100%",
  };
}

function buildLabelStyle(theme: CanvasTheme): CSSProperties {
  return {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  };
}

function buildHelpStyle(theme: CanvasTheme): CSSProperties {
  return {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 1.45,
  };
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(6));
}

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};
