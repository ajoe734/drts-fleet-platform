"use client";

import type {
  GeoPoint,
  ServiceAreaGeoJsonFeature,
  ServiceAreaGeoJsonResponse,
  ServiceProductType,
} from "@drts/contracts";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { useMemo, useState } from "react";
import { GoogleMapBaseLayer } from "@/components/google-map-base-layer";

import {
  buildOpsMapTileViewport,
  projectOpsMapPointToViewport,
  unprojectOpsMapViewportPoint,
  type OpsMapPoint,
} from "../dispatch/ops-map-board";
import {
  filterCallcenterMapFeatures,
  type CallcenterMapStopKind,
} from "./callcenter-map-overlays";

type OverlayStatus = "loading" | "ready" | "error";

export interface CallcenterInteractiveMapProps {
  id: string;
  stopKind: CallcenterMapStopKind;
  value: GeoPoint | null;
  serviceProductType: ServiceProductType;
  geoJson: ServiceAreaGeoJsonResponse | null;
  overlayStatus: OverlayStatus;
  tileUrlTemplate: string;
  labels: CallcenterInteractiveMapLabels;
  onPinSelect: (point: GeoPoint) => void;
}

export interface CallcenterInteractiveMapLabels {
  instruction: string;
  serviceArea: string;
  deny: string;
  manual: string;
  overlayError: string;
  overlayLoading: string;
  zoomOut: string;
  zoomIn: string;
}

const MAP_WIDTH = 640;
const MAP_HEIGHT = 280;
const DEFAULT_CENTER = { lat: 25.0478, lng: 121.5319 };
const DEFAULT_ZOOM = 14;

const shellStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: MAP_HEIGHT,
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid rgba(125, 211, 252, 0.42)",
  background:
    "linear-gradient(135deg, rgba(8, 47, 73, 0.88), rgba(15, 23, 42, 0.96))",
  cursor: "crosshair",
  isolation: "isolate",
};

const tileStyle: CSSProperties = {
  position: "absolute",
  width: 256,
  height: 256,
  maxWidth: "none",
  pointerEvents: "none",
  userSelect: "none",
};

function featureCode(feature: ServiceAreaGeoJsonFeature) {
  return feature.properties.recordKind === "service_area"
    ? feature.properties.areaCode
    : feature.properties.policyCode;
}

function featureVisual(feature: ServiceAreaGeoJsonFeature) {
  if (feature.properties.recordKind === "service_area") {
    return {
      fill: "rgba(14, 165, 233, 0.13)",
      stroke: "#38bdf8",
      strokeWidth: 1.5,
    };
  }
  if (feature.properties.effect === "deny") {
    return {
      fill: "rgba(239, 68, 68, 0.34)",
      stroke: "#f87171",
      strokeWidth: 2.5,
    };
  }
  if (feature.properties.effect === "manual_review") {
    return {
      fill: "rgba(245, 158, 11, 0.3)",
      stroke: "#fbbf24",
      strokeWidth: 2.5,
    };
  }
  return {
    fill: "rgba(34, 197, 94, 0.2)",
    stroke: "#4ade80",
    strokeWidth: 2,
  };
}

function featureLabel(feature: ServiceAreaGeoJsonFeature) {
  const properties = feature.properties;
  return properties.recordKind === "service_area"
    ? `${properties.areaCode}: ${properties.displayName}`
    : `${properties.policyCode}: ${properties.reasonMessage}`;
}

