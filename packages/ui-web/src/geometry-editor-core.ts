export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoPolygon {
  type: "polygon";
  coordinates: GeoPoint[];
}

export interface GeoCircle {
  type: "circle";
  center: GeoPoint;
  radiusMeters: number;
}

export type ServiceAreaGeometry = GeoPolygon | GeoCircle;

export interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: Array<Array<Array<[number, number]>>>;
}

export interface GeoJsonMultiLineString {
  type: "MultiLineString";
  coordinates: Array<Array<[number, number]>>;
}

export type GeometryDraftKind = "polygon" | "circle" | "routeCorridor";

export interface GeometryBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface GeometryPolygonDraft {
  kind: "polygon";
  points: GeoPoint[];
}

export interface GeometryCircleDraft {
  kind: "circle";
  center: GeoPoint | null;
  radiusMeters: number;
}

export interface GeometryRouteCorridorDraft {
  kind: "routeCorridor";
  points: GeoPoint[];
  radiusMeters: number;
}

export type GeometryDraft =
  | GeometryPolygonDraft
  | GeometryCircleDraft
  | GeometryRouteCorridorDraft;

export interface GeometryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GeometryEditorBackendPayloads {
  serviceAreaGeometry: ServiceAreaGeometry | null;
  sandboxAreaGeometry: GeoJsonMultiPolygon | null;
  sandboxRouteGeometry: GeoJsonMultiLineString | null;
  routeCorridor: { centerline: GeoPoint[]; radiusMeters: number } | null;
}

export interface GeometryReviewDiff {
  changed: boolean;
  summary: string[];
  beforeGeoJson: string | null;
  afterGeoJson: string;
}

export interface GeometryEditorSnapshot {
  draft: GeometryDraft;
  validation: GeometryValidationResult;
  backendPayloads: GeometryEditorBackendPayloads;
  geoJson: string;
  review: GeometryReviewDiff;
  canSubmit: boolean;
}

const DEFAULT_BOUNDS: GeometryBounds = {
  minLat: 24.99,
  maxLat: 25.08,
  minLng: 121.49,
  maxLng: 121.61,
};

const WORLD_BOUNDS: GeometryBounds = {
  minLat: -90,
  maxLat: 90,
  minLng: -180,
  maxLng: 180,
};

const DEFAULT_CIRCLE_RADIUS_METERS = 250;

export function createEmptyGeometryDraft(kind: GeometryDraftKind): GeometryDraft {
  switch (kind) {
    case "circle":
      return { kind: "circle", center: null, radiusMeters: DEFAULT_CIRCLE_RADIUS_METERS };
    case "routeCorridor":
      return { kind: "routeCorridor", points: [], radiusMeters: DEFAULT_CIRCLE_RADIUS_METERS };
    case "polygon":
    default:
      return { kind: "polygon", points: [] };
  }
}

