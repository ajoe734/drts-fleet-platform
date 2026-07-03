import type { Page, Route } from "@playwright/test";

import {
  MAP_FIXTURE_GENERATED_AT,
  MAP_GEO_NO_MATCH_QUERY,
  MAP_GEO_PROVIDER_UNAVAILABLE_QUERY,
  buildMapFixtureNoGeocodeResponse,
  buildMapFixtureProviderUnavailableError,
  buildMapFixtureGeoSearchResponse,
  buildMapFixtureResolveResponse,
  buildMapFixtureServiceAreaEvaluation,
  findMapGeofenceFixtureByCandidateId,
  findMapGeofenceFixtureByQuery,
  mapFixtureEnvelope,
  type MapFixturePoint,
  type MapFixtureServiceProductType,
  type MapFixtureSurface,
} from "../../packages/shared-test-fixtures/src";

type JsonRecord = Record<string, unknown>;

export interface MapGeofenceMockRouteOptions {
  now?: string;
  requestId?: string;
  providerUnavailable?: boolean;
}

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export async function installMapGeofenceMockRoutes(
  page: Page,
  options: MapGeofenceMockRouteOptions = {},
) {
  const now = options.now ?? MAP_FIXTURE_GENERATED_AT;
  const requestId = options.requestId ?? "req-map-geofence-playwright";

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const normalizedPath = normalizeMapApiPath(url.pathname);
    if (!normalizedPath) {
      await route.fallback();
      return;
    }

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: JSON_HEADERS });
      return;
    }

    if (options.providerUnavailable && normalizedPath.startsWith("/geo/")) {
      await fulfillProviderUnavailable(route, requestId, now);
      return;
    }

    if (normalizedPath === "/geo/search") {
      await fulfillGeoSearch(route, url, requestId, now);
      return;
    }
    if (normalizedPath === "/geo/resolve") {
      await fulfillGeoResolve(
        route,
        request.postDataJSON() as JsonRecord,
        requestId,
        now,
      );
      return;
    }
    if (normalizedPath === "/service-area/evaluate") {
      await fulfillServiceAreaEvaluate(
        route,
        request.postDataJSON() as JsonRecord,
        requestId,
        now,
      );
      return;
    }

    await route.fallback();
  });
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

function normalizeMapApiPath(pathname: string) {
  const withoutApi = pathname.replace(/^\/api(?=\/|$)/, "");
  if (
    withoutApi.startsWith("/geo/") ||
    withoutApi.startsWith("/service-area/")
  ) {
    return withoutApi;
  }

  const withoutProxy = pathname.replace(/^\/control-plane-proxy(?=\/|$)/, "");
  if (
    withoutProxy.startsWith("/geo/") ||
    withoutProxy.startsWith("/service-area/")
  ) {
    return withoutProxy;
  }

  return null;
}

async function fulfillGeoSearch(
  route: Route,
  url: URL,
  requestId: string,
  now: string,
) {
  const query = url.searchParams.get("q") ?? "";
  if (query === MAP_GEO_PROVIDER_UNAVAILABLE_QUERY) {
    await fulfillProviderUnavailable(route, requestId, now);
    return;
  }
  if (!query.trim() || query === MAP_GEO_NO_MATCH_QUERY) {
    await fulfillJson(route, buildMapFixtureNoGeocodeResponse(requestId, now));
    return;
  }

  const fixture = findMapGeofenceFixtureByQuery(query);
  await fulfillJson(
    route,
    mapFixtureEnvelope(
      buildMapFixtureGeoSearchResponse(fixture ? [fixture] : [], now),
      requestId,
      now,
    ),
  );
}

async function fulfillGeoResolve(
  route: Route,
  body: JsonRecord,
  requestId: string,
  now: string,
) {
  const candidateKey = firstString(
    body.candidateId,
    body.providerCandidateId,
    body.placeId,
  );
  const fixture = candidateKey
    ? findMapGeofenceFixtureByCandidateId(candidateKey)
    : null;

  if (!fixture) {
    await fulfillJson(
      route,
      {
        error: {
          code: "GEO_CANDIDATE_NOT_FOUND",
          message: "No mock geocode candidate matched the resolve command.",
          retryable: false,
        },
        meta: { requestId, timestamp: now },
      },
      404,
    );
    return;
  }

  await fulfillJson(
    route,
    mapFixtureEnvelope(
      buildMapFixtureResolveResponse(
        fixture,
        asSurface(body.surface),
        firstString(body.selectedByActorId),
        now,
      ),
      requestId,
      now,
    ),
  );
}

async function fulfillServiceAreaEvaluate(
  route: Route,
  body: JsonRecord,
  requestId: string,
  now: string,
) {
  await fulfillJson(
    route,
    mapFixtureEnvelope(
      buildMapFixtureServiceAreaEvaluation(
        {
          serviceProductType: asServiceProductType(body.serviceProductType),
          pickup: asPoint(body.pickup),
          dropoff: body.dropoff ? asPoint(body.dropoff) : null,
        },
        now,
      ),
      requestId,
      now,
    ),
  );
}

async function fulfillProviderUnavailable(
  route: Route,
  requestId: string,
  now: string,
) {
  await fulfillJson(
    route,
    buildMapFixtureProviderUnavailableError(requestId, now),
    503,
  );
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

function firstString(...values: unknown[]) {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function asSurface(value: unknown): MapFixtureSurface {
  return typeof value === "string" ? (value as MapFixtureSurface) : "unknown";
}

function asServiceProductType(value: unknown): MapFixtureServiceProductType {
  return typeof value === "string"
    ? (value as MapFixtureServiceProductType)
    : "taxi_realtime";
}

function asPoint(value: unknown): MapFixturePoint {
  const candidate = value as Partial<MapFixturePoint> | null;
  return {
    lat: Number(candidate?.lat),
    lng: Number(candidate?.lng),
  };
}

const MOCK_MAP_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#eef7f1"/><path d="M0 128h256M128 0v256" stroke="#8fb9a4" stroke-width="4"/><circle cx="128" cy="128" r="18" fill="#0f766e"/></svg>`;
