import type {
  EvaluateServiceAreaCommand,
  GeoPoint,
  GeoResolutionSurface,
  ResolveAddressCommand,
  ReverseGeocodeCommand,
  SearchGeoQuery,
} from "@drts/contracts";
import type { Page, Route } from "@playwright/test";

import {
  buildMapGeofenceGeoHealthEnvelope,
  buildMapGeofenceResolveEnvelope,
  buildMapGeofenceReverseEnvelope,
  buildMapGeofenceSearchEnvelope,
  buildMapGeofenceServiceAreaDefinitionsEnvelope,
  buildMapGeofenceServiceAreaEnvelope,
  buildMapGeofenceServiceAreaGeoJsonEnvelope,
  getMapGeofenceFixture,
  type MapGeofenceFixtureKey,
  MapGeofenceFixtureError,
} from "../../packages/shared-test-fixtures/src/map-geofence-fixtures";

const MOCK_MAP_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#eef7f1"/><path d="M0 128h256M128 0v256" stroke="#8fb9a4" stroke-width="4"/><circle cx="128" cy="128" r="18" fill="#0f766e"/></svg>`;
const MOCK_MAP_HARNESS_REQUEST_ID = "req-map-geofence-harness";

type HarnessRouteBody = {
  fixtureKey?: MapGeofenceFixtureKey;
  [key: string]: unknown;
};

export interface InstallMockMapGeofenceHarnessOptions {
  defaultFixtureKey?: MapGeofenceFixtureKey;
}

export async function installMockMapTileRoutes(page: Page) {
  await page.route("**/mock-map-tiles/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "image/svg+xml",
      },
      body: MOCK_MAP_TILE_SVG,
    });
  });
}

export async function installMockMapGeofenceHarness(
  page: Page,
  options: InstallMockMapGeofenceHarnessOptions = {},
) {
  await installMockMapTileRoutes(page);

  await page.route("**/control-plane-proxy/**", async (route) => {
    const url = new URL(route.request().url());
    const normalizedPath = normalizeHarnessPath(url.pathname);
    const handled = await handleHarnessRoute(route, normalizedPath, options);
    if (!handled) {
      await route.continue();
    }
  });

  await page.route("**/api/geo/**", async (route) => {
    const url = new URL(route.request().url());
    const normalizedPath = normalizeHarnessPath(url.pathname);
    const handled = await handleHarnessRoute(route, normalizedPath, options);
    if (!handled) {
      await route.continue();
    }
  });

  await page.route("**/api/service-area/**", async (route) => {
    const url = new URL(route.request().url());
    const normalizedPath = normalizeHarnessPath(url.pathname);
    const handled = await handleHarnessRoute(route, normalizedPath, options);
    if (!handled) {
      await route.continue();
    }
  });
}

async function handleHarnessRoute(
  route: Route,
  normalizedPath: string,
  options: InstallMockMapGeofenceHarnessOptions,
) {
  try {
    switch (normalizedPath) {
      case "/geo/health":
        await fulfillJson(route, 200, buildMapGeofenceGeoHealthEnvelope());
        return true;
      case "/geo/search":
        await handleSearchRoute(route, options);
        return true;
      case "/geo/resolve":
        await handleResolveRoute(route, options);
        return true;
      case "/geo/reverse":
        await handleReverseRoute(route, options);
        return true;
      case "/service-area/evaluate":
        await handleServiceAreaEvaluateRoute(route, options);
        return true;
      case "/service-area/definitions":
        await fulfillJson(
          route,
          200,
          buildMapGeofenceServiceAreaDefinitionsEnvelope(requestIdFrom(route)),
        );
        return true;
      case "/service-area/admin/geojson":
      case "/service-area/geojson":
        await fulfillJson(
          route,
          200,
          buildMapGeofenceServiceAreaGeoJsonEnvelope(requestIdFrom(route)),
        );
        return true;
      default:
        return false;
    }
  } catch (error) {
    if (error instanceof MapGeofenceFixtureError) {
      await fulfillJson(route, error.statusCode, error.envelope);
      return true;
    }
    throw error;
  }
}

async function handleSearchRoute(
  route: Route,
  options: InstallMockMapGeofenceHarnessOptions,
) {
  const url = new URL(route.request().url());
  const fixture = resolveFixtureFromRoute(route, options, null);
  const near = readPointFromSearchParams(url.searchParams, "near");
  const limit = readNumber(url.searchParams.get("limit"));
  const command: SearchGeoQuery = {
    q: url.searchParams.get("q") ?? fixture?.searchQuery ?? "",
    surface:
      (url.searchParams.get("surface") as GeoResolutionSurface | null) ??
      "unknown",
    ...(near ? { near } : {}),
    ...(limit !== null ? { limit } : {}),
  };
  await fulfillJson(
    route,
    200,
    buildMapGeofenceSearchEnvelope(command, requestIdFrom(route)),
  );
}

