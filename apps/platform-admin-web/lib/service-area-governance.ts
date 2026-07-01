import type {
  EvaluateServiceAreaCommand,
  GeoPoint,
  ServiceAreaBoundaryRecord,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
  ServiceAreaGeometry,
  ServiceProductType,
  StopPolicyRecord,
} from "@drts/contracts";

export type ServiceAreaGovernanceRecord =
  | ServiceAreaBoundaryRecord
  | StopPolicyRecord;

export type AffectedEvaluationSample = {
  sampleId: string;
  label: string;
  targetVersionRef: string;
  command: EvaluateServiceAreaCommand;
};

export type EvaluationPreviewSummary = {
  total: number;
  blocked: number;
  manualReview: number;
  serviceable: number;
  versionRefs: string[];
  serviceAreaCodes: string[];
  reasonCodes: string[];
};

type GeoJsonLikeFeature = {
  type: "Feature";
  geometry?: unknown;
  properties?: Record<string, unknown>;
};

type GeoJsonLikeFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonLikeFeature[];
};

const DEFAULT_PRODUCT_TYPE: ServiceProductType = "taxi_realtime";

export function getServiceAreaGovernanceRecordId(
  record: ServiceAreaGovernanceRecord,
) {
  return "serviceAreaId" in record ? record.serviceAreaId : record.stopPolicyId;
}

export function getServiceAreaGovernanceRecordCode(
  record: ServiceAreaGovernanceRecord,
) {
  return "areaCode" in record ? record.areaCode : record.policyCode;
}

export function getGeometryVersionRef(record: ServiceAreaGovernanceRecord) {
  const prefix = "areaCode" in record ? "svc_area" : "stop_policy";
  return `${prefix}:${getServiceAreaGovernanceRecordCode(record)}@v${
    record.version
  }`;
}

export function validateServiceAreaGeometry(
  geometry: ServiceAreaGeometry | null | undefined,
) {
  const errors: string[] = [];
  if (!geometry) {
    return ["Geometry is required."];
  }

  if (geometry.type === "polygon") {
    if (geometry.coordinates.length < 3) {
      errors.push("Polygon requires at least three vertices.");
    }
    geometry.coordinates.forEach((point, index) => {
      validatePoint(point, `polygon vertex ${index + 1}`, errors);
    });
    const uniquePoints = new Set(
      geometry.coordinates.map((point) => `${point.lat}:${point.lng}`),
    );
    if (uniquePoints.size < 3) {
      errors.push("Polygon requires at least three unique vertices.");
    }
    if (
      geometry.coordinates.length >= 4 &&
      polygonSelfIntersects(geometry.coordinates)
    ) {
      errors.push("Polygon edges must not self-intersect.");
    }
    return errors;
  }

  validatePoint(geometry.center, "circle center", errors);
  if (!Number.isFinite(geometry.radiusMeters) || geometry.radiusMeters <= 0) {
    errors.push("Circle radius must be greater than zero meters.");
  }
  if (geometry.radiusMeters > 200000) {
    errors.push("Circle radius must be 200 km or smaller for admin preview.");
  }
  return errors;
}

export function buildGeometryPreviewSummary(geometry: ServiceAreaGeometry) {
  if (geometry.type === "circle") {
    return [
      `Circle center ${formatPoint(geometry.center)}`,
      `Radius ${Math.round(geometry.radiusMeters)} m`,
    ];
  }

  const bounds = getBounds(geometry.coordinates);
  return [
    `Polygon vertices ${geometry.coordinates.length}`,
    `Bounds ${formatPoint(bounds.southWest)} to ${formatPoint(
      bounds.northEast,
    )}`,
  ];
}

export function geometryToGeoJsonExport(
  geometry: ServiceAreaGeometry,
  id = "geometry-editor-draft",
) {
  if (geometry.type === "circle") {
    return {
      type: "Feature",
      id,
      geometry: {
        type: "Point",
        coordinates: [geometry.center.lng, geometry.center.lat],
      },
      properties: {
        geometryKind: "circle",
        radiusMeters: geometry.radiusMeters,
        sourceGeometry: geometry,
      },
    };
  }

  const first = geometry.coordinates[0];
  const ring = geometry.coordinates.map((point) => [point.lng, point.lat]);
  if (first) {
    ring.push([first.lng, first.lat]);
  }

  return {
    type: "Feature",
    id,
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    properties: {
      geometryKind: "polygon",
      sourceGeometry: geometry,
    },
  };
}

