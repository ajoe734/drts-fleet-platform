/**
 * MAP-FE-TEN-001 — Tenant console booking map alignment.
 *
 * Drives the real shared `AddressMapPairPicker` embedded in the tenant console
 * booking form (`/bookings/new`) with the geo provider proxy (`/api/geo/*`)
 * stubbed, so the flow is deterministic without a live geo backend:
 *   - search -> candidate selection pins both stops (dispatch-ready coordinates),
 *   - a serviceable evaluation shows the "inside the service area" state,
 *   - a not_serviceable evaluation blocks submission (client half of the
 *     backend serviceability gate — the backend enforces it independently).
 *
 * Run with `playwright.tenant-map-booking.config.ts`, which boots the tenant
 * console dev server. Requires the tenant console page shell to load its
 * directories from the configured backend.
 */
import { expect, test, type Page } from "@playwright/test";

const PICKUP_CANDIDATE = {
  candidateId: "cand-pickup-1",
  provider: "mock",
  providerCandidateId: "cand-pickup-1",
  placeId: "place-pickup-1",
  displayName: "Taipei 101",
  address: "台北市信義區信義路五段 7 號",
  normalizedAddress: "台北市信義區信義路五段 7 號",
  location: { lat: 25.0338, lng: 121.5645 },
  confidence: "exact",
  accuracyM: 5,
};

const DROPOFF_CANDIDATE = {
  candidateId: "cand-dropoff-1",
  provider: "mock",
  providerCandidateId: "cand-dropoff-1",
  placeId: "place-dropoff-1",
  displayName: "Taoyuan Airport T1",
  address: "桃園國際機場第一航廈",
  normalizedAddress: "桃園國際機場第一航廈",
  location: { lat: 25.0797, lng: 121.2342 },
  confidence: "exact",
  accuracyM: 5,
};

function serviceabilityResult(
  decision: "serviceable" | "not_serviceable",
  reason: string,
) {
  return {
    decision,
    serviceProductType: "enterprise_dispatch",
    evaluatedAt: "2026-07-01T00:00:00.000Z",
    stops: [],
    serviceAreaCodes: decision === "serviceable" ? ["core"] : [],
    geometryVersionRefs: ["v1"],
    reasonCodes: [`overall_${decision}`],
    reasonMessages: [reason],
  };
}

