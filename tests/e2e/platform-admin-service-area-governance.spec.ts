import { expect, test, type Page, type TestInfo } from "@playwright/test";

const generatedAt = "2026-07-01T00:00:00.000Z";

function isPlatformAdminProject(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("platform-admin");
}

async function mockServiceAreaAuthority(page: Page) {
  let stopPolicyStatus = "review";
  let stopPolicyVersion = 3;

  const buildServiceAreas = () => [
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

  const buildStopPolicies = () => [
    {
      stopPolicyId: "stop-policy-e2e-001",
      policyCode: "TPE_STATION_PICKUP_BLOCK",
      displayName: "Taipei station pickup curb restriction",
      status: stopPolicyStatus,
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
      version: stopPolicyVersion,
      metadata: { source: "e2e" },
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-30T12:00:00.000Z",
    },
  ];
  const serviceArea = buildServiceAreas()[0];
  const stopPolicy = buildStopPolicies()[0];

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
          data: {
            serviceAreas: buildServiceAreas(),
            stopPolicies: buildStopPolicies(),
            generatedAt,
          },
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
      const currentServiceArea = buildServiceAreas()[0]!;
      const currentStopPolicy = buildStopPolicies()[0]!;
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
                  sourceGeometry: currentServiceArea.geometry,
                  serviceProductTypes: currentServiceArea.serviceProductTypes,
                  effectiveFrom: currentServiceArea.effectiveFrom,
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
                  status: currentStopPolicy.status,
                  direction: "pickup",
                  effect: "deny",
                  sourceGeometry: currentStopPolicy.geometry,
                  serviceAreaCodes: ["TAIPEI_CORE"],
                  serviceProductTypes: currentStopPolicy.serviceProductTypes,
                  reasonCode: "PICKUP_NOT_ALLOWED",
                  reasonMessage: "Pickup is not allowed at this curb zone.",
                  effectiveFrom: currentStopPolicy.effectiveFrom,
                  effectiveUntil: null,
                  version: currentStopPolicy.version,
                  geometryVersionRef: `stop_policy:TPE_STATION_PICKUP_BLOCK@v${currentStopPolicy.version}`,
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

  await page.route(
    "**/control-plane-proxy/service-area/evaluate",
    async (route) => {
      const body = route.request().postDataJSON() as {
        pickup?: { lat: number; lng: number };
        dropoff?: { lat: number; lng: number };
      };
      const isOutsideControl =
        body.pickup && body.pickup.lat > 25.2 && body.pickup.lng > 121.8;
      const decision = isOutsideControl ? "serviceable" : "not_serviceable";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            decision,
            serviceProductType: "taxi_realtime",
            evaluatedAt: generatedAt,
            stops: [
              {
                kind: "pickup",
                location: body.pickup,
                serviceAreaCodes: ["TAIPEI_CORE"],
                policyCodes: isOutsideControl
                  ? []
                  : ["TPE_STATION_PICKUP_BLOCK"],
                geometryVersionRefs: [
                  `stop_policy:TPE_STATION_PICKUP_BLOCK@v${stopPolicyVersion}`,
                ],
                decision,
                reasonCodes: isOutsideControl ? [] : ["PICKUP_NOT_ALLOWED"],
                reasonMessages: isOutsideControl
                  ? []
                  : ["Pickup is not allowed at this curb zone."],
              },
            ],
            serviceAreaCodes: ["TAIPEI_CORE"],
            geometryVersionRefs: [
              `stop_policy:TPE_STATION_PICKUP_BLOCK@v${stopPolicyVersion}`,
            ],
            reasonCodes: isOutsideControl ? [] : ["PICKUP_NOT_ALLOWED"],
            reasonMessages: isOutsideControl
              ? []
              : ["Pickup is not allowed at this curb zone."],
          },
          meta: {
            request_id: "req-service-area-evaluate-e2e",
            timestamp: generatedAt,
          },
        }),
      });
    },
  );

  await page.route(
    "**/control-plane-proxy/service-area/admin/stop-policies/stop-policy-e2e-001/publish",
    async (route) => {
      stopPolicyStatus = "active";
      stopPolicyVersion = 4;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            stopPolicy: buildStopPolicies()[0],
            auditId: "audit-stop-policy-publish-e2e",
            generatedAt,
          },
          meta: {
            request_id: "req-service-area-publish-e2e",
            timestamp: generatedAt,
          },
        }),
      });
    },
  );

  await page.route(
    "**/control-plane-proxy/service-area/admin/stop-policies/stop-policy-e2e-001/retire",
    async (route) => {
      stopPolicyStatus = "retired";
      stopPolicyVersion = 5;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            stopPolicy: buildStopPolicies()[0],
            auditId: "audit-stop-policy-retire-e2e",
            generatedAt,
          },
          meta: {
            request_id: "req-service-area-retire-e2e",
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

    await page.getByTestId("stop-policy-row-TPE_STATION_PICKUP_BLOCK").click();
    await expect(
      page.getByTestId("service-area-geometry-editor"),
    ).toHaveAttribute("data-geometry-type", "circle");
    await expect(
      page.getByTestId("service-area-geometry-editor"),
    ).toHaveAttribute("data-validation-state", "valid");

    await page
      .getByTestId("service-area-audit-reason")
      .fill("Gate B e2e policy board approval");
    await page
      .getByRole("button", { name: "Run affected sample preview" })
      .click();
    await expect(
      page.getByTestId("service-area-affected-preview"),
    ).toHaveAttribute("data-preview-state", "fresh");
    await expect(
      page.getByTestId("service-area-affected-preview"),
    ).toHaveAttribute("data-preview-blocked", "2");
    await expect(
      page.getByTestId("service-area-affected-sample-target-pickup"),
    ).toHaveAttribute("data-evaluator-decision", "not_serviceable");
    await expect(
      page.getByTestId("service-area-affected-preview"),
    ).toHaveAttribute(
      "data-preview-version-refs",
      /stop_policy:TPE_STATION_PICKUP_BLOCK@v3/,
    );

    await page.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByTestId("service-area-mutation-receipt"),
    ).toHaveAttribute("data-audit-id", "audit-stop-policy-publish-e2e");
    await expect(
      page.getByTestId("service-area-mutation-receipt"),
    ).toHaveAttribute(
      "data-mutation-version-ref",
      "stop_policy:TPE_STATION_PICKUP_BLOCK@v4",
    );

    await page
      .getByTestId("service-area-audit-reason")
      .fill("Gate B e2e rollback after policy verification");
    await page.getByRole("button", { name: "Retire" }).click();
    await expect(
      page.getByTestId("service-area-mutation-receipt"),
    ).toHaveAttribute("data-audit-id", "audit-stop-policy-retire-e2e");
    await expect(
      page.getByTestId("service-area-mutation-receipt"),
    ).toHaveAttribute(
      "data-mutation-version-ref",
      "stop_policy:TPE_STATION_PICKUP_BLOCK@v5",
    );
  });
});
