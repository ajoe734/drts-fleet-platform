import type {
  DispatchCandidate,
  DispatchCandidateLocationState,
  DispatchJobRecord,
  OwnedOrderRecord,
  OwnedOrderSpatialAuditDecision,
} from "@drts/contracts";

import { getCandidateLocationState } from "./location-state";

export type OpsMapProviderStatus =
  | "ready"
  | "degraded_projection"
  | "no_spatial_data";

export type OpsMapPointKind = "pickup" | "dropoff" | "candidate";

export interface OpsMapPoint {
  key: string;
  kind: OpsMapPointKind;
  label: string;
  lat: number;
  lng: number;
  orderId?: string;
  jobId?: string;
  etaMinutes?: number | null;
  subtitle?: string;
  freshness?: DispatchCandidateLocationState;
}

export interface OpsMapCoordinate {
  lat: number;
  lng: number;
}

export interface OpsMapRouteSegment {
  key: string;
  orderId: string;
  jobId?: string;
  label: string;
  pickup: OpsMapCoordinate;
  dropoff: OpsMapCoordinate;
}

export interface OpsMapOverlaySummary {
  serviceAreaCodes: string[];
  policyCodes: string[];
  geometryVersionRefs: string[];
  reasonCodes: string[];
  decisions: OwnedOrderSpatialAuditDecision[];
}

export interface BuildOpsMapBoardInput {
  orders: OwnedOrderRecord[];
  orderJobMap: Record<string, DispatchJobRecord | undefined>;
  candidatesByJobId: Record<string, DispatchCandidate[] | undefined>;
  visibleLimit?: number;
}

export interface OpsMapBoardModel {
  providerStatus: OpsMapProviderStatus;
  fallbackReason: "none" | "missing_coordinates" | "no_visible_points";
  points: OpsMapPoint[];
  routeSegments: OpsMapRouteSegment[];
  overlays: OpsMapOverlaySummary;
  ordersWithPickupCoordinates: number;
  ordersMissingPickupCoordinates: number;
  candidateSupplyPoints: number;
  staleCandidatePoints: number;
  noLocationCandidateCount: number;
}

export interface OpsMapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  latSpan: number;
  lngSpan: number;
}

export interface OpsMapTile {
  key: string;
  src: string;
  x: number;
  y: number;
  z: number;
  leftPx: number;
  topPx: number;
}

export interface OpsMapTileViewport {
  centerLat: number;
  centerLng: number;
  zoom: number;
  width: number;
  height: number;
  tileSize: number;
  topLeftX: number;
  topLeftY: number;
  worldSize: number;
  tiles: OpsMapTile[];
}

export interface BuildOpsMapTileViewportInput {
  bounds: OpsMapBounds;
  centerLat?: number | null;
  centerLng?: number | null;
  zoom?: number | null;
  width?: number;
  height?: number;
  tileSize?: number;
  tileUrlTemplate?: string | null;
}

export interface OpsMapViewportPoint {
  leftPct: number;
  topPct: number;
  visible: boolean;
}

const WEB_MERCATOR_MAX_LAT = 85.05112878;
export const OPS_MAP_MIN_ZOOM = 3;
export const OPS_MAP_MAX_ZOOM = 18;
export const OPS_MAP_MOCK_TILE_URL_TEMPLATE = "/mock-map-tiles/{z}/{x}/{y}.svg";

type OpsMapTileEnv = Partial<
  Record<
    | "DRTS_ENV"
    | "MAP_PROVIDER_MODE"
    | "MAP_PROVIDER_TILE_URL_TEMPLATE"
    | "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE"
    | "NODE_ENV",
    string | undefined
  >
>;

export function hasOpsMapCoordinates(
  value: { lat?: number | null; lng?: number | null } | null | undefined,
): value is { lat: number; lng: number } {
  return (
    typeof value?.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng)
  );
}