export function validateGeometryDraft(
  draft: GeometryDraft,
): GeometryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (draft.kind) {
    case "polygon": {
      const unique = dedupeSequentialPoints(draft.points);
      errors.push(...validatePointCollection(unique, "Polygon vertex"));
      if (unique.length < 3) {
        errors.push("Polygon requires at least 3 vertices.");
      }
      if (unique.length >= 3 && Math.abs(signedPolygonArea(unique)) < 1e-8) {
        errors.push("Polygon area must be non-zero.");
      }
      if (unique.length >= 4 && polygonHasSelfIntersection(unique)) {
        errors.push("Polygon cannot self-intersect.");
      }
      break;
    }
    case "circle":
      if (draft.center) {
        errors.push(...validatePoint(draft.center, "Circle center"));
      }
      if (!draft.center) {
        errors.push("Circle center is required.");
      }
      if (!Number.isFinite(draft.radiusMeters) || draft.radiusMeters <= 0) {
        errors.push("Circle radius must be greater than 0.");
      }
      break;
    case "routeCorridor": {
      const unique = dedupeSequentialPoints(draft.points);
      errors.push(...validatePointCollection(unique, "Route point"));
      if (unique.length < 2) {
        errors.push("Route corridor requires at least 2 points.");
      }
      if (!Number.isFinite(draft.radiusMeters) || draft.radiusMeters <= 0) {
        errors.push("Route corridor radius must be greater than 0.");
      }
      break;
    }
  }

  if (!errors.length && draft.kind !== "circle") {
    const pointCount = draft.points.length;
    if (pointCount > 20) {
      warnings.push("High vertex count may make review harder.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function geometryDraftToGeoJson(draft: GeometryDraft): string {
  return JSON.stringify(geometryDraftToGeoJsonObject(draft), null, 2);
}

export function parseGeometryDraftGeoJson(input: string): GeometryDraft {
  const parsed = JSON.parse(input) as Record<string, unknown>;
  return geometryDraftFromGeoJsonObject(parsed);
}

export function buildGeometryEditorSnapshot(
  draft: GeometryDraft,
  baselineDraft?: GeometryDraft | null,
): GeometryEditorSnapshot {
  const validation = validateGeometryDraft(draft);
  const backendPayloads = buildBackendPayloads(draft);
  const geoJson = geometryDraftToGeoJson(draft);
  const beforeGeoJson = baselineDraft ? geometryDraftToGeoJson(baselineDraft) : null;
  const review = buildReviewDiff(draft, baselineDraft ?? null, geoJson, beforeGeoJson);

  return {
    draft,
    validation,
    backendPayloads,
    geoJson,
    review,
    canSubmit: validation.valid,
  };
}

export function resolveBounds(drafts: GeometryDraft[]): GeometryBounds {
  const points: GeoPoint[] = [];
  for (const draft of drafts) {
    switch (draft.kind) {
      case "polygon":
      case "routeCorridor":
        points.push(...draft.points);
        break;
      case "circle":
        if (draft.center) {
          const latRadius = draft.radiusMeters / 111_320;
          const lngRadius =
            draft.radiusMeters /
            (111_320 * Math.max(0.1, Math.cos((draft.center.lat * Math.PI) / 180)));
          points.push(
            { lat: draft.center.lat - latRadius, lng: draft.center.lng - lngRadius },
            { lat: draft.center.lat + latRadius, lng: draft.center.lng + lngRadius },
          );
        }
        break;
    }
  }

  if (points.length === 0) {
    return DEFAULT_BOUNDS;
  }

  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  const latPad = Math.max(0.005, (maxLat - minLat) * 0.2);
  const lngPad = Math.max(0.005, (maxLng - minLng) * 0.2);

  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

export function cloneGeometryDraft(draft: GeometryDraft): GeometryDraft {
  return JSON.parse(JSON.stringify(draft)) as GeometryDraft;
}

export function hasGeometry(draft: GeometryDraft): boolean {
  switch (draft.kind) {
    case "polygon":
      return draft.points.length > 0;
    case "circle":
      return Boolean(draft.center);
    case "routeCorridor":
      return draft.points.length > 0;
  }
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latMeters = (a.lat - b.lat) * 111_320;
  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const lngMeters = (a.lng - b.lng) * 111_320 * Math.cos(midLat);
  return Math.sqrt(latMeters ** 2 + lngMeters ** 2);
}

function buildBackendPayloads(draft: GeometryDraft): GeometryEditorBackendPayloads {
  switch (draft.kind) {
    case "polygon": {
      const points = closePolygonRing(draft.points);
      return {
        serviceAreaGeometry: {
          type: "polygon",
          coordinates: draft.points,
        } satisfies GeoPolygon,
        sandboxAreaGeometry: {
          type: "MultiPolygon",
          coordinates: [[points.map((point) => [point.lng, point.lat] as [number, number])]],
        },
        sandboxRouteGeometry: null,
        routeCorridor: null,
      };
    }
    case "circle":
      return {
        serviceAreaGeometry: draft.center
          ? ({
              type: "circle",
              center: draft.center,
              radiusMeters: draft.radiusMeters,
            } satisfies GeoCircle)
          : null,
        sandboxAreaGeometry: null,
        sandboxRouteGeometry: null,
        routeCorridor: null,
      };
    case "routeCorridor":
      return {
        serviceAreaGeometry: null,
        sandboxAreaGeometry: null,
        sandboxRouteGeometry: {
          type: "MultiLineString",
          coordinates: [draft.points.map((point) => [point.lng, point.lat] as [number, number])],
        },
        routeCorridor: {
          centerline: draft.points,
          radiusMeters: draft.radiusMeters,
        },
      };
  }
}

function buildReviewDiff(
  draft: GeometryDraft,
  baselineDraft: GeometryDraft | null,
  afterGeoJson: string,
  beforeGeoJson: string | null,
): GeometryReviewDiff {
  const summary: string[] = [];
  const changed = beforeGeoJson !== afterGeoJson;

  if (!baselineDraft) {
    summary.push(`Created ${draft.kind} geometry.`);
  } else if (!changed) {
    summary.push("No geometry changes.");
  } else {
    summary.push(`Changed geometry from ${baselineDraft.kind} to ${draft.kind}.`);
  }

  switch (draft.kind) {
    case "polygon":
      summary.push(`${draft.points.length} polygon vertices.`);
      break;
    case "circle":
      summary.push(
        draft.center
          ? `Circle radius ${Math.round(draft.radiusMeters)} m.`
          : "Circle center not set.",
      );
      break;
    case "routeCorridor":
      summary.push(`${draft.points.length} route points.`);
      summary.push(`Corridor radius ${Math.round(draft.radiusMeters)} m.`);
      break;
  }

  return {
    changed,
    summary,
    beforeGeoJson,
    afterGeoJson,
  };
}

function geometryDraftToGeoJsonObject(draft: GeometryDraft): Record<string, unknown> {
  switch (draft.kind) {
    case "polygon":
      return {
        type: "Feature",
        properties: { geometryEditorKind: "polygon" },
        geometry: {
          type: "Polygon",
          coordinates: [closePolygonRing(draft.points).map((point) => [point.lng, point.lat])],
        },
      };
    case "circle":
      return {
        type: "Feature",
        properties: {
          geometryEditorKind: "circle",
          radiusMeters: draft.radiusMeters,
        },
        geometry: {
          type: "Point",
          coordinates: draft.center ? [draft.center.lng, draft.center.lat] : [],
        },
      };
    case "routeCorridor":
      return {
        type: "Feature",
        properties: {
          geometryEditorKind: "routeCorridor",
          corridorRadiusMeters: draft.radiusMeters,
        },
        geometry: {
          type: "LineString",
          coordinates: draft.points.map((point) => [point.lng, point.lat]),
        },
      };
  }
}

function geometryDraftFromGeoJsonObject(value: Record<string, unknown>): GeometryDraft {
  if (value.type === "FeatureCollection") {
    const features = Array.isArray(value.features) ? value.features : [];
    const firstFeature = features[0];
    if (!firstFeature || typeof firstFeature !== "object") {
      throw new Error("GeoJSON FeatureCollection is empty.");
    }
    return geometryDraftFromGeoJsonObject(firstFeature as Record<string, unknown>);
  }

  if (value.type === "Feature") {
    const geometry =
      value.geometry && typeof value.geometry === "object"
        ? (value.geometry as Record<string, unknown>)
        : null;
    const properties =
      value.properties && typeof value.properties === "object"
        ? (value.properties as Record<string, unknown>)
        : {};
    if (!geometry) {
      throw new Error("GeoJSON Feature has no geometry.");
    }
    return geometryDraftFromGeometry(geometry, properties);
  }

  return geometryDraftFromGeometry(value, {});
}

function geometryDraftFromGeometry(
  geometry: Record<string, unknown>,
  properties: Record<string, unknown>,
): GeometryDraft {
  switch (geometry.type) {
    case "Polygon": {
      const rings = geometry.coordinates as number[][][] | undefined;
      const ring = rings?.[0];
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new Error("Polygon ring must contain at least 4 coordinates.");
      }
      const points = ring.slice(0, -1).map(positionToPoint);
      return { kind: "polygon", points };
    }
    case "MultiPolygon": {
      const polygons = geometry.coordinates as number[][][][] | undefined;
      const ring = polygons?.[0]?.[0];
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new Error("MultiPolygon requires at least one closed ring.");
      }
      const points = ring.slice(0, -1).map(positionToPoint);
      return { kind: "polygon", points };
    }
    case "Point": {
      const coordinates = geometry.coordinates as number[] | undefined;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error("Point geometry requires [lng, lat].");
      }
      const radiusMeters = numericProperty(
        properties.radiusMeters ?? properties.corridorRadiusMeters,
        DEFAULT_CIRCLE_RADIUS_METERS,
      );
      return {
        kind: "circle",
        center: positionToPoint(coordinates),
        radiusMeters,
      };
    }
    case "LineString": {
      const coordinates = geometry.coordinates as number[][] | undefined;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error("LineString requires at least 2 coordinates.");
      }
      return {
        kind: "routeCorridor",
        points: coordinates.map(positionToPoint),
        radiusMeters: numericProperty(properties.corridorRadiusMeters, DEFAULT_CIRCLE_RADIUS_METERS),
      };
    }
    case "MultiLineString": {
      const coordinates = geometry.coordinates as number[][][] | undefined;
      const firstLine = coordinates?.[0];
      if (!Array.isArray(firstLine) || firstLine.length < 2) {
        throw new Error("MultiLineString requires at least one line with 2 points.");
      }
      return {
        kind: "routeCorridor",
        points: firstLine.map(positionToPoint),
        radiusMeters: numericProperty(properties.corridorRadiusMeters, DEFAULT_CIRCLE_RADIUS_METERS),
      };
    }
    default:
      throw new Error(`Unsupported GeoJSON geometry type: ${String(geometry.type)}`);
  }
}