export function parseGeometryImport(text: string): ServiceAreaGeometry {
  const parsed = JSON.parse(text) as unknown;
  const directGeometry = parseNativeGeometry(parsed);
  if (directGeometry) {
    return directGeometry;
  }

  const feature = selectImportFeature(parsed);
  if (!feature) {
    throw new Error(
      "Import must be a ServiceArea geometry, GeoJSON Feature, or FeatureCollection.",
    );
  }

  const sourceGeometry = parseNativeGeometry(
    feature.properties?.sourceGeometry,
  );
  if (sourceGeometry) {
    return sourceGeometry;
  }

  return parseGeoJsonGeometry(feature.geometry, feature.properties);
}

export function buildAffectedEvaluationSamples(
  record: ServiceAreaGovernanceRecord,
  options: { requestedAt?: string | null } = {},
): AffectedEvaluationSample[] {
  const requestedAt = options.requestedAt || record.effectiveFrom;
  const serviceProductType =
    record.serviceProductTypes[0] ?? DEFAULT_PRODUCT_TYPE;
  const targetPoint = getRepresentativePoint(record.geometry);
  const outsideControl = offsetPoint(targetPoint, 0.35);
  const targetVersionRef = getGeometryVersionRef(record);

  return [
    {
      sampleId: "target-pickup",
      label: "Target geometry pickup",
      targetVersionRef,
      command: {
        serviceProductType,
        pickup: targetPoint,
        requestedAt,
      },
    },
    {
      sampleId: "target-dropoff",
      label: "Target geometry dropoff",
      targetVersionRef,
      command: {
        serviceProductType,
        pickup: targetPoint,
        dropoff: targetPoint,
        requestedAt,
      },
    },
    {
      sampleId: "outside-control",
      label: "Outside control",
      targetVersionRef,
      command: {
        serviceProductType,
        pickup: outsideControl,
        dropoff: outsideControl,
        requestedAt,
      },
    },
  ];
}

export function summarizeServiceAreaEvaluationResults(
  results: ServiceAreaEvaluationResult[],
): EvaluationPreviewSummary {
  const counts: Record<ServiceAreaEvaluationDecision, number> = {
    manual_review: 0,
    not_serviceable: 0,
    serviceable: 0,
  };
  const versionRefs = new Set<string>();
  const serviceAreaCodes = new Set<string>();
  const reasonCodes = new Set<string>();

  results.forEach((result) => {
    counts[result.decision] += 1;
    result.geometryVersionRefs.forEach((ref) => versionRefs.add(ref));
    result.serviceAreaCodes.forEach((code) => serviceAreaCodes.add(code));
    result.reasonCodes.forEach((code) => reasonCodes.add(code));
  });

  return {
    total: results.length,
    blocked: counts.not_serviceable,
    manualReview: counts.manual_review,
    serviceable: counts.serviceable,
    versionRefs: [...versionRefs].sort(),
    serviceAreaCodes: [...serviceAreaCodes].sort(),
    reasonCodes: [...reasonCodes].sort(),
  };
}

export function formatPoint(point: GeoPoint) {
  return `${formatCoordinate(point.lat)}, ${formatCoordinate(point.lng)}`;
}

function validatePoint(point: GeoPoint, label: string, errors: string[]) {
  if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) {
    errors.push(`${label} latitude must be between -90 and 90.`);
  }
  if (!Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180) {
    errors.push(`${label} longitude must be between -180 and 180.`);
  }
}

function parseNativeGeometry(value: unknown): ServiceAreaGeometry | null {
  const candidate = value as Partial<ServiceAreaGeometry> | null;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  if (candidate.type === "polygon") {
    const coordinates = (candidate as { coordinates?: unknown }).coordinates;
    if (!Array.isArray(coordinates)) {
      return null;
    }
    return {
      type: "polygon",
      coordinates: coordinates.map((point) => normalizePoint(point)),
    };
  }

  if (candidate.type === "circle") {
    const center = (candidate as { center?: unknown }).center;
    const radiusMeters = Number(
      (candidate as { radiusMeters?: unknown }).radiusMeters,
    );
    return {
      type: "circle",
      center: normalizePoint(center),
      radiusMeters,
    };
  }

  return null;
}

function selectImportFeature(value: unknown): GeoJsonLikeFeature | null {
  const candidate = value as
    | GeoJsonLikeFeature
    | GeoJsonLikeFeatureCollection
    | null;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  if (candidate.type === "Feature") {
    return candidate;
  }
  if (
    candidate.type === "FeatureCollection" &&
    Array.isArray(candidate.features)
  ) {
    return candidate.features[0] ?? null;
  }
  if ("type" in candidate) {
    return { type: "Feature", geometry: candidate };
  }
  return null;
}