export function buildOpsMapBoardModel({
  orders,
  orderJobMap,
  candidatesByJobId,
  visibleLimit = 10,
}: BuildOpsMapBoardInput): OpsMapBoardModel {
  const visibleOrders = orders.slice(0, visibleLimit);
  const points: OpsMapPoint[] = [];
  const routeSegments: OpsMapRouteSegment[] = [];
  let candidateSupplyPoints = 0;
  let staleCandidatePoints = 0;
  let noLocationCandidateCount = 0;

  for (const order of visibleOrders) {
    const job = orderJobMap[order.orderId];
    const jobFields = job
      ? { jobId: job.dispatchJobId, etaMinutes: job.latestEtaMinutes }
      : {};

    const pickup = hasOpsMapCoordinates(order.pickup) ? order.pickup : null;
    const dropoff = hasOpsMapCoordinates(order.dropoff) ? order.dropoff : null;

    if (pickup) {
      points.push({
        key: `${order.orderId}:pickup`,
        kind: "pickup",
        label: order.orderNo,
        lat: pickup.lat,
        lng: pickup.lng,
        orderId: order.orderId,
        subtitle: pickup.addressName ?? pickup.address,
        ...jobFields,
      });
    }

    if (dropoff) {
      points.push({
        key: `${order.orderId}:dropoff`,
        kind: "dropoff",
        label: order.orderNo,
        lat: dropoff.lat,
        lng: dropoff.lng,
        orderId: order.orderId,
        subtitle: dropoff.addressName ?? dropoff.address,
        ...jobFields,
      });
    }

    if (pickup && dropoff) {
      routeSegments.push({
        key: `${order.orderId}:route`,
        orderId: order.orderId,
        label: order.orderNo,
        pickup: { lat: pickup.lat, lng: pickup.lng },
        dropoff: { lat: dropoff.lat, lng: dropoff.lng },
        ...(job ? { jobId: job.dispatchJobId } : {}),
      });
    }

    if (!job) {
      continue;
    }

    for (const candidate of candidatesByJobId[job.dispatchJobId] ?? []) {
      const freshness = getCandidateLocationState(candidate);
      if (freshness === "missing" || !candidate.currentLocation) {
        noLocationCandidateCount += 1;
        continue;
      }

      candidateSupplyPoints += 1;
      if (freshness === "stale" || freshness === "low_accuracy") {
        staleCandidatePoints += 1;
      }
      points.push({
        key: `${job.dispatchJobId}:${candidate.vehicleId}:${candidate.driverId}`,
        kind: "candidate",
        label: candidate.vehicleId,
        lat: candidate.currentLocation.lat,
        lng: candidate.currentLocation.lng,
        orderId: order.orderId,
        jobId: job.dispatchJobId,
        etaMinutes: candidate.etaMinutes,
        subtitle: `${candidate.driverId} · ${candidate.operatingArea}`,
        freshness,
      });
    }
  }

  const ordersWithPickupCoordinates = orders.filter((order) =>
    hasOpsMapCoordinates(order.pickup),
  ).length;
  const ordersMissingPickupCoordinates =
    orders.length - ordersWithPickupCoordinates;
  const providerStatus =
    points.length === 0
      ? "no_spatial_data"
      : ordersMissingPickupCoordinates > 0 || noLocationCandidateCount > 0
        ? "degraded_projection"
        : "ready";

  return {
    providerStatus,
    fallbackReason:
      points.length === 0
        ? "no_visible_points"
        : providerStatus === "degraded_projection"
          ? "missing_coordinates"
          : "none",
    points,
    routeSegments,
    overlays: buildOpsMapOverlaySummary(visibleOrders),
    ordersWithPickupCoordinates,
    ordersMissingPickupCoordinates,
    candidateSupplyPoints,
    staleCandidatePoints,
    noLocationCandidateCount,
  };
}

export function resolveOpsMapTileUrlTemplate(env: OpsMapTileEnv) {
  const configured =
    env.MAP_PROVIDER_TILE_URL_TEMPLATE?.trim() ||
    env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE?.trim();
  if (configured) {
    return configured;
  }

  const mapProviderMode = env.MAP_PROVIDER_MODE?.trim().toLowerCase();
  const runtimeEnv = env.DRTS_ENV?.trim().toLowerCase();
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  const canUseMockTiles =
    mapProviderMode === "mock" ||
    nodeEnv === "development" ||
    nodeEnv === "test" ||
    runtimeEnv === "local" ||
    runtimeEnv === "test";

  return canUseMockTiles ? OPS_MAP_MOCK_TILE_URL_TEMPLATE : "";
}

