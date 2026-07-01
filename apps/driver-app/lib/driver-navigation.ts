import type {
  AddressPayload,
  DriverTaskRecord,
  OwnedOrderRecord,
} from "@drts/contracts";

export type DriverNavigationTarget = "pickup" | "dropoff";
export type DriverNavigationProvider = "apple" | "google" | "system";
export type DriverNavigationPlatform = "ios" | "android" | "web" | string;

export type DriverNavigationCoordinate = {
  latitude: number;
  longitude: number;
};

export type DriverNavigationStop = {
  target: DriverNavigationTarget;
  label: string;
  address: string;
  coordinate: DriverNavigationCoordinate | null;
  coordinateLabel: string;
  geocodeProvider: string | null;
  coordinateSource: string | null;
  coordinateAccuracyM: number | null;
};

export type DriverRouteAuthorityKind = "drts_owned" | "forwarded_platform";

export type DriverRouteAuthorityCopy = {
  kind: DriverRouteAuthorityKind;
  title: string;
  badge: string;
  description: string;
  locked: boolean;
  degradedHint: string | null;
};

export type DriverTripNavigationModel = {
  stops: Record<DriverNavigationTarget, DriverNavigationStop>;
  authority: DriverRouteAuthorityCopy;
  hasPickupCoordinate: boolean;
  hasDropoffCoordinate: boolean;
  hasNavigableRoute: boolean;
};

export type DriverNavigationUrlCandidate = {
  provider: DriverNavigationProvider;
  label: string;
  url: string;
  requiresCanOpen: boolean;
  fallback: boolean;
};

export type DriverNavigationOpenResult =
  | {
      status: "opened";
      provider: DriverNavigationProvider;
      url: string;
      fallback: boolean;
    }
  | {
      status: "missing_coordinates";
      provider: DriverNavigationProvider;
      message: string;
    }
  | {
      status: "unavailable";
      provider: DriverNavigationProvider;
      message: string;
      attemptedUrls: string[];
    };

export type DriverNavigationLinking = {
  canOpenURL?: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<unknown>;
};

export type DriverLocationFixInput = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracyM?: number | null;
} | null;

export type DriverLocationFixState = {
  state: "fresh" | "stale" | "missing";
  label: string;
  detail: string;
  coordinateLabel: string | null;
};

const DEFAULT_STALE_FIX_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isValidDriverCoordinate(
  coordinate: DriverNavigationCoordinate | null,
): coordinate is DriverNavigationCoordinate {
  if (!coordinate) {
    return false;
  }

  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

function readCoordinateFromRecord(
  value: Record<string, unknown>,
): DriverNavigationCoordinate | null {
  const latitude =
    readNumber(value.lat) ??
    readNumber(value.latitude) ??
    (isRecord(value.coordinate)
      ? (readNumber(value.coordinate.lat) ??
        readNumber(value.coordinate.latitude))
      : null) ??
    (isRecord(value.coordinates)
      ? (readNumber(value.coordinates.lat) ??
        readNumber(value.coordinates.latitude))
      : null);

  const longitude =
    readNumber(value.lng) ??
    readNumber(value.lon) ??
    readNumber(value.longitude) ??
    (isRecord(value.coordinate)
      ? (readNumber(value.coordinate.lng) ??
        readNumber(value.coordinate.lon) ??
        readNumber(value.coordinate.longitude))
      : null) ??
    (isRecord(value.coordinates)
      ? (readNumber(value.coordinates.lng) ??
        readNumber(value.coordinates.lon) ??
        readNumber(value.coordinates.longitude))
      : null);

  if (latitude == null || longitude == null) {
    const coordinates = value.coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const geoJsonLng = readNumber(coordinates[0]);
      const geoJsonLat = readNumber(coordinates[1]);
      const geoJsonCoordinate =
        geoJsonLat == null || geoJsonLng == null
          ? null
          : {
              latitude: geoJsonLat,
              longitude: geoJsonLng,
            };
      return isValidDriverCoordinate(geoJsonCoordinate)
        ? geoJsonCoordinate
        : null;
    }

    return null;
  }

  const coordinate = { latitude, longitude };
  return isValidDriverCoordinate(coordinate) ? coordinate : null;
}

export function readDriverNavigationCoordinate(
  value: unknown,
): DriverNavigationCoordinate | null {
  return isRecord(value) ? readCoordinateFromRecord(value) : null;
}