function parseGeoJsonGeometry(
  geometry: unknown,
  properties: Record<string, unknown> | undefined,
): ServiceAreaGeometry {
  const candidate = geometry as
    | { type?: string; coordinates?: unknown }
    | null
    | undefined;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Import feature is missing geometry.");
  }

  if (candidate.type === "Polygon") {
    const rings = candidate.coordinates;
    if (!Array.isArray(rings) || !Array.isArray(rings[0])) {
      throw new Error("GeoJSON Polygon import requires a first linear ring.");
    }
    const ring = rings[0] as unknown[];
    const points = ring
      .map((position) => {
        if (!Array.isArray(position)) {
          throw new Error("GeoJSON Polygon coordinates must be positions.");
        }
        return {
          lat: Number(position[1]),
          lng: Number(position[0]),
        };
      })
      .filter((point, index, list) => {
        const first = list[0];
        return !(
          index === list.length - 1 &&
          first &&
          first.lat === point.lat &&
          first.lng === point.lng
        );
      });
    return { type: "polygon", coordinates: points };
  }

  if (candidate.type === "Point") {
    const coordinates = candidate.coordinates;
    if (!Array.isArray(coordinates)) {
      throw new Error("GeoJSON Point import requires coordinates.");
    }
    return {
      type: "circle",
      center: {
        lat: Number(coordinates[1]),
        lng: Number(coordinates[0]),
      },
      radiusMeters: Number(properties?.radiusMeters),
    };
  }

  throw new Error(`Unsupported GeoJSON geometry type: ${candidate.type}`);
}

function normalizePoint(value: unknown): GeoPoint {
  const candidate = value as Partial<GeoPoint> | null;
  return {
    lat: Number(candidate?.lat),
    lng: Number(candidate?.lng),
  };
}

function getRepresentativePoint(geometry: ServiceAreaGeometry): GeoPoint {
  if (geometry.type === "circle") {
    return geometry.center;
  }
  const count = geometry.coordinates.length || 1;
  return {
    lat:
      geometry.coordinates.reduce((sum, point) => sum + point.lat, 0) / count,
    lng:
      geometry.coordinates.reduce((sum, point) => sum + point.lng, 0) / count,
  };
}

function offsetPoint(point: GeoPoint, delta: number): GeoPoint {
  return {
    lat: clamp(point.lat + delta, -89.999, 89.999),
    lng: clamp(point.lng + delta, -179.999, 179.999),
  };
}

function getBounds(points: GeoPoint[]) {
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  return {
    southWest: {
      lat: Math.min(...latitudes),
      lng: Math.min(...longitudes),
    },
    northEast: {
      lat: Math.max(...latitudes),
      lng: Math.max(...longitudes),
    },
  };
}

function polygonSelfIntersects(points: GeoPoint[]) {
  const ring = closedPolygonRing(points);
  for (let leftIndex = 0; leftIndex < ring.length - 1; leftIndex += 1) {
    const leftStart = ring[leftIndex]!;
    const leftEnd = ring[leftIndex + 1]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < ring.length - 1;
      rightIndex += 1
    ) {
      if (Math.abs(leftIndex - rightIndex) <= 1) {
        continue;
      }
      if (leftIndex === 0 && rightIndex === ring.length - 2) {
        continue;
      }
      const rightStart = ring[rightIndex]!;
      const rightEnd = ring[rightIndex + 1]!;
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true;
      }
    }
  }
  return false;
}

function closedPolygonRing(points: GeoPoint[]) {
  const ring = [...points];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first.lat !== last.lat || first.lng !== last.lng)) {
    ring.push({ ...first });
  }
  return ring;
}

function segmentsIntersect(
  leftStart: GeoPoint,
  leftEnd: GeoPoint,
  rightStart: GeoPoint,
  rightEnd: GeoPoint,
) {
  const direction1 = segmentDirection(leftStart, leftEnd, rightStart);
  const direction2 = segmentDirection(leftStart, leftEnd, rightEnd);
  const direction3 = segmentDirection(rightStart, rightEnd, leftStart);
  const direction4 = segmentDirection(rightStart, rightEnd, leftEnd);
  return direction1 * direction2 < 0 && direction3 * direction4 < 0;
}

function segmentDirection(start: GeoPoint, end: GeoPoint, point: GeoPoint) {
  return (
    (point.lng - start.lng) * (end.lat - start.lat) -
    (end.lng - start.lng) * (point.lat - start.lat)
  );
}

function formatCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(6) : "invalid";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