function closePolygonRing(points: GeoPoint[]): GeoPoint[] {
  if (points.length === 0) {
    return [];
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.lat === last.lat && first.lng === last.lng) {
    return points;
  }
  return [...points, first];
}

function positionToPoint(position: number[]): GeoPoint {
  if (position.length < 2) {
    throw new Error("GeoJSON coordinates must include [lng, lat].");
  }
  const [lng, lat] = position;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("GeoJSON coordinates must be finite numbers.");
  }
  if (!isLatitudeInRange(lat)) {
    throw new Error("GeoJSON latitude must be between -90 and 90.");
  }
  if (!isLongitudeInRange(lng)) {
    throw new Error("GeoJSON longitude must be between -180 and 180.");
  }
  return { lat: lat!, lng: lng! };
}

function numericProperty(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dedupeSequentialPoints(points: GeoPoint[]): GeoPoint[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.lat !== point.lat || previous.lng !== point.lng;
  });
}

function validatePointCollection(points: GeoPoint[], label: string): string[] {
  return points.flatMap((point, index) => validatePoint(point, `${label} ${index + 1}`));
}

function validatePoint(point: GeoPoint, label: string): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(point.lat)) {
    errors.push(`${label} latitude must be a finite number.`);
  } else if (!isLatitudeInRange(point.lat)) {
    errors.push(`${label} latitude must be between -90 and 90.`);
  }

  if (!Number.isFinite(point.lng)) {
    errors.push(`${label} longitude must be a finite number.`);
  } else if (!isLongitudeInRange(point.lng)) {
    errors.push(`${label} longitude must be between -180 and 180.`);
  }

  return errors;
}

