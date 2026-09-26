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

test.use({
  storageState: {
    cookies: [
      {
        name: "drts_tenant_session",
        value: "mock-session",
        domain: "127.0.0.1",
        path: "/",
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
      {
        name: "tenant-portal-session",
        value:
          "eyJhY2Nlc3NUb2tlbiI6Im1vY2stdG9rZW4iLCJ0ZW5hbnRJZCI6InRlbmFudC1lbWJlZC0wMDEiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJmdWxsTmFtZSI6IlRlc3QgVXNlciIsInJvbGVDb2RlIjoidGVuYW50X2FkbWluIn0",
        domain: "127.0.0.1",
        path: "/",
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
      {
        name: "drts_session",
        value: "mock-session",
        domain: "127.0.0.1",
        path: "/",
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  },
});

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
  await page
    .getByRole("button", { name: /Search/ })
    .first()
    .click();
  await page
    .getByRole("button", {
      name: /Taipei 101[\s\S]*exact/i,
    })
    .first()
    .click();

  await searchInputs.last().fill("Airport");
  await page
    .getByRole("button", { name: /Search/ })
    .last()
    .click();
  await page
    .getByRole("button", {
      name: /Taoyuan Airport T1[\s\S]*exact/i,
    })
    .first()
    .click();
}

async function fillProgramFields(page: Page) {
  await page.getByLabel(/Passenger name|乘客姓名/).fill("John Doe");
  await page.getByLabel(/Passenger phone|乘客電話/).fill("0912345678");

  const costCenterSelect = page.getByLabel(/Cost center|成本中心/i);
  if (await costCenterSelect.isVisible()) {
    await costCenterSelect.selectOption({ index: 1 });
  }
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
    await fillProgramFields(page);

    await expect(
      page.getByText("Outside the service area", { exact: false }).first(),
    ).toBeVisible();

    const submit = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車/,
    });
    await expect(submit).toBeDisabled();
  });

  test("degraded map provider warns but allows service-area submission", async ({
    page,
  }) => {
    await stubGeoProvider(page, "serviceable");
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: { provider: "mock", mode: "mock", status: "degraded" },
      }),
    );

    // Intercept submission to check payload
    let submitPayload = null;
    await page.route("**/api/bookings/create", async (route) => {
      if (route.request().method() === "POST") {
        submitPayload = route.request().postDataJSON();
        await route.fulfill({
          json: { booking: { bookingId: "test-booking-123" } },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/bookings/new");
    await pinBothStops(page);
    await fillProgramFields(page);
    await expect(
      page.getByText("Inside the service area", { exact: false }),
    ).toBeVisible();

    // Check degraded CTA
    const submitBtn = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車/,
    });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Wait for payload
    await page.waitForTimeout(500); // give time for route
    expect(submitPayload).toBeTruthy();
    expect(submitPayload!.mapFallbackReview).toBeUndefined();
  });

  test("manual coordinate entry supports routing and outage submission", async ({
    page,
  }) => {
    await stubGeoProvider(page, "serviceable");
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: {
          provider: "mock",
          mode: "mock",
          status: "unhealthy",
          failClosed: true,
        },
      }),
    );

    // Intercept submission to check payload
    let submitPayload = null;
    await page.route("**/api/bookings/create", async (route) => {
      if (route.request().method() === "POST") {
        submitPayload = route.request().postDataJSON();
        await route.fulfill({
          json: { booking: { bookingId: "test-booking-124" } },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/bookings/new");

    const latInput1 = page.getByLabel(/Latitude|緯度/i).first();
    const lngInput1 = page.getByLabel(/Longitude|經度/i).first();
    const reasonInput1 = page
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .first();

    // Fallback UI doesn't automatically show fields unless manual reason is required.
    // Tenant form doesn't require manual reason, so we have to explicitly click the button.
    const manualButtons = page.getByRole("button", {
      name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
    });
    
    await expect(async () => {
      expect(
        (await manualButtons.first().isVisible()) ||
          (await latInput1.isVisible())
      ).toBeTruthy();
    }).toPass({ timeout: 30000 });
    
    if (await manualButtons.first().isVisible()) {
      await manualButtons.first().click();
    }
    await latInput1.fill("25.047");
    await lngInput1.fill("121.517");
    await reasonInput1.fill("Manual pickup");
    await page
      .getByRole("button", { name: /Use this location/ })
      .first()
      .click();

    const latInput2 = page.getByLabel(/Latitude|緯度/i).last();
    const lngInput2 = page.getByLabel(/Longitude|經度/i).last();
    const reasonInput2 = page
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .last();
      
    await expect(async () => {
      expect(
        (await manualButtons.last().isVisible()) ||
          (await latInput2.isVisible())
      ).toBeTruthy();
    }).toPass({ timeout: 30000 });
    
    if (await manualButtons.last().isVisible()) {
      await manualButtons.last().click();
    }
    await latInput2.fill("25.0797");
    await lngInput2.fill("121.2342");
    await reasonInput2.fill("Manual dropoff");
    await page
      .getByRole("button", { name: /Use this location/ })
      .last()
      .click();

    await fillProgramFields(page);
    await expect(
      page.getByText("Inside the service area", { exact: false }),
    ).toBeVisible();

    // In outage, Tenant must explicitly block rather than falling back to normal booking
    const submitBtn = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車|送出 command/,
    });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();

    // Simulate recovery
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: {
          provider: "mock",
          mode: "mock",
          status: "healthy",
          failClosed: false,
        },
      }),
    );
    // Trigger a refresh or re-eval (e.g. by modifying a field or clicking refresh)
    await page.getByRole("button", { name: /Refresh|刷新|更新/i }).click();
    await page.waitForTimeout(500);

    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await page.waitForTimeout(500); // give time for route
    expect(submitPayload).toBeTruthy();
    expect(submitPayload!.mapFallbackReview).toBeUndefined();
  });

  test("AddressMapField allows interactive edit and save", async ({ page }) => {
    // Stub the map provider for the portal
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: {
          provider: "mock",
          mode: "mock",
          status: "healthy",
          failClosed: false,
        },
      }),
    );

    await page.goto("http://127.0.0.1:3305/addresses");

    // Wait for the address list to load
    await expect(page.getByText("Mock Address", { exact: true }).first()).toBeVisible({ timeout: 30000 });

    // Click the Edit link for the mocked address
    await page.getByRole('link', { name: 'Edit' }).first().click();

    await expect(page.getByText("Edit Address: Mock Address")).toBeVisible();

    // Verify existing coordinates are loaded in hidden fields if they exist
    const latHidden = page.locator('input[name="lat"]');
    await expect(latHidden).toHaveValue("25.033");

    // Click to add/edit manual coordinates
    const manualButtons = page.getByRole("button", {
      name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
    });

    await manualButtons.first().click();

    const latInput = page.getByLabel(/Latitude|緯度/i).first();
    const lngInput = page.getByLabel(/Longitude|經度/i).first();
    const reasonInput = page
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .first();

    await latInput.fill("24.7951");
    await lngInput.fill("121.0028");
    await reasonInput.fill("Test manual save");

    await page
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .first()
      .click();

    // Check hidden inputs are populated with new values
    await expect(latHidden).toHaveValue("24.7951");
    const lngHidden = page.locator('input[name="lng"]');
    await expect(lngHidden).toHaveValue("121.0028");
    const coordinateSourceHidden = page.locator('input[name="coordinateSource"]');
    await expect(coordinateSourceHidden).toHaveValue("manual_pin");

    await page.getByRole("button", { name: "Save Changes" }).dispatchEvent("click");
    
    // Wait for navigation back to addresses list or a success state
    await expect(page.getByText("Mock Address updated").first()).toBeVisible({ timeout: 10000 });
  });
});
