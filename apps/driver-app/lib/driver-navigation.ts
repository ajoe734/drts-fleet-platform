import {
  DRIVER_TASK_TRANSITIONS,
  type AddressPayload,
  type DriverTaskRecord,
  type OwnedOrderRecord,
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
};

export type DriverRouteAuthorityKind = "drts_owned" | "forwarded_platform";

export type DriverRouteAuthorityCopy = {
  kind: DriverRouteAuthorityKind;
  locked: boolean;
  /** One plain line for the driver; null when there is nothing to say. */
  notice: string | null;
};

/** Shown on a stop card and in the alert when a stop cannot be navigated. */
export const DRIVER_MISSING_COORDINATE_COPY =
  "這個地點沒有座標，請聯絡派車台。";

/** Shown on forwarded trips: the source platform decides the route. */
export const DRIVER_FORWARDED_ROUTE_COPY =
  "此單路線由平台決定，要改路線請先聯絡派車台。";

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
  state: "fresh" | "stale" | "missing" | "stopped";
  label: string;
  detail: string;
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
        url:
          platform === "android"
            ? buildAndroidGoogleNavigationUrl(coordinate)
            : buildGoogleMapsAppNavigationUrl(coordinate),
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
      message: DRIVER_MISSING_COORDINATE_COPY,
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
    message:
      "無法開啟導航 App，請把畫面上的座標輸入地圖 App，或聯絡派車台協助。",
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
  };
}

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function getDriverRouteAuthorityCopy(
  task: DriverTaskRecord | null,
): DriverRouteAuthorityCopy {
  if (!task?.sourcePlatform) {
    return { kind: "drts_owned", locked: false, notice: null };
  }

  return {
    kind: "forwarded_platform",
    locked:
      readOptionalBoolean((task as { routeLocked?: unknown }).routeLocked) ??
      true,
    notice: DRIVER_FORWARDED_ROUTE_COPY,
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
  task,
  location,
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_FIX_MS,
}: {
  task: DriverTaskRecord | null;
  location: DriverLocationFixInput;
  now?: number;
  staleAfterMs?: number;
}): DriverLocationFixState {
  if (task && DRIVER_TASK_TRANSITIONS[task.status].length === 0) {
    return {
      state: "stopped",
      label: "本任務定位已停止",
      detail: "任務已結束，不再回報你的位置。",
    };
  }

  if (!location || !isValidDriverCoordinate(location)) {
    return {
      state: "missing",
      label: "GPS 尚未回報",
      detail: "還沒收到你的位置；開啟定位權限後會自動更新。",
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
      ? `；誤差約 ${Math.round(location.accuracyM)} 公尺`
      : "";

  return {
    state: stale ? "stale" : "fresh",
    label: stale ? "GPS 可能過期" : "GPS 即時回報",
    detail:
      ageSeconds == null
        ? `定位時間無法判讀${accuracy}。`
        : `最後定位 ${ageSeconds} 秒前${accuracy}。`,
  };
}

export type DriverTabKey =
  | "workbench"
  | "jobs"
  | "trip"
  | "platform"
  | "settings";

export type DriverTabDefinition = {
  readonly key: DriverTabKey;
  readonly routeName: string;
  readonly href: string;
  readonly title: string;
  readonly icon: string;
  readonly activeIcon: string;
  readonly accessibilityLabel: string;
  readonly testID: string;
};

export const DRIVER_TABS: readonly DriverTabDefinition[] = [
  {
    key: "workbench",
    routeName: "index",
    href: "/",
    title: "工作台",
    icon: "speedometer-outline",
    activeIcon: "speedometer",
    accessibilityLabel: "工作台分頁",
    testID: "driver-tab-workbench",
  },
  {
    key: "jobs",
    routeName: "jobs",
    href: "/jobs",
    title: "任務",
    icon: "list-outline",
    activeIcon: "list",
    accessibilityLabel: "任務分頁",
    testID: "driver-tab-jobs",
  },
  {
    key: "trip",
    routeName: "trip",
    href: "/trip",
    title: "行程",
    icon: "navigate-outline",
    activeIcon: "navigate",
    accessibilityLabel: "行程分頁",
    testID: "driver-tab-trip",
  },
  {
    key: "platform",
    routeName: "platform-presence",
    href: "/platform-presence",
    title: "平台",
    icon: "layers-outline",
    activeIcon: "layers",
    accessibilityLabel: "平台分頁",
    testID: "driver-tab-platform",
  },
  {
    key: "settings",
    routeName: "settings",
    href: "/settings",
    title: "設定",
    icon: "settings-outline",
    activeIcon: "settings",
    accessibilityLabel: "設定分頁",
    testID: "driver-tab-settings",
  },
] as const;

export const DRIVER_ROUTE_TAB_MAP: Record<string, DriverTabKey> = {
  "": "workbench",
  index: "workbench",
  jobs: "jobs",
  trip: "trip",
  "platform-presence": "platform",
  settings: "settings",
  // Sub-screens
  onboarding: "workbench",
  earnings: "settings",
  shift: "workbench",
  sos: "trip",
  incident: "trip",
  "safety-operator": "settings",
};

export function resolveActiveDriverTab(
  routeName: string | undefined | null,
  tabOverride?: DriverTabKey | null,
): DriverTabKey {
  if (tabOverride) {
    return tabOverride;
  }

  if (!routeName) {
    return "workbench";
  }

  const cleanName = routeName.replace(/^\//, "");
  return DRIVER_ROUTE_TAB_MAP[cleanName] ?? "workbench";
}

export function isDriverTabRoute(routeName: string): boolean {
  const cleanName = routeName.replace(/^\//, "");
  return DRIVER_TABS.some((tab) => tab.routeName === cleanName);
}