function isLatitudeInRange(lat: number): boolean {
  return lat >= WORLD_BOUNDS.minLat && lat <= WORLD_BOUNDS.maxLat;
}

function isLongitudeInRange(lng: number): boolean {
  return lng >= WORLD_BOUNDS.minLng && lng <= WORLD_BOUNDS.maxLng;
}

function signedPolygonArea(points: GeoPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) {
      continue;
    }
    area += current.lng * next.lat - next.lng * current.lat;
  }
  return area / 2;
}

function polygonHasSelfIntersection(points: GeoPoint[]): boolean {
  const ring = closePolygonRing(points);
  const segmentCount = ring.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const aStart = ring[index];
    const aEnd = ring[index + 1];
    if (!aStart || !aEnd) {
      continue;
    }

    for (let compareIndex = index + 1; compareIndex < segmentCount; compareIndex += 1) {
      const bStart = ring[compareIndex];
      const bEnd = ring[compareIndex + 1];
      if (!bStart || !bEnd) {
        continue;
      }

      if (segmentsShareEndpoint(index, compareIndex, segmentCount)) {
        continue;
      }

      if (segmentsIntersect(aStart, aEnd, bStart, bEnd)) {
        return true;
      }
    }
  }

  return false;
}

function segmentsShareEndpoint(
  leftIndex: number,
  rightIndex: number,
  segmentCount: number,
): boolean {
  return (
    leftIndex === rightIndex ||
    Math.abs(leftIndex - rightIndex) === 1 ||
    (leftIndex === 0 && rightIndex === segmentCount - 1)
  );
}

function segmentsIntersect(
  aStart: GeoPoint,
  aEnd: GeoPoint,
  bStart: GeoPoint,
  bEnd: GeoPoint,
): boolean {
  const o1 = orientation(aStart, aEnd, bStart);
  const o2 = orientation(aStart, aEnd, bEnd);
  const o3 = orientation(bStart, bEnd, aStart);
  const o4 = orientation(bStart, bEnd, aEnd);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && pointOnSegment(aStart, bStart, aEnd)) {
    return true;
  }
  if (o2 === 0 && pointOnSegment(aStart, bEnd, aEnd)) {
    return true;
  }
  if (o3 === 0 && pointOnSegment(bStart, aStart, bEnd)) {
    return true;
  }
  if (o4 === 0 && pointOnSegment(bStart, aEnd, bEnd)) {
    return true;
  }

  return false;
}

function orientation(a: GeoPoint, b: GeoPoint, c: GeoPoint): -1 | 0 | 1 {
  const value = (b.lng - a.lng) * (c.lat - b.lat) - (b.lat - a.lat) * (c.lng - b.lng);
  if (Math.abs(value) < 1e-10) {
    return 0;
  }
  return value > 0 ? 1 : -1;
}

function pointOnSegment(start: GeoPoint, point: GeoPoint, end: GeoPoint): boolean {
  return (
    point.lng <= Math.max(start.lng, end.lng) + 1e-10 &&
    point.lng >= Math.min(start.lng, end.lng) - 1e-10 &&
    point.lat <= Math.max(start.lat, end.lat) + 1e-10 &&
    point.lat >= Math.min(start.lat, end.lat) - 1e-10
  );
}