export function formatDriverCoordinate(
  coordinate: DriverNavigationCoordinate | null,
): string {
  if (!isValidDriverCoordinate(coordinate)) {
    return "座標缺失";
  }

  return `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`;
}

function formatCoordinatePairForUrl(
  coordinate: DriverNavigationCoordinate,
): string {
  return `${coordinate.latitude},${coordinate.longitude}`;
}

function encodeCoordinatePairForUrl(
  coordinate: DriverNavigationCoordinate,
): string {
  return encodeURIComponent(formatCoordinatePairForUrl(coordinate));
}

export function buildAppleMapsNavigationUrl(
  coordinate: DriverNavigationCoordinate,
): string {
  return `http://maps.apple.com/?daddr=${formatCoordinatePairForUrl(
    coordinate,
  )}&dirflg=d`;
}

export function buildGoogleMapsWebNavigationUrl(
  coordinate: DriverNavigationCoordinate,
): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeCoordinatePairForUrl(
    coordinate,
  )}&travelmode=driving`;
}

export function buildGoogleMapsAppNavigationUrl(
  coordinate: DriverNavigationCoordinate,
): string {
  return `comgooglemaps://?daddr=${formatCoordinatePairForUrl(
    coordinate,
  )}&directionsmode=driving`;
}

export function buildAndroidGoogleNavigationUrl(
  coordinate: DriverNavigationCoordinate,
): string {
  return `google.navigation:q=${formatCoordinatePairForUrl(coordinate)}&mode=d`;
}

export function buildDriverNavigationCandidates({
  coordinate,
  provider,
  platform,
}: {
  coordinate: DriverNavigationCoordinate | null;
  provider: DriverNavigationProvider;
  platform: DriverNavigationPlatform;
}): DriverNavigationUrlCandidate[] {
  if (!isValidDriverCoordinate(coordinate)) {
    return [];
  }

  if (provider === "apple") {
    return [
      {
        provider,
        label: "Apple Maps",
        url: buildAppleMapsNavigationUrl(coordinate),
        requiresCanOpen: false,
        fallback: false,
      },
    ];
  }

  if (provider === "google") {
    return [
      {
        provider,
        label: "Google Maps app",
        url: buildGoogleMapsAppNavigationUrl(coordinate),
        requiresCanOpen: true,
        fallback: false,
      },
      {
        provider,
        label: "Google Maps web",
        url: buildGoogleMapsWebNavigationUrl(coordinate),
        requiresCanOpen: false,
        fallback: true,
      },
    ];
  }

  if (platform === "android") {
    return [
      {
        provider,
        label: "Android navigation",
        url: buildAndroidGoogleNavigationUrl(coordinate),
        requiresCanOpen: true,
        fallback: false,
      },
      {
        provider,
        label: "Google Maps web",
        url: buildGoogleMapsWebNavigationUrl(coordinate),
        requiresCanOpen: false,
        fallback: true,
      },
    ];
  }

  return [
    {
      provider,
      label: "Apple Maps",
      url: buildAppleMapsNavigationUrl(coordinate),
      requiresCanOpen: false,
      fallback: false,
    },
  ];
}

export async function openDriverNavigation({
  stop,
  provider,
  platform,
  linking,
}: {
  stop: Pick<DriverNavigationStop, "coordinate" | "label">;
  provider: DriverNavigationProvider;
  platform: DriverNavigationPlatform;
  linking: DriverNavigationLinking;
}): Promise<DriverNavigationOpenResult> {
  const candidates = buildDriverNavigationCandidates({
    coordinate: stop.coordinate,
    provider,
    platform,
  });

  if (candidates.length === 0) {
    return {
      status: "missing_coordinates",
      provider,
      message: `${stop.label} 缺少有效座標，已停用座標導航交接。`,
    };
  }

  const attemptedUrls: string[] = [];
  for (const candidate of candidates) {
    attemptedUrls.push(candidate.url);

    if (candidate.requiresCanOpen && linking.canOpenURL) {
      const canOpen = await linking
        .canOpenURL(candidate.url)
        .catch(() => false);
      if (!canOpen) {
        continue;
      }
    }

    try {
      await linking.openURL(candidate.url);
      return {
        status: "opened",
        provider,
        url: candidate.url,
        fallback: candidate.fallback,
      };
    } catch {
      continue;
    }
  }

  return {
    status: "unavailable",
    provider,
    message: "無法開啟外部導航。請手動輸入畫面座標，或聯絡派車台協助導航。",
    attemptedUrls,
  };
}

function buildStop(
  target: DriverNavigationTarget,
  address: AddressPayload | null | undefined,
): DriverNavigationStop {
  const coordinate = readDriverNavigationCoordinate(address);

  return {
    target,
    label: target === "pickup" ? "上車點" : "下車點",
    address:
      address?.address?.trim() ||
      (target === "pickup" ? "待確認上車點" : "待確認下車點"),
    coordinate,
    coordinateLabel: formatDriverCoordinate(coordinate),
    geocodeProvider: address?.geocodeProvider ?? null,
    coordinateSource: address?.coordinateSource ?? null,
    coordinateAccuracyM: address?.coordinateAccuracyM ?? null,
  };
}

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getDriverRouteAuthorityCopy(
  task: DriverTaskRecord | null,
): DriverRouteAuthorityCopy {
  if (!task?.sourcePlatform) {
    return {
      kind: "drts_owned",
      title: "DRTS-owned route",
      badge: "DRTS 可派遣調整",
      description:
        "DRTS owns this route. Pickup/dropoff coordinates come from the DRTS order snapshot, and dispatch may update the route under DRTS rules.",
      locked: false,
      degradedHint: null,
    };
  }

  const routeProvided = readOptionalBoolean(task.routeProvided);
  const routeLocked =
    readOptionalBoolean((task as { routeLocked?: unknown }).routeLocked) ??
    true;
  const routeIntent =
    readOptionalString((task as { routeIntent?: unknown }).routeIntent) ??
    readOptionalString(
      (task as { platformRouteIntent?: unknown }).platformRouteIntent,
    );

  return {
    kind: "forwarded_platform",
    title: "Forwarded route - source platform authority",
    badge: routeLocked ? "來源平台路線鎖定" : "來源平台路線",
    description: routeIntent
      ? `DRTS forwards this route from ${task.sourcePlatform}; source platform route intent: ${routeIntent}. Do not imply local route edit authority.`
      : `DRTS forwards this route from ${task.sourcePlatform}. The source platform owns route authority; DRTS displays the last synced pickup/dropoff coordinates only.`,
    locked: routeLocked,
    degradedHint:
      routeProvided === false
        ? "來源平台未提供完整路線 polyline；司機端只顯示最後同步的上下車座標，改路線需聯絡派車台或來源平台。"
        : null,
  };
}

export function buildDriverTripNavigationModel({
  task,
  order,
}: {
  task: DriverTaskRecord | null;
  order: OwnedOrderRecord | null;
}): DriverTripNavigationModel {
  const pickup = buildStop("pickup", order?.pickup);
  const dropoff = buildStop("dropoff", order?.dropoff);

  return {
    stops: {
      pickup,
      dropoff,
    },
    authority: getDriverRouteAuthorityCopy(task),
    hasPickupCoordinate: pickup.coordinate !== null,
    hasDropoffCoordinate: dropoff.coordinate !== null,
    hasNavigableRoute:
      pickup.coordinate !== null && dropoff.coordinate !== null,
  };
}

export function getDriverLocationFixState({
  location,
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_FIX_MS,
}: {
  location: DriverLocationFixInput;
  now?: number;
  staleAfterMs?: number;
}): DriverLocationFixState {
  if (!location || !isValidDriverCoordinate(location)) {
    return {
      state: "missing",
      label: "GPS 尚未回報",
      detail: "目前沒有可顯示的司機座標；heartbeat 仍會在權限允許時繼續嘗試。",
      coordinateLabel: null,
    };
  }

  const recordedAtMs = Date.parse(location.recordedAt);
  const ageMs = Number.isNaN(recordedAtMs)
    ? Number.POSITIVE_INFINITY
    : now - recordedAtMs;
  const stale = ageMs > staleAfterMs;
  const ageSeconds = Number.isFinite(ageMs)
    ? Math.max(0, Math.round(ageMs / 1000))
    : null;
  const accuracy =
    typeof location.accuracyM === "number"
      ? `；精度約 ${Math.round(location.accuracyM)}m`
      : "";

  return {
    state: stale ? "stale" : "fresh",
    label: stale ? "GPS 可能過期" : "GPS 即時回報",
    detail:
      ageSeconds == null
        ? `定位時間無法解析${accuracy}。`
        : `最後定位 ${ageSeconds} 秒前${accuracy}。`,
    coordinateLabel: formatDriverCoordinate(location),
  };
}
