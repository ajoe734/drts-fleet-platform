/**
 * Pure derivation helpers for the Platform Admin Sandbox Governance pages
 * (P2-UI-ADM-001). The control-plane returns versioned governance records;
 * the UI renders the *effective* view, so these helpers pick the current
 * version, derive display status, evaluate provider-capability gating, and
 * project approved PostGIS geometry into an SVG viewport.
 *
 * Source of truth: docs/05-ui/drts-design-canvas/platform-sandbox.jsx +
 * packages/contracts/src/phase2-tesla-fsd-sandbox.ts (P2-GOV-001/002).
 */

import type {
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
  GeoJsonMultiLineString,
  GeoJsonMultiPolygon,
  GeoJsonPosition,
  Phase2ProviderCapability,
  ProviderCapabilityDescriptor,
  ProviderCapabilityRequirement,
  SandboxAuthorizationStatus,
  SandboxExperimentProgramRecord,
  SandboxExperimentProgramVersionRecord,
} from "@drts/contracts";

/**
 * The version the operator is governing right now: the explicitly-current
 * version when set, otherwise the newest published version, otherwise the
 * highest version number. Returns null for an empty/never-versioned program.
 */
export function currentExperimentVersion(
  program: SandboxExperimentProgramRecord,
): SandboxExperimentProgramVersionRecord | null {
  const versions = program.versions ?? [];
  if (versions.length === 0) {
    return null;
  }
  if (program.currentVersionId) {
    const matched = versions.find(
      (version) => version.versionId === program.currentVersionId,
    );
    if (matched) {
      return matched;
    }
  }
  const published = versions
    .filter((version) => version.lifecycleStatus === "published")
    .sort((a, b) => b.versionNo - a.versionNo);
  if (published.length > 0) {
    return published[0] ?? null;
  }
  return (
    [...versions].sort((a, b) => b.versionNo - a.versionNo)[0] ?? null
  );
}

export type ExperimentDisplayStatus =
  | SandboxAuthorizationStatus
  | "draft"
  | "archived";

/** Display status for an experiment row (canvas FX_EXPERIMENTS.status). */
export function experimentDisplayStatus(
  program: SandboxExperimentProgramRecord,
): ExperimentDisplayStatus {
  if (program.archivedAt) {
    return "archived";
  }
  const version = currentExperimentVersion(program);
  if (!version) {
    return "draft";
  }
  if (version.lifecycleStatus === "draft") {
    return "draft";
  }
  return version.authorizationStatus;
}

/** Canvas expTone(): success / neutral / danger / warn by status. */
export function experimentStatusTone(
  status: ExperimentDisplayStatus,
): "success" | "neutral" | "danger" | "warn" {
  switch (status) {
    case "active":
      return "success";
    case "draft":
      return "neutral";
    case "suspended":
      return "danger";
    default:
      return "warn";
  }
}

/** "2026-06 ~ 2026-12" effective window from a version, "—" when undated. */
export function effectiveWindow(
  version: SandboxExperimentProgramVersionRecord | null,
): string {
  if (!version) {
    return "—";
  }
  const from = formatMonth(version.effectiveFrom);
  const until = version.effectiveUntil
    ? formatMonth(version.effectiveUntil)
    : "—";
  if (from === "—" && until === "—") {
    return "—";
  }
  return `${from} ~ ${until}`;
}

function formatMonth(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  // ISO dates are YYYY-MM-DD…; slice the year-month without constructing a Date
  // (avoids TZ drift on date-only effective ranges).
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  return match ? `${match[1]}-${match[2]}` : iso;
}

export interface CapabilityGateRow {
  capability: Phase2ProviderCapability;
  required: boolean;
  /** True when a matching descriptor advertises the capability as available. */
  available: boolean;
  /** Effective UI state: a missing required capability fails closed → gated. */
  gated: boolean;
  minSchemaVersion: string | null;
  schemaVersion: string | null;
  notes: string | null;
}

/**
 * Evaluate a version's required capabilities against provider descriptors.
 * Fail-closed: when no descriptor advertises a required capability (or it is
 * advertised unavailable) the row is `gated`, matching the canvas
 * "capability-missing shown as gated" contract (PSB_TeslaIntegration).
 */
export function evaluateCapabilityGates(
  requirements: ProviderCapabilityRequirement[],
  descriptors: ProviderCapabilityDescriptor[] = [],
): CapabilityGateRow[] {
  return requirements.map((requirement) => {
    const descriptor = descriptors.find(
      (candidate) => candidate.capability === requirement.capability,
    );
    const available = descriptor?.available === true;
    return {
      capability: requirement.capability,
      required: requirement.required,
      available,
      gated: requirement.required && !available,
      minSchemaVersion: requirement.minSchemaVersion,
      schemaVersion: descriptor?.schemaVersion ?? null,
      notes: requirement.notes,
    };
  });
}

// ── Geometry projection (PostGIS GeoJSON → SVG viewport) ─────────────────────