async function stubGeoProvider(
  page: Page,
  decision: "serviceable" | "not_serviceable",
) {
  await page.route("**/api/geo/health", (route) =>
    route.fulfill({
      json: { provider: "mock", mode: "mock", status: "healthy" },
    }),
  );
  await page.route("**/api/geo/search**", (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const candidate = q.includes("air") ? DROPOFF_CANDIDATE : PICKUP_CANDIDATE;
    route.fulfill({
      json: {
        candidates: [candidate],
        provider: "mock",
        generatedAt: "2026-07-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/geo/resolve", async (route) => {
    const body = route.request().postDataJSON() as { placeId?: string };
    const candidate =
      body?.placeId === DROPOFF_CANDIDATE.placeId
        ? DROPOFF_CANDIDATE
        : PICKUP_CANDIDATE;
    route.fulfill({
      json: {
        address: {
          address: candidate.address,
          lat: candidate.location.lat,
          lng: candidate.location.lng,
          coordinateSource: "provider_candidate",
          geocodeConfidence: candidate.confidence,
          geocodeProvider: "mock",
        },
        candidate,
        provider: "mock",
        resolvedAt: "2026-07-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/geo/evaluate-service-area", (route) =>
    route.fulfill({
      json: serviceabilityResult(
        decision,
        decision === "serviceable"
          ? "Inside the published service area."
          : "Selected stop is outside the service area.",
      ),
    }),
  );
}

async function pinBothStops(page: Page) {
  const searchInputs = page.getByLabel("Search address");
  // Pickup is the first picker, drop-off the second (pair picker DOM order).
  await searchInputs.first().fill("Taipei 101");
  await page.getByRole("button", { name: "Search" }).first().click();
  await page
    .getByRole("button", {
      name: /Taipei 101[\s\S]*exact/i,
    })
    .first()
    .click();

  await searchInputs.last().fill("Airport");
  await page.getByRole("button", { name: "Search" }).last().click();
  await page
    .getByRole("button", {
      name: /Taoyuan Airport T1[\s\S]*exact/i,
    })
    .first()
    .click();
}

test.describe("tenant console booking map alignment", () => {
  test("serviceable stops pin and clear the service-area state", async ({
    page,
  }) => {
    await stubGeoProvider(page, "serviceable");
    await page.goto("/bookings/new");

    await pinBothStops(page);

    await expect(
      page.getByText("Inside the service area", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Outside the service area", { exact: false }),
    ).toHaveCount(0);
  });

  test("not_serviceable stop blocks booking submission", async ({ page }) => {
    await stubGeoProvider(page, "not_serviceable");
    await page.goto("/bookings/new");

    await pinBothStops(page);

    await expect(
      page.getByText("Outside the service area", { exact: false }).first(),
    ).toBeVisible();

    const submit = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車/,
    });
    await expect(submit).toBeDisabled();
  });

  test("degraded map provider warns but allows service-area submission", async ({ page }) => {
    await stubGeoProvider(page, "serviceable");
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: { provider: "mock", mode: "mock", status: "degraded" },
      })
    );
    
    // Intercept submission to check payload
    let submitPayload = null;
    await page.route("**/api/bookings", async (route) => {
      if (route.request().method() === "POST") {
        submitPayload = route.request().postDataJSON();
        await route.fulfill({ json: { id: "test-booking-123" } });
      } else {
        await route.continue();
      }
    });

    await page.goto("/bookings/new");
    await pinBothStops(page);
    await expect(page.getByText("Inside the service area", { exact: false })).toBeVisible();
    
    // Check degraded CTA
    const submitBtn = page.getByRole("button", { name: "Submit manual review" });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
    
    // Wait for payload
    await page.waitForTimeout(500); // give time for route
    expect(submitPayload).toBeTruthy();
    expect(submitPayload!.mapFallbackReview).toMatchObject({
      providerAvailable: true,
      providerDegraded: true
    });
  });

  test("manual coordinate entry supports routing and outage submission", async ({ page }) => {
    await stubGeoProvider(page, "serviceable");
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: { provider: "mock", mode: "mock", status: "unhealthy", failClosed: true },
      })
    );
    
    // Intercept submission to check payload
    let submitPayload = null;
    await page.route("**/api/bookings", async (route) => {
      if (route.request().method() === "POST") {
        submitPayload = route.request().postDataJSON();
        await route.fulfill({ json: { id: "test-booking-124" } });
      } else {
        await route.continue();
      }
    });

    await page.goto("/bookings/new");

    await page.getByRole("button", { name: "Enter coordinates manually" }).first().click();
    const latInput1 = page.getByLabel("Latitude").first();
    const lngInput1 = page.getByLabel("Longitude").first();
    const reasonInput1 = page.getByLabel("Reason for manual location").first();
    await latInput1.fill("25.047");
    await lngInput1.fill("121.517");
    await reasonInput1.fill("Manual pickup");
    await page.getByRole("button", { name: "Use this location" }).first().click();

    await page.getByRole("button", { name: "Enter coordinates manually" }).last().click();
    const latInput2 = page.getByLabel("Latitude").last();
    const lngInput2 = page.getByLabel("Longitude").last();
    const reasonInput2 = page.getByLabel("Reason for manual location").last();
    await latInput2.fill("25.0797");
    await lngInput2.fill("121.2342");
    await reasonInput2.fill("Manual dropoff");
    await page.getByRole("button", { name: "Use this location" }).last().click();

    await expect(page.getByText("Inside the service area", { exact: false })).toBeVisible();
    
    const submitBtn = page.getByRole("button", { name: "Submit manual review" });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
    
    await page.waitForTimeout(500); // give time for route
    expect(submitPayload).toBeTruthy();
    expect(submitPayload!.mapFallbackReview).toMatchObject({
      providerAvailable: false,
      providerDegraded: true
    });
  });
});
