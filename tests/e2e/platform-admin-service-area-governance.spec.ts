import { expect, test, type Page, type TestInfo } from "@playwright/test";

const generatedAt = "2026-07-01T00:00:00.000Z";

function isPlatformAdminProject(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("platform-admin");
}

async function mockServiceAreaAuthority(page: Page) {
  const serviceAreas = [
    {
      serviceAreaId: "svc-area-e2e-001",
      areaCode: "TAIPEI_CORE",
      displayName: "Taipei core operating area",
      status: "active",
      geometry: {
        type: "polygon",
        coordinates: [
          { lat: 25.0005, lng: 121.4505 },
          { lat: 25.0005, lng: 121.625 },
          { lat: 25.125, lng: 121.625 },
          { lat: 25.125, lng: 121.4505 },
        ],
      },
      serviceProductTypes: ["taxi_realtime", "taxi_reservation"],
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: null,
      version: 2,
      metadata: { source: "e2e" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-06-30T12:00:00.000Z",
    },
  ];

  const stopPolicies = [
    {
      stopPolicyId: "stop-policy-e2e-001",
      policyCode: "TPE_STATION_PICKUP_BLOCK",
      displayName: "Taipei station pickup curb restriction",
      status: "review",
      direction: "pickup",
      effect: "deny",
      geometry: {
        type: "circle",
        center: { lat: 25.0478, lng: 121.517 },
        radiusMeters: 220,
      },
      serviceAreaCodes: ["TAIPEI_CORE"],
      serviceProductTypes: ["taxi_realtime"],
      reasonCode: "PICKUP_NOT_ALLOWED",
      reasonMessage: "Pickup is not allowed at this curb zone.",
      effectiveFrom: "2026-07-10T00:00:00.000Z",
      effectiveUntil: null,
      version: 3,
      metadata: { source: "e2e" },
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-30T12:00:00.000Z",
    },
  ];
  const serviceArea = serviceAreas[0];
  const stopPolicy = stopPolicies[0];

  if (!serviceArea || !stopPolicy) {
    throw new Error("Service-area E2E fixture is incomplete.");
  }

  await page.route(
    "**/control-plane-proxy/service-area/definitions",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { serviceAreas, stopPolicies, generatedAt },
          meta: {
            request_id: "req-service-area-defs-e2e",
            timestamp: generatedAt,
          },
        }),
      });
    },
  );

  await page.route(
    "**/control-plane-proxy/service-area/admin/geojson",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            type: "FeatureCollection",
            generatedAt,
            features: [
              {
                type: "Feature",
                id: "svc-area-e2e-001",
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [121.4505, 25.0005],
                      [121.625, 25.0005],
                      [121.625, 25.125],
                      [121.4505, 25.125],
                      [121.4505, 25.0005],
                    ],
                  ],
                },
                properties: {
                  recordKind: "service_area",
                  serviceAreaId: "svc-area-e2e-001",
                  areaCode: "TAIPEI_CORE",
                  displayName: "Taipei core operating area",
                  status: "active",
                  sourceGeometry: serviceArea.geometry,
                  serviceProductTypes: serviceArea.serviceProductTypes,
                  effectiveFrom: serviceArea.effectiveFrom,
                  effectiveUntil: null,
                  version: 2,
                  geometryVersionRef: "svc_area:TAIPEI_CORE@v2",
                  metadata: { source: "e2e" },
                },
              },
              {
                type: "Feature",
                id: "stop-policy-e2e-001",
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [121.5145, 25.046],
                      [121.5195, 25.046],
                      [121.5195, 25.0495],
                      [121.5145, 25.0495],
                      [121.5145, 25.046],
                    ],
                  ],
                },
                properties: {
                  recordKind: "stop_policy",
                  stopPolicyId: "stop-policy-e2e-001",
                  policyCode: "TPE_STATION_PICKUP_BLOCK",
                  displayName: "Taipei station pickup curb restriction",
                  status: "review",
                  direction: "pickup",
                  effect: "deny",
                  sourceGeometry: stopPolicy.geometry,
                  serviceAreaCodes: ["TAIPEI_CORE"],
                  serviceProductTypes: stopPolicy.serviceProductTypes,
                  reasonCode: "PICKUP_NOT_ALLOWED",
                  reasonMessage: "Pickup is not allowed at this curb zone.",
                  effectiveFrom: stopPolicy.effectiveFrom,
                  effectiveUntil: null,
                  version: 3,
                  geometryVersionRef: "stop_policy:TPE_STATION_PICKUP_BLOCK@v3",
                  metadata: { source: "e2e" },
                },
              },
            ],
          },
          meta: {
            request_id: "req-service-area-geojson-e2e",
            timestamp: generatedAt,
          },
        }),
      });
    },
  );
}

test.describe("platform admin service-area governance", () => {
  test("exposes Gate B governance hooks for service-area lifecycle", async ({
    page,
  }, testInfo) => {
    test.skip(!isPlatformAdminProject(testInfo));

    await mockServiceAreaAuthority(page);

    const response = await page.goto("/service-areas", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();

    await expect(
      page.getByTestId("service-area-governance-page"),
    ).toBeVisible();
    await expect(page.getByTestId("service-area-boundary-table")).toContainText(
      "TAIPEI_CORE",
    );
    await expect(
      page.getByTestId("service-area-stop-policy-table"),
    ).toContainText("TPE_STATION_PICKUP_BLOCK");
    await expect(
      page.getByTestId("service-area-geojson-panel"),
    ).toHaveAttribute("data-geojson-feature-count", "2");
    await expect(
      page.getByTestId("service-area-audit-version-summary"),
    ).toHaveAttribute(
      "data-service-area-version-refs",
      /svc_area:TAIPEI_CORE@v2/,
    );
    await expect(
      page.getByTestId("service-area-sandbox-boundary-warning"),
    ).toHaveAttribute("data-sandbox-operating-areas-owned-by", "/sandbox");
  });
});
