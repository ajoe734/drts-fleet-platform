import { expect, test, type Page } from "@playwright/test";

import {
  getMapGeofenceFixture,
  MAP_GEOFENCE_PROVIDER_UNAVAILABLE_SENTINEL,
} from "../../packages/shared-test-fixtures/src/map-geofence-fixtures";
import { installMockMapGeofenceHarness } from "./map-geofence-harness";

const HARNESS_ORIGIN = "http://map-geofence-harness.local";
const HARNESS_PATH = "/map-geofence-harness";
const HARNESS_URL = `${HARNESS_ORIGIN}${HARNESS_PATH}`;

test.describe("map geofence offline harness", () => {
  test.beforeEach(async ({ page }) => {
    await installHarnessDocument(page);
    await installMockMapGeofenceHarness(page);
    await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-map-geofence-harness='ready']")).toBeVisible();
  });

  test("serves serviceable, no-pickup, and manual-review scenarios via /api", async ({
    page,
  }) => {
    const scenarios = [
      {
        key: "taipei-core" as const,
        serviceProductType: "taxi_realtime",
        expectedDecision: "serviceable",
        expectedReasonCodes: [],
      },
      {
        key: "taipei-station-no-pickup" as const,
        serviceProductType: "taxi_realtime",
        expectedDecision: "not_serviceable",
        expectedReasonCodes: ["PICKUP_NOT_ALLOWED"],
      },
      {
        key: "manual-review-zone" as const,
        serviceProductType: "taxi_realtime",
        expectedDecision: "manual_review",
        expectedReasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
      },
    ];

    const definitions = await browserJson(page, "/api/service-area/definitions");
    expect(definitions.status).toBe(200);
    expect(definitions.body.data.serviceAreas).toHaveLength(2);
    expect(definitions.body.data.stopPolicies).toHaveLength(2);

    for (const scenario of scenarios) {
      const fixture = getMapGeofenceFixture(scenario.key);
      const search = await browserJson(
        page,
        `/api/geo/search?q=${encodeURIComponent(fixture.searchQuery)}&surface=callcenter`,
      );
      expect(search.status).toBe(200);
      expect(search.body.data.candidates[0]).toMatchObject({
        candidateId: fixture.candidate?.candidateId,
      });

      const resolve = await browserJson(page, "/api/geo/resolve", {
        method: "POST",
        body: {
          candidateId: fixture.candidate?.candidateId,
          addressText: fixture.addressText,
          selectedByActorId: "agent-qa-001",
          surface: "callcenter",
        },
      });
      expect(resolve.status).toBe(200);
      expect(resolve.body.data.address).toMatchObject({
        geocodeProvider: "mock",
        coordinateSource: "provider_candidate",
      });

      const evaluate = await browserJson(page, "/api/service-area/evaluate", {
        method: "POST",
        body: {
          serviceProductType: scenario.serviceProductType,
          pickup: {
            lat: resolve.body.data.address.lat,
            lng: resolve.body.data.address.lng,
          },
          dropoff:
            fixture.evaluationExpectations[0]?.dropoff ??
            ({ lat: 25.06, lng: 121.58 } as const),
          requestedAt: "2026-07-01T10:20:00.000Z",
        },
      });

      expect(evaluate.status).toBe(200);
      expect(evaluate.body.data.decision).toBe(scenario.expectedDecision);
      expect(evaluate.body.data.reasonCodes).toEqual(
        scenario.expectedReasonCodes,
      );
    }
  });

  test("mirrors geo and service-area responses through control-plane-proxy", async ({
    page,
  }) => {
    const fixture = getMapGeofenceFixture("taoyuan-airport");

    const health = await browserJson(page, "/control-plane-proxy/api/geo/health");
    expect(health.status).toBe(200);
    expect(health.body.data).toMatchObject({
      provider: "mock",
      mode: "mock",
      status: "healthy",
    });

    const search = await browserJson(
      page,
      `/control-plane-proxy/api/geo/search?q=${encodeURIComponent(fixture.searchQuery)}&surface=callcenter`,
    );
    expect(search.status).toBe(200);
    expect(search.body.data.candidates[0]).toMatchObject({
      candidateId: fixture.candidate?.candidateId,
    });

    const geoJson = await browserJson(
      page,
      "/control-plane-proxy/api/service-area/admin/geojson",
    );
    expect(geoJson.status).toBe(200);
    expect(geoJson.body.data.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          properties: expect.objectContaining({
            areaCode: "TAOYUAN_AIRPORT",
          }),
        }),
      ]),
    );

    const airportTransfer = await browserJson(
      page,
      "/control-plane-proxy/api/service-area/evaluate",
      {
        method: "POST",
        body: {
          serviceProductType: "credit_card_airport_transfer",
          pickup: fixture.candidate?.location,
          requestedAt: "2026-07-01T10:20:00.000Z",
        },
      },
    );
    expect(airportTransfer.status).toBe(200);
    expect(airportTransfer.body.data).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["TAOYUAN_AIRPORT"],
    });

    const taxiRealtime = await browserJson(
      page,
      "/control-plane-proxy/api/service-area/evaluate",
      {
        method: "POST",
        body: {
          serviceProductType: "taxi_realtime",
          pickup: fixture.candidate?.location,
          requestedAt: "2026-07-01T10:20:00.000Z",
        },
      },
    );
    expect(taxiRealtime.status).toBe(200);
    expect(taxiRealtime.body.data).toMatchObject({
      decision: "not_serviceable",
      reasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
    });
  });

  test("simulates provider-unavailable and no-geocode states", async ({
    page,
  }) => {
    const providerUnavailable = await browserJson(
      page,
      `/api/geo/search?q=${encodeURIComponent(MAP_GEOFENCE_PROVIDER_UNAVAILABLE_SENTINEL)}&surface=callcenter`,
    );
    expect(providerUnavailable.status).toBe(503);
    expect(providerUnavailable.body.error).toMatchObject({
      code: "GEO_PROVIDER_UNAVAILABLE",
      retryable: true,
    });

    const noGeocodeFixture = getMapGeofenceFixture("no-geocode");
    const noGeocodeSearch = await browserJson(
      page,
      `/api/geo/search?q=${encodeURIComponent(noGeocodeFixture.searchQuery)}&surface=callcenter`,
    );
    expect(noGeocodeSearch.status).toBe(200);
    expect(noGeocodeSearch.body.data.candidates).toEqual([]);

    const unresolved = await browserJson(page, "/api/geo/resolve", {
      method: "POST",
      body: {
        addressText: noGeocodeFixture.addressText,
        surface: "callcenter",
      },
    });
    expect(unresolved.status).toBe(404);
    expect(unresolved.body.error).toMatchObject({
      code: "GEO_CANDIDATE_NOT_FOUND",
    });
  });

  test("renders mock map tiles without a live provider", async ({ page }) => {
    await page.setContent(
      `<main><img alt="mock map tile" data-map-tile src="/mock-map-tiles/0/0/0.svg" /></main>`,
    );
    const tile = page.locator("[data-map-tile]");
    await expect(tile).toBeVisible();
    await expect
      .poll(async () =>
        tile.evaluate((node) => ({
          width: (node as HTMLImageElement).naturalWidth,
          complete: (node as HTMLImageElement).complete,
        })),
      )
      .toEqual({
        width: 256,
        complete: true,
      });
  });
});

async function installHarnessDocument(page: Page) {
  await page.route(HARNESS_URL, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
      body: `<!doctype html><html><body><main data-map-geofence-harness="ready">offline map geofence harness</main></body></html>`,
    });
  });
}

async function browserJson(
  page: Page,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
) {
  return page.evaluate(
    async ({ path: requestPath, init: requestInit }) => {
      const request = {
        method: requestInit?.method ?? "GET",
        headers: {
          ...(requestInit?.body ? { "Content-Type": "application/json" } : {}),
          ...(requestInit?.headers ?? {}),
        },
        ...(requestInit?.body
          ? { body: JSON.stringify(requestInit.body) }
          : {}),
      };
      const response = await fetch(requestPath, {
        ...request,
      });
      const body = await response.json();
      return {
        status: response.status,
        body,
      };
    },
    {
      path,
      init,
    },
  );
}