export function CallcenterInteractiveMap({
  id,
  stopKind,
  value,
  serviceProductType,
  geoJson,
  overlayStatus,
  tileUrlTemplate,
  labels,
  onPinSelect,
}: CallcenterInteractiveMapProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const center = value ?? DEFAULT_CENTER;
  const features = useMemo(
    () => filterCallcenterMapFeatures(geoJson, stopKind, serviceProductType),
    [geoJson, serviceProductType, stopKind],
  );
  const viewport = buildOpsMapTileViewport({
    bounds: {
      minLat: center.lat - 0.01,
      maxLat: center.lat + 0.01,
      minLng: center.lng - 0.01,
      maxLng: center.lng + 0.01,
      latSpan: 0.02,
      lngSpan: 0.02,
    },
    centerLat: center.lat,
    centerLng: center.lng,
    zoom,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileUrlTemplate,
  });
  const serviceAreaCodes = features
    .filter((feature) => feature.properties.recordKind === "service_area")
    .map(featureCode);
  const policyCodes = features
    .filter((feature) => feature.properties.recordKind === "stop_policy")
    .map(featureCode);
  const pinPosition = value
    ? projectOpsMapPointToViewport(
        {
          key: `${id}:pin`,
          kind: stopKind,
          label: stopKind,
          lat: value.lat,
          lng: value.lng,
        } satisfies OpsMapPoint,
        viewport,
      )
    : null;

  function selectPoint(leftPx: number, topPx: number) {
    const point = unprojectOpsMapViewportPoint({ leftPx, topPx }, viewport);
    onPinSelect({
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6)),
    });
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("[data-google-map-base-layer]")
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    selectPoint(
      ((event.clientX - bounds.left) / bounds.width) * MAP_WIDTH,
      ((event.clientY - bounds.top) / bounds.height) * MAP_HEIGHT,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPoint(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    }
  }

  const overlayPolygons = features.flatMap((feature) =>
    feature.geometry.coordinates.map((ring, ringIndex) => {
      const visual = featureVisual(feature);
      const points = ring
        .map((coordinate) => {
          const lng = coordinate[0];
          const lat = coordinate[1];
          if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
          ) {
            return null;
          }
          const projected = projectOpsMapPointToViewport(
            {
              key: `${feature.id}:${ringIndex}`,
              kind: stopKind,
              label: featureCode(feature),
              lat,
              lng,
            },
            viewport,
          );
          return `${(projected.leftPct / 100) * MAP_WIDTH},${
            (projected.topPct / 100) * MAP_HEIGHT
          }`;
        })
        .filter(Boolean)
        .join(" ");

      return (
        <polygon
          key={`${feature.id}:${ringIndex}`}
          aria-label={featureLabel(feature)}
          data-map-feature-code={featureCode(feature)}
          data-map-feature-kind={feature.properties.recordKind}
          fill={visual.fill}
          points={points}
          stroke={visual.stroke}
          strokeWidth={visual.strokeWidth}
        />
      );
    }),
  );

  return (
    <div
      data-callcenter-interactive-map={id}
      data-map-overlay-count={features.length}
      data-map-overlay-status={overlayStatus}
      data-map-policy-codes={policyCodes.join("|")}
      data-map-render-mode={
        viewport.tiles.length > 0 ? "tile" : "vector_fallback"
      }
      data-map-service-area-codes={serviceAreaCodes.join("|")}
      data-map-stop-kind={stopKind}
      data-map-zoom={zoom}
      data-selected-lat={value ? value.lat.toFixed(6) : ""}
      data-selected-lng={value ? value.lng.toFixed(6) : ""}
      style={{ display: "grid", gap: 8 }}
    >
      <div
        aria-label={`${stopKind} ${labels.instruction}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="application"
        style={shellStyle}
        tabIndex={0}
      >
        {viewport.tiles.length > 0 ? (
          viewport.tiles.map((tile) => (
            <img
              key={tile.key}
              alt=""
              aria-hidden="true"
              src={tile.src}
              style={{ ...tileStyle, left: tile.leftPx, top: tile.topPx }}
            />
          ))
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.45,
              backgroundImage:
                "linear-gradient(rgba(125,211,252,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.2) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        )}

        <GoogleMapBaseLayer
          ariaLabel={`${stopKind} Google map`}
          center={center}
          features={features}
          interactive
          onPointSelect={onPinSelect}
          selectedPoint={value}
          zoom={zoom}
        />

        <svg
          aria-label={`${labels.serviceArea} overlays`}
          data-callcenter-map-overlays
          height="100%"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
          }}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          width="100%"
        >
          {overlayPolygons}
        </svg>

        {pinPosition?.visible ? (
          <span
            aria-label={`${stopKind} pin`}
            data-callcenter-map-pin={stopKind}
            style={{
              position: "absolute",
              left: `${pinPosition.leftPct}%`,
              top: `${pinPosition.topPct}%`,
              width: 22,
              height: 22,
              borderRadius: "50% 50% 50% 0",
              border: "3px solid white",
              background: stopKind === "pickup" ? "#22c55e" : "#38bdf8",
              boxShadow: "0 4px 14px rgba(0,0,0,.45)",
              transform: "translate(-50%, -100%) rotate(-45deg)",
              pointerEvents: "none",
              zIndex: 4,
            }}
          />
        ) : null}

        <span
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            zIndex: 5,
            padding: "5px 8px",
            borderRadius: 999,
            color: "#e2e8f0",
            background: "rgba(15,23,42,.88)",
            fontSize: 11,
            pointerEvents: "none",
          }}
        >
          {overlayStatus === "loading"
            ? labels.overlayLoading
            : overlayStatus === "error"
              ? labels.overlayError
              : labels.instruction}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          color: "#cbd5e1",
          fontSize: 11,
        }}
      >
        <span>
          <b style={{ color: "#38bdf8" }}>□</b> {labels.serviceArea} ·{" "}
          <b style={{ color: "#f87171" }}>■</b> {labels.deny} ·{" "}
          <b style={{ color: "#fbbf24" }}>■</b> {labels.manual}
        </span>
        <span style={{ display: "inline-flex", gap: 6 }}>
          <button
            aria-label={labels.zoomOut}
            disabled={zoom <= 3}
            onClick={() => setZoom((current) => Math.max(3, current - 1))}
            style={{ minWidth: 28 }}
            type="button"
          >
            -
          </button>
          <button
            aria-label={labels.zoomIn}
            disabled={zoom >= 18}
            onClick={() => setZoom((current) => Math.min(18, current + 1))}
            style={{ minWidth: 28 }}
            type="button"
          >
            +
          </button>
        </span>
      </div>
    </div>
  );
}