export interface ProjectedGeometry {
  width: number;
  height: number;
  polygons: string[];
  polylines: string[];
  /** Endpoint markers for routes (pickup/dropoff), already projected. */
  endpoints: Array<{ x: number; y: number }>;
  /** Vertex handles for polygon rings, already projected. */
  vertices: Array<{ x: number; y: number }>;
}

interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * Project approved areas + routes into a single SVG viewport so the editor can
 * draw the real approved geometry (acceptance: "area/route editor draws
 * geometry"). Longitude → x, latitude → y (flipped so north is up).
 */
export function projectSandboxGeometry(
  areas: ApprovedOperatingAreaRecord[],
  routes: ApprovedRouteRecord[],
  options: { width?: number; height?: number; padding?: number } = {},
): ProjectedGeometry | null {
  const width = options.width ?? 640;
  const height = options.height ?? 380;
  const padding = options.padding ?? 28;

  const bounds = computeBounds(areas, routes);
  if (!bounds) {
    return null;
  }

  const lonSpan = bounds.maxLon - bounds.minLon || 1e-6;
  const latSpan = bounds.maxLat - bounds.minLat || 1e-6;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  // Preserve aspect ratio so geometry is not visually skewed.
  const scale = Math.min(innerW / lonSpan, innerH / latSpan);
  const offsetX = padding + (innerW - lonSpan * scale) / 2;
  const offsetY = padding + (innerH - latSpan * scale) / 2;

  const project = (position: GeoJsonPosition): { x: number; y: number } => {
    const [lon, lat] = position;
    return {
      x: offsetX + (lon - bounds.minLon) * scale,
      y: offsetY + (bounds.maxLat - lat) * scale,
    };
  };

  const polygons: string[] = [];
  const vertices: Array<{ x: number; y: number }> = [];
  for (const area of areas) {
    for (const polygon of area.geometry.coordinates) {
      const ring = polygon[0];
      if (!ring || ring.length === 0) {
        continue;
      }
      const points = ring.map(project);
      polygons.push(
        points.map((point) => `${round(point.x)},${round(point.y)}`).join(" "),
      );
      for (const point of points.slice(0, -1)) {
        vertices.push(point);
      }
    }
  }

  const polylines: string[] = [];
  const endpoints: Array<{ x: number; y: number }> = [];
  for (const route of routes) {
    for (const line of route.geometry.coordinates) {
      if (!line || line.length === 0) {
        continue;
      }
      const points = line.map(project);
      polylines.push(
        points.map((point) => `${round(point.x)},${round(point.y)}`).join(" "),
      );
      const first = points[0];
      const last = points[points.length - 1];
      if (first) {
        endpoints.push(first);
      }
      if (last && last !== first) {
        endpoints.push(last);
      }
    }
  }

  return { width, height, polygons, polylines, endpoints, vertices };
}

function computeBounds(
  areas: ApprovedOperatingAreaRecord[],
  routes: ApprovedRouteRecord[],
): Bounds | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let seen = false;

  const extend = (position: GeoJsonPosition) => {
    const [lon, lat] = position;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return;
    }
    seen = true;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  };

  for (const area of areas) {
    forEachPolygonPosition(area.geometry, extend);
  }
  for (const route of routes) {
    forEachLinePosition(route.geometry, extend);
  }

  return seen ? { minLon, minLat, maxLon, maxLat } : null;
}

function forEachPolygonPosition(
  geometry: GeoJsonMultiPolygon,
  visit: (position: GeoJsonPosition) => void,
) {
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (const position of ring) {
        visit(position);
      }
    }
  }
}

function forEachLinePosition(
  geometry: GeoJsonMultiLineString,
  visit: (position: GeoJsonPosition) => void,
) {
  for (const line of geometry.coordinates) {
    for (const position of line) {
      visit(position);
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Total approved-area surface in km² (spherical-ish shoelace, display only). */
export function approximateAreaKm2(
  areas: ApprovedOperatingAreaRecord[],
): number {
  let total = 0;
  for (const area of areas) {
    for (const polygon of area.geometry.coordinates) {
      const ring = polygon[0];
      if (!ring || ring.length < 4) {
        continue;
      }
      total += ringAreaKm2(ring);
    }
  }
  return Math.round(total * 10) / 10;
}

function ringAreaKm2(ring: GeoJsonPosition[]): number {
  // Equirectangular shoelace around the ring centroid latitude. Good enough for
  // a small sandbox operating area displayed to one decimal place.
  const latRef =
    ring.reduce((sum, position) => sum + position[1], 0) / ring.length;
  const kmPerDegLat = 110.574;
  const kmPerDegLon = 111.32 * Math.cos((latRef * Math.PI) / 180);
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    if (!a || !b) {
      continue;
    }
    const ax = a[0] * kmPerDegLon;
    const ay = a[1] * kmPerDegLat;
    const bx = b[0] * kmPerDegLon;
    const by = b[1] * kmPerDegLat;
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2;
}