async function handleResolveRoute(
  route: Route,
  options: InstallMockMapGeofenceHarnessOptions,
) {
  const body = readJsonBody(route) as ResolveAddressCommand & HarnessRouteBody;
  const fixture = resolveFixtureFromRoute(route, options, body);
  const candidateId = coalesceNullableString(
    body.candidateId,
    fixture?.candidate?.candidateId,
  );
  const providerCandidateId = coalesceNullableString(
    body.providerCandidateId,
    fixture?.candidate?.providerCandidateId,
  );
  const placeId = coalesceNullableString(
    body.placeId,
    fixture?.candidate?.placeId,
  );
  const selectedByActorId = coalesceNullableString(
    body.selectedByActorId,
    null,
  );
  const manualOverrideReason = coalesceNullableString(
    body.manualOverrideReason,
    null,
  );
  const selectedPoint = body.selectedPoint as GeoPoint | null | undefined;
  const command: ResolveAddressCommand = {
    addressText:
      coalesceRequiredString(body.addressText, fixture?.addressText) ?? "",
    surface: (body.surface as GeoResolutionSurface | undefined) ?? "unknown",
    ...(candidateId !== undefined ? { candidateId } : {}),
    ...(providerCandidateId !== undefined ? { providerCandidateId } : {}),
    ...(placeId !== undefined ? { placeId } : {}),
    ...(selectedPoint !== undefined ? { selectedPoint } : {}),
    ...(selectedByActorId !== undefined ? { selectedByActorId } : {}),
    ...(manualOverrideReason !== undefined ? { manualOverrideReason } : {}),
  };
  await fulfillJson(
    route,
    200,
    buildMapGeofenceResolveEnvelope(command, requestIdFrom(route)),
  );
}

async function handleReverseRoute(
  route: Route,
  options: InstallMockMapGeofenceHarnessOptions,
) {
  const body = readJsonBody(route) as ReverseGeocodeCommand & HarnessRouteBody;
  const fixture = resolveFixtureFromRoute(route, options, body);
  const requestedByActorId = coalesceNullableString(
    body.requestedByActorId,
    null,
  );
  const command: ReverseGeocodeCommand = {
    location: (body.location as GeoPoint | undefined) ??
      fixture?.reverseProbeLocation ??
      fixture?.candidate?.location ?? { lat: 25.0375, lng: 121.5637 },
    surface: (body.surface as GeoResolutionSurface | undefined) ?? "unknown",
    ...(requestedByActorId !== undefined ? { requestedByActorId } : {}),
  };
  await fulfillJson(
    route,
    200,
    buildMapGeofenceReverseEnvelope(command, requestIdFrom(route)),
  );
}

async function handleServiceAreaEvaluateRoute(
  route: Route,
  options: InstallMockMapGeofenceHarnessOptions,
) {
  const body = readJsonBody(route) as EvaluateServiceAreaCommand &
    HarnessRouteBody;
  const fixture = resolveFixtureFromRoute(route, options, body);
  const expectation = fixture?.evaluationExpectations[0];
  const requestedAt = coalesceRequiredString(body.requestedAt, undefined);
  const dropoff =
    (body.dropoff as GeoPoint | null | undefined) ??
    expectation?.dropoff ??
    undefined;
  const command: EvaluateServiceAreaCommand = {
    serviceProductType:
      (body.serviceProductType as
        | EvaluateServiceAreaCommand["serviceProductType"]
        | undefined) ??
      expectation?.serviceProductType ??
      "taxi_realtime",
    pickup: (body.pickup as GeoPoint | undefined) ??
      fixture?.candidate?.location ?? { lat: 25.0375, lng: 121.5637 },
    ...(dropoff !== undefined ? { dropoff } : {}),
    ...(requestedAt !== undefined ? { requestedAt } : {}),
  };
  await fulfillJson(
    route,
    200,
    buildMapGeofenceServiceAreaEnvelope(command, requestIdFrom(route)),
  );
}

function normalizeHarnessPath(pathname: string) {
  const withoutProxy = pathname.startsWith("/control-plane-proxy/")
    ? pathname.slice("/control-plane-proxy".length)
    : pathname;
  return withoutProxy.startsWith("/api/")
    ? withoutProxy.slice("/api".length)
    : withoutProxy;
}

function resolveFixtureFromRoute(
  route: Route,
  options: InstallMockMapGeofenceHarnessOptions,
  body: HarnessRouteBody | null,
) {
  const url = new URL(route.request().url());
  const requestedKey =
    body?.fixtureKey ??
    (route.request().headers()["x-drts-map-fixture"] as
      | MapGeofenceFixtureKey
      | undefined) ??
    (url.searchParams.get("fixture") as MapGeofenceFixtureKey | null) ??
    options.defaultFixtureKey ??
    null;
  if (!requestedKey) {
    return null;
  }
  return getMapGeofenceFixture(requestedKey);
}

function requestIdFrom(route: Route) {
  return (
    route.request().headers()["x-request-id"] ?? MOCK_MAP_HARNESS_REQUEST_ID
  );
}

function readJsonBody(route: Route) {
  const payload = route.request().postData();
  if (!payload) {
    return {};
  }
  return JSON.parse(payload) as HarnessRouteBody;
}

function readPointFromSearchParams(
  searchParams: URLSearchParams,
  prefix: string,
) {
  const lat = readNumber(searchParams.get(`${prefix}Lat`));
  const lng = readNumber(searchParams.get(`${prefix}Lng`));
  if (lat === null || lng === null) {
    return null;
  }
  return { lat, lng };
}

function readNumber(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coalesceNullableString(
  value: unknown,
  fallback: string | null | undefined,
): string | null | undefined {
  return typeof value === "string" ? value : fallback;
}

function coalesceRequiredString(
  value: unknown,
  fallback: string | undefined,
): string | undefined {
  return typeof value === "string" ? value : fallback;
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
}