export function buildOpsMapOverlaySummary(
  orders: OwnedOrderRecord[],
): OpsMapOverlaySummary {
  return {
    serviceAreaCodes: unique(
      orders.flatMap((order) => order.spatialAudit?.serviceAreaCodes ?? []),
    ),
    policyCodes: unique(
      orders.flatMap(
        (order) =>
          order.spatialAudit?.serviceAreaEvaluation?.stops.flatMap(
            (stop) => stop.policyCodes,
          ) ?? [],
      ),
    ),
    geometryVersionRefs: unique(
      orders.flatMap((order) => order.spatialAudit?.geometryVersionRefs ?? []),
    ),
    reasonCodes: unique(
      orders.flatMap((order) => order.spatialAudit?.reasonCodes ?? []),
    ),
    decisions: unique(
      orders.flatMap((order) =>
        order.spatialAudit ? [order.spatialAudit.decision] : [],
      ),
    ),
  };
}

export function normalizeOpsMapBounds(
  points: OpsMapPoint[],
): OpsMapBounds | null {
  if (points.length === 0) {
    return null;
  }

  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  return { minLat, maxLat, minLng, maxLng, latSpan, lngSpan };
}

export function projectOpsMapPoint(point: OpsMapPoint, bounds: OpsMapBounds) {
  const horizontalPadding = 8;
  const verticalPadding = 10;
  const width = 100 - horizontalPadding * 2;
  const height = 100 - verticalPadding * 2;
  const x =
    horizontalPadding + ((point.lng - bounds.minLng) / bounds.lngSpan) * width;
  const y =
    100 -
    verticalPadding -
    ((point.lat - bounds.minLat) / bounds.latSpan) * height;

  return {
    left: `${Math.min(96, Math.max(4, x))}%`,
    top: `${Math.min(94, Math.max(6, y))}%`,
  };
}

export function getOpsMapBoundsCenter(bounds: OpsMapBounds) {
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };
}

export function getDefaultOpsMapZoom(
  bounds: OpsMapBounds,
  width = 720,
  height = 360,
  tileSize = 256,
) {
  const min = lngLatToWorldPixel(bounds.minLng, bounds.maxLat, 0, tileSize);
  const max = lngLatToWorldPixel(bounds.maxLng, bounds.minLat, 0, tileSize);
  const xSpan = Math.max(Math.abs(max.x - min.x), 1);
  const ySpan = Math.max(Math.abs(max.y - min.y), 1);
  const fitScale = Math.min(width / xSpan, height / ySpan) * 0.72;
  const zoom = Math.floor(Math.log2(Math.max(fitScale, 1)));
  return clampZoom(zoom);
}

export function buildOpsMapTileViewport({
  bounds,
  centerLat,
  centerLng,
  zoom,
  width = 720,
  height = 360,
  tileSize = 256,
  tileUrlTemplate,
}: BuildOpsMapTileViewportInput): OpsMapTileViewport {
  const fallbackCenter = getOpsMapBoundsCenter(bounds);
  const safeCenterLat =
    typeof centerLat === "number" && Number.isFinite(centerLat)
      ? clampLatitude(centerLat)
      : fallbackCenter.lat;
  const safeCenterLng =
    typeof centerLng === "number" && Number.isFinite(centerLng)
      ? normalizeLongitude(centerLng)
      : fallbackCenter.lng;
  const safeZoom =
    typeof zoom === "number" && Number.isFinite(zoom)
      ? clampZoom(Math.round(zoom))
      : getDefaultOpsMapZoom(bounds, width, height, tileSize);
  const worldSize = tileSize * 2 ** safeZoom;
  const center = lngLatToWorldPixel(
    safeCenterLng,
    safeCenterLat,
    safeZoom,
    tileSize,
  );
  const topLeftX = center.x - width / 2;
  const topLeftY = center.y - height / 2;
  const template = tileUrlTemplate?.trim();
  const tiles: OpsMapTile[] = [];

  if (template) {
    const minTileX = Math.floor(topLeftX / tileSize);
    const maxTileX = Math.floor((topLeftX + width) / tileSize);
    const minTileY = Math.max(0, Math.floor(topLeftY / tileSize));
    const maxTileY = Math.min(
      2 ** safeZoom - 1,
      Math.floor((topLeftY + height) / tileSize),
    );

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const wrappedX = wrapTileX(tileX, safeZoom);
        tiles.push({
          key: `${safeZoom}:${wrappedX}:${tileY}`,
          src: template
            .replaceAll("{z}", String(safeZoom))
            .replaceAll("{x}", String(wrappedX))
            .replaceAll("{y}", String(tileY)),
          x: wrappedX,
          y: tileY,
          z: safeZoom,
          leftPx: tileX * tileSize - topLeftX,
          topPx: tileY * tileSize - topLeftY,
        });
      }
    }
  }

  return {
    centerLat: safeCenterLat,
    centerLng: safeCenterLng,
    zoom: safeZoom,
    width,
    height,
    tileSize,
    topLeftX,
    topLeftY,
    worldSize,
    tiles,
  };
}

export function projectOpsMapPointToViewport(
  point: OpsMapPoint,
  viewport: OpsMapTileViewport,
): OpsMapViewportPoint {
  const world = lngLatToWorldPixel(
    point.lng,
    point.lat,
    viewport.zoom,
    viewport.tileSize,
  );
  let dx = world.x - (viewport.topLeftX + viewport.width / 2);
  if (Math.abs(dx) > viewport.worldSize / 2) {
    dx += dx > 0 ? -viewport.worldSize : viewport.worldSize;
  }

  const leftPx = viewport.width / 2 + dx;
  const topPx = world.y - viewport.topLeftY;

  return {
    leftPct: (leftPx / viewport.width) * 100,
    topPct: (topPx / viewport.height) * 100,
    visible:
      leftPx >= -viewport.tileSize &&
      leftPx <= viewport.width + viewport.tileSize &&
      topPx >= -viewport.tileSize &&
      topPx <= viewport.height + viewport.tileSize,
  };
}

export function unprojectOpsMapViewportPoint(
  point: { leftPx: number; topPx: number },
  viewport: OpsMapTileViewport,
): OpsMapCoordinate {
  const worldX = viewport.topLeftX + point.leftPx;
  const worldY = viewport.topLeftY + point.topPx;
  const unprojected = worldPixelToLngLat(worldX, worldY, viewport);
  return {
    lat: clampLatitude(unprojected.lat),
    lng: normalizeLongitude(unprojected.lng),
  };
}

export function shiftOpsMapCenter(
  viewport: OpsMapTileViewport,
  direction: "north" | "south" | "west" | "east",
) {
  const deltaPx =
    direction === "north" || direction === "south"
      ? viewport.height * 0.32
      : viewport.width * 0.32;
  const center = lngLatToWorldPixel(
    viewport.centerLng,
    viewport.centerLat,
    viewport.zoom,
    viewport.tileSize,
  );
  const next =
    direction === "north"
      ? worldPixelToLngLat(center.x, center.y - deltaPx, viewport)
      : direction === "south"
        ? worldPixelToLngLat(center.x, center.y + deltaPx, viewport)
        : direction === "west"
          ? worldPixelToLngLat(center.x - deltaPx, center.y, viewport)
          : worldPixelToLngLat(center.x + deltaPx, center.y, viewport);

  return {
    lat: clampLatitude(next.lat),
    lng: normalizeLongitude(next.lng),
  };
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function clampZoom(zoom: number) {
  return Math.min(OPS_MAP_MAX_ZOOM, Math.max(OPS_MAP_MIN_ZOOM, zoom));
}

function clampLatitude(lat: number) {
  return Math.min(WEB_MERCATOR_MAX_LAT, Math.max(-WEB_MERCATOR_MAX_LAT, lat));
}

function normalizeLongitude(lng: number) {
  const normalized = ((((lng + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -180) ? 180 : normalized;
}

function lngLatToWorldPixel(
  lng: number,
  lat: number,
  zoom: number,
  tileSize: number,
) {
  const safeLat = clampLatitude(lat);
  const latRad = (safeLat * Math.PI) / 180;
  const scale = tileSize * 2 ** zoom;

  return {
    x: ((normalizeLongitude(lng) + 180) / 360) * scale,
    y:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      scale,
  };
}

function worldPixelToLngLat(
  x: number,
  y: number,
  viewport: Pick<OpsMapTileViewport, "worldSize">,
) {
  const normalizedX =
    ((x % viewport.worldSize) + viewport.worldSize) % viewport.worldSize;
  const lng = (normalizedX / viewport.worldSize) * 360 - 180;
  const mercatorY = 1 - (2 * y) / viewport.worldSize;
  const lat = (Math.atan(Math.sinh(Math.PI * mercatorY)) * 180) / Math.PI;

  return { lat, lng };
}

function wrapTileX(x: number, zoom: number) {
  const count = 2 ** zoom;
  return ((x % count) + count) % count;
}
